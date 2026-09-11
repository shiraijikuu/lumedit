// 全分辨率导出 Worker：与预览相同的 WebGL2 几何/调色/LUT 管线（不含水印）。
// 水印（camera-watermark）在主线程通过离屏窗口合成，因此这里只输出无损的「调色后中间位图 PNG」，
// 由 exporter.ts 在主线程完成水印合成、最终格式编码与 EXIF 回注。
import type { EditParams } from '@/types/EditParams';
import type { ImageMeta } from '../image/imageLoader';
import { decodeFull } from '../image/imageLoader';
import { BlitProgram } from '../render/BlitProgram';
import { bitmapToTextureSource } from '../render/gpuUtils';
import { runPipeline } from '../render/renderPipeline';
import type { RenderContext } from '../render/RenderStage';
import { GeometryStage } from '../render/stages/GeometryStage';
import { AdjustStage } from '../render/stages/AdjustStage';
import { LutStage } from '../render/stages/LutStage';
import type { LutData } from '../render/lut/lutTypes';

export type ExportFormat = 'jpeg' | 'png' | 'webp';

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

async function renderEditedPng(req: ExportRequest): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await decodeFull(req.buffer, req.meta);

  const glCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const gl = glCanvas.getContext('webgl2', {
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('导出线程不支持 WebGL2');

  const inputTex = uploadInputTexture(gl, bitmap);
  const geometry = new GeometryStage();
  const adjust = new AdjustStage();
  const lutStage = new LutStage();
  if (req.lut) lutStage.setLut(gl, req.lut);
  // 水印不在 WebGL 管线内：camera-watermark 在主线程离屏窗口作为最后一步合成
  const stages = [geometry, adjust, lutStage];

  const context: RenderContext = { gl, width: bitmap.width, height: bitmap.height };
  const out = runPipeline(gl, stages, inputTex, req.params, context);

  glCanvas.width = out.width;
  glCanvas.height = out.height;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, out.width, out.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const blit = new BlitProgram();
  blit.draw(gl, out.texture);

  // 统一以无损 PNG 交回主线程，避免两次有损编码
  const blob = await glCanvas.convertToBlob({ type: 'image/png' });

  stages.forEach((s) => s.destroy());
  blit.destroy();
  gl.deleteTexture(inputTex);
  if (out.texture !== inputTex) gl.deleteTexture(out.texture);
  bitmap.close();

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
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
