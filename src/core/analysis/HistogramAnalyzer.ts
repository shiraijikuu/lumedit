// GPU 直方图分析：先降采样到 256×256，再读回并在 CPU 上做 O(65k) 统计。
// 256×256 的同步读回对自动优化是毫秒级操作，结果稳定且实现可控。

import {
  attachTextureToFBO,
  createFullscreenQuad,
  createProgram,
  createRGBA8Texture,
  type ProgramBundle,
} from '../render/gpuUtils';

export interface AnalysisResult {
  histogram: {
    luma: Uint32Array;
    r: Uint32Array;
    g: Uint32Array;
    b: Uint32Array;
  };
  blackPoint: { r: number; g: number; b: number };
  whitePoint: { r: number; g: number; b: number };
  averageColor: { r: number; g: number; b: number };
  contrastScore: number;
  isLowContrast: boolean;
  /** 辅助规则使用的额外指标 */
  meanLuma: number;
  meanSaturation: number;
}

const SAMPLE_SIZE = 256;
const SAMPLE_PIXELS = SAMPLE_SIZE * SAMPLE_SIZE;

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
void main() {
  outColor = texture(uSource, vTexCoord);
}`;

function emptyHistogram(): Uint32Array {
  return new Uint32Array(256);
}

function emptyResult(): AnalysisResult {
  return {
    histogram: { luma: emptyHistogram(), r: emptyHistogram(), g: emptyHistogram(), b: emptyHistogram() },
    blackPoint: { r: 0, g: 0, b: 0 },
    whitePoint: { r: 255, g: 255, b: 255 },
    averageColor: { r: 0, g: 0, b: 0 },
    contrastScore: 0,
    isLowContrast: true,
    meanLuma: 0,
    meanSaturation: 0,
  };
}

function percentile(hist: Uint32Array, ratio: number): number {
  const total = hist.reduce((sum, n) => sum + n, 0);
  if (!total) return 0;
  const target = total * ratio;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 纯函数：从 RGBA 字节统计直方图和自动优化指标。 */
export function analyzePixels(pixels: Uint8Array | Uint8ClampedArray): AnalysisResult {
  const luma = emptyHistogram();
  const rHist = emptyHistogram();
  const gHist = emptyHistogram();
  const bHist = emptyHistogram();
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let sumSat = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 8) continue;
    rHist[r]++;
    gHist[g]++;
    bHist[b]++;
    const l = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    luma[l]++;
    count++;
    sumR += r;
    sumG += g;
    sumB += b;
    sumLuma += l;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sumSat += max > 0 ? (max - min) / max : 0;
  }

  if (!count) return emptyResult();

  const lumaBlack = percentile(luma, 0.005);
  const lumaWhite = percentile(luma, 0.995);
  const contrastScore = clamp01((lumaWhite - lumaBlack) / 255);
  return {
    histogram: { luma, r: rHist, g: gHist, b: bHist },
    blackPoint: {
      r: percentile(rHist, 0.005),
      g: percentile(gHist, 0.005),
      b: percentile(bHist, 0.005),
    },
    whitePoint: {
      r: percentile(rHist, 0.995),
      g: percentile(gHist, 0.995),
      b: percentile(bHist, 0.995),
    },
    averageColor: {
      r: sumR / count / 255,
      g: sumG / count / 255,
      b: sumB / count / 255,
    },
    contrastScore,
    isLowContrast: contrastScore < 0.45,
    meanLuma: sumLuma / count / 255,
    meanSaturation: sumSat / count,
  };
}

/** 持有 WebGL 降采样资源的直方图分析器；每次分析后可 destroy。 */
export class HistogramAnalyzer {
  private gl: WebGL2RenderingContext | null = null;
  private program: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  private sourceLoc: WebGLUniformLocation | null = null;

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.program) return;
    this.gl = gl;
    this.program = createProgram(gl, VERT, FRAG, 'HistogramAnalyzer');
    const quad = createFullscreenQuad(gl, this.program.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.texture = createRGBA8Texture(gl, SAMPLE_SIZE, SAMPLE_SIZE);
    this.fbo = attachTextureToFBO(gl, this.texture);
    this.sourceLoc = this.program.uniform('uSource');
  }

  /** 把任意尺寸的预览纹理降采样到 256×256 并读取到 CPU 统计。 */
  analyze(
    gl: WebGL2RenderingContext,
    source: WebGLTexture,
    width: number,
    height: number
  ): AnalysisResult {
    if (width <= 0 || height <= 0) throw new Error('[HistogramAnalyzer] invalid source size');
    this.ensure(gl);

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevCull = gl.isEnabled(gl.CULL_FACE);
    const prevScissor = gl.isEnabled(gl.SCISSOR_TEST);

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.useProgram(this.program!.program);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform1i(this.sourceLoc, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const pixels = new Uint8Array(SAMPLE_PIXELS * 4);
      gl.readPixels(0, 0, SAMPLE_SIZE, SAMPLE_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return analyzePixels(pixels);
    } finally {
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
      if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
      if (prevCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
      if (prevScissor) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
    }
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.program) gl.deleteProgram(this.program.program);
    if (this.texture) gl.deleteTexture(this.texture);
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.vbo = null;
    this.fbo = null;
    this.texture = null;
    this.sourceLoc = null;
  }
}
