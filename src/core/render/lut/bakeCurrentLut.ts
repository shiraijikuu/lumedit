// 把当前调色（影调/曲线/HSL/分级，逐像素操作）经 GPU 烘焙为 17³ .cube LUT 文本。
// 做法：生成一张编码恒等网格的源图（红最快、绿次之、蓝最慢），跑与预览完全相同的
// WebGL Stage，回读像素即得「输入色 → 输出色」映射，保证与预览所见零漂移。
// 空间域操作（清晰度/去朦胧/晕影/颗粒/锐化/降噪）无法烘进 LUT，烘焙时强制置 0。
import type { EditParams } from '@/types/EditParams';
import { cloneParams } from '@/types/EditParams';
import { runPipeline } from '../renderPipeline';
import type { RenderContext } from '../RenderStage';
import { attachTextureToFBO, bitmapToTextureSource } from '../gpuUtils';
import { AdjustStage } from '../stages/AdjustStage';
import { CurveStage } from '../stages/CurveStage';
import { HslStage } from '../stages/HslStage';
import { ColorGradeStage } from '../stages/ColorGradeStage';

const SIZE = 17;
const W = SIZE * SIZE; // 289：x = g*17 + r（红最快）
const H = SIZE; // y：蓝最慢

/** 上传位图到纹理（与 ImageRenderer/exportWorker 相同的 flipY 处理） */
function uploadTexture(gl: WebGL2RenderingContext, bitmap: ImageBitmap): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('bakeLut: createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
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

export async function bakeLutFromParams(params: EditParams): Promise<string> {
  // 1) 生成恒等网格源图（b 自上而下递增；上传时 flipY 会在回读端补偿）
  const src = new OffscreenCanvas(W, H);
  const ctx = src.getContext('2d');
  if (!ctx) throw new Error('bakeLut: 2d context failed');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      img.data[o] = Math.round(((x % SIZE) / (SIZE - 1)) * 255);
      img.data[o + 1] = Math.round((Math.floor(x / SIZE) / (SIZE - 1)) * 255);
      img.data[o + 2] = Math.round((y / (SIZE - 1)) * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const bitmap = await createImageBitmap(src);

  // 2) 离线 WebGL：仅逐像素 Stage（清晰度/去朦胧置 0——空间域无法烘进 LUT）
  const glCanvas = new OffscreenCanvas(W, H);
  const gl = glCanvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('bakeLut: WebGL2 unavailable');

  const inputTex = uploadTexture(gl, bitmap);
  const adjust = new AdjustStage();
  const curve = new CurveStage();
  const hsl = new HslStage();
  const grade = new ColorGradeStage();
  const bakeParams = cloneParams(params);
  bakeParams.adjust.clarity = 0;
  bakeParams.adjust.dehaze = 0;

  const context: RenderContext = { gl, width: W, height: H };
  const out = runPipeline(gl, [adjust, curve, hsl, grade], inputTex, bakeParams, context);

  let fbo: WebGLFramebuffer | null = null;
  try {
    fbo = attachTextureToFBO(gl, out.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const pixels = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 3) 组装 .cube：标准顺序红最快、绿次之、蓝最慢；readPixels 行 0 = 纹理底部
    const lines: string[] = [
      `TITLE "LumEdit grading ${new Date().toISOString().slice(0, 10)}"`,
      `LUT_3D_SIZE ${SIZE}`,
      'DOMAIN_MIN 0 0 0',
      'DOMAIN_MAX 1 1 1',
    ];
    const f = (v: number) => (v / 255).toFixed(6);
    for (let b = 0; b < SIZE; b++) {
      for (let g = 0; g < SIZE; g++) {
        for (let r = 0; r < SIZE; r++) {
          const x = g * SIZE + r;
          const j = SIZE - 1 - b; // flipY 补偿
          const o = (j * W + x) * 4;
          lines.push(`${f(pixels[o])} ${f(pixels[o + 1])} ${f(pixels[o + 2])}`);
        }
      }
    }
    return lines.join('\n') + '\n';
  } finally {
    if (fbo) gl.deleteFramebuffer(fbo);
    if (out.texture !== inputTex) gl.deleteTexture(out.texture);
    gl.deleteTexture(inputTex);
    adjust.destroy();
    curve.destroy();
    hsl.destroy();
    grade.destroy();
    bitmap.close();
  }
}
