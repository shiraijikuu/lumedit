// 全分辨率导出 Worker：与预览相同的 WebGL2 几何/调色/LUT 管线（不含水印）。
// 水印（camera-watermark）在主线程通过离屏窗口合成，因此这里只输出无损的「调色后中间位图 PNG」，
// 由 exporter.ts 在主线程完成水印合成、最终格式编码与 EXIF 回注。
import type { EditParams } from '@/types/EditParams';
import type { ImageMeta } from '../image/imageLoader';
import { decodeFull } from '../image/imageLoader';
import { BlitProgram } from '../render/BlitProgram';
import { bitmapToTextureSource, detectFloatRenderTarget, createTargetTexture } from '../render/gpuUtils';
import { runPipeline } from '../render/renderPipeline';
import type { RenderContext } from '../render/RenderStage';
import { createEditStageBundle } from '../render/editStages';
import type { LutData } from '../render/lut/lutTypes';
import { encodePng16 } from './png16';

export type ExportFormat = 'jpeg' | 'png' | 'webp' | 'png16';

export interface ExportRequest {
  jobId: number;
  buffer: ArrayBuffer;
  meta: ImageMeta;
  params: EditParams;
  lut: LutData | null;
  format: ExportFormat;
  /** 0~1，jpeg/webp 使用（主线程最终编码用） */
  quality: number;
  keepExif: boolean;
  stripGps: boolean;
  /** 导出缩放（1 = 原始全分辨率，主线程使用） */
  scale: number;
}

/** Worker 回传的调色后中间位图（无损 PNG） */
export interface ExportResponse {
  jobId: number;
  ok: boolean;
  bytes?: Uint8Array;
  width?: number;
  height?: number;
  error?: string;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function uploadInputTexture(
  gl: WebGL2RenderingContext,
  bitmap: ImageBitmap
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('导出线程：输入纹理创建失败');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // 同 ImageRenderer：ImageBitmap 源在 ANGLE 下 UNPACK_FLIP_Y 失效，须转 Canvas 源
  const source = bitmapToTextureSource(bitmap);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/** 16bit PNG 读回：blit 到浮点目标（与 8bit 同一坐标映射）→ FLOAT 读回 → 顶起翻转 → 编码 */
function readBackPng16(
  gl: WebGL2RenderingContext,
  blit: BlitProgram,
  source: WebGLTexture,
  w: number,
  h: number,
  useFloat: boolean
): Uint8Array {
  const dst = createTargetTexture(gl, w, h, useFloat ? 'rgba16f' : 'rgba8');
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('16bit 导出：FBO 创建失败');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('16bit 导出：读回目标不完整');
  }
  gl.viewport(0, 0, w, h);
  blit.draw(gl, source);

  const rgb16 = new Uint16Array(w * h * 3);
  if (useFloat) {
    const buf = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);
    // 输入纹理上传时已 UNPACK_FLIP_Y，readPixels 行序即图像顶起顺序，直接编码、不再翻转
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = (y * w + x) * 3;
        rgb16[di] = Math.max(0, Math.min(65535, Math.round(buf[si] * 65535)));
        rgb16[di + 1] = Math.max(0, Math.min(65535, Math.round(buf[si + 1] * 65535)));
        rgb16[di + 2] = Math.max(0, Math.min(65535, Math.round(buf[si + 2] * 65535)));
      }
    }
  } else {
    // 不支持浮点渲染：8bit 读回后等比扩展到 16bit（文件合法，但无额外精度）
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = (y * w + x) * 3;
        rgb16[di] = buf[si] * 257;
        rgb16[di + 1] = buf[si + 1] * 257;
        rgb16[di + 2] = buf[si + 2] * 257;
      }
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(dst);
  return encodePng16(rgb16, w, h, 3);
}

async function renderEditedPng(req: ExportRequest): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await decodeFull(req.buffer, req.meta);

  const glCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const gl = glCanvas.getContext('webgl2', {
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('导出线程不支持 WebGL2');
  // 与预览一致：支持浮点颜色缓冲时中间纹理用 RGBA16F，导出也享受高精度（末端 blit 到 8bit 画布自动量化）
  const targetFormat = detectFloatRenderTarget(gl) ? 'rgba16f' : 'rgba8';

  const inputTex = uploadInputTexture(gl, bitmap);
  // 与预览完全相同的档位管线（几何→影调→曲线→[二档]→LUT）
  const bundle = createEditStageBundle();
  if (req.lut) bundle.lut.setLut(gl, req.lut);
  // 水印不在 WebGL 管线内：camera-watermark 在主线程离屏窗口作为最后一步合成
  const stages = bundle.ordered;

  const context: RenderContext = { gl, width: bitmap.width, height: bitmap.height, targetFormat };
  const out = runPipeline(gl, stages, inputTex, req.params, context);

  const blit = new BlitProgram();
  let bytes: Uint8Array;
  if (req.format === 'png16') {
    // 16bit/通道 PNG：浮点读回 + 手写编码器；不经 8bit canvas，因此不支持水印/缩放（主线程旁路）
    bytes = readBackPng16(gl, blit, out.texture, out.width, out.height, targetFormat === 'rgba16f');
  } else {
    glCanvas.width = out.width;
    glCanvas.height = out.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, out.width, out.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    blit.draw(gl, out.texture);
    // 统一以无损 PNG 交回主线程，避免两次有损编码
    const blob = await glCanvas.convertToBlob({ type: 'image/png' });
    bytes = new Uint8Array(await blob.arrayBuffer());
  }

  stages.forEach((s) => s.destroy());
  blit.destroy();
  gl.deleteTexture(inputTex);
  if (out.texture !== inputTex) gl.deleteTexture(out.texture);
  bitmap.close();

  return {
    bytes,
    width: out.width,
    height: out.height,
  };
}

workerScope.onmessage = async (e: MessageEvent<ExportRequest>) => {
  const req = e.data;
  try {
    const result = await renderEditedPng(req);
    const resp: ExportResponse = {
      jobId: req.jobId,
      ok: true,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    };
    workerScope.postMessage(resp, [result.bytes.buffer]);
  } catch (err) {
    const resp: ExportResponse = {
      jobId: req.jobId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    workerScope.postMessage(resp);
  }
};
