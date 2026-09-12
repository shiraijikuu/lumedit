import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams } from '@/types/EditParams';
import {
  attachTextureToFBO,
  createFullscreenQuad,
  createProgram,
  createRGBA8Texture,
  type ProgramBundle,
} from '../gpuUtils';

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 第一档基础影调：曝光 / 白平衡(色温+色调) / 亮度 / 高光阴影白色黑色 /
// 对比度 / 清晰度 / 去朦胧 / 饱和度 / 自然饱和度。clarity/dehaze 用 3x3 邻域。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uHighlights, uShadows, uWhites, uBlacks;
uniform float uTemperature, uTint, uClarity, uDehaze;
uniform float uSaturation, uVibrance;

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vTexCoord;
  vec4 src = texture(uSource, uv);
  vec3 c = src.rgb;

  // 3x3 局部均值（清晰度 / 去朦胧用）
  vec3 localC = vec3(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      localC += texture(uSource, uv + vec2(float(x), float(y)) * uTexel).rgb;
    }
  }
  localC /= 9.0;

  // 1. 曝光：EV 档线性缩放
  c *= exp2(uExposure);

  // 2. 白平衡：色温（暖 r+ b-）/ 色调（品 r,b+ g-，绿反向）
  c.r += uTemperature * 0.06 * (1.0 - c.r * 0.5);
  c.b -= uTemperature * 0.06 * (1.0 - c.b * 0.5);
  c.r += uTint * 0.05;
  c.b += uTint * 0.05;
  c.g -= uTint * 0.05;

  // 3. 亮度（加性）
  c += uBrightness;

  // 4. 影调四区：按当前亮度加权
  float L0 = luma(c);
  float mHi = smoothstep(0.5, 1.0, L0);
  float mSh = 1.0 - smoothstep(0.0, 0.5, L0);
  float mWh = smoothstep(0.7, 1.0, L0);
  float mBl = 1.0 - smoothstep(0.0, 0.3, L0);
  c += uHighlights * 0.5 * mHi;
  c += uShadows * 0.5 * mSh;
  c += uWhites * 0.5 * mWh;
  c += uBlacks * 0.5 * mBl;

  // 5. 对比度（绕 0.5）
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;

  // 6. 清晰度（局部对比）+ 去朦胧（更强局部对比 + 全局通透）
  float detailAmt = uClarity * 0.55 + uDehaze * 0.8;
  c += (c - localC) * detailAmt;
  c = (c - 0.5) * (1.0 + uDehaze * 0.22) + 0.5;

  // 7. 饱和度（线性）+ 自然饱和度（欠饱和增益更大）
  float L1 = luma(c);
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float curSat = mx - mn;
  float vib = uVibrance * (1.0 - clamp(curSat, 0.0, 1.0));
  c = mix(vec3(L1), c, 1.0 + uSaturation + vib);

  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** 基础影调 Stage，输出尺寸不变 */
export class AdjustStage implements RenderStage {
  public readonly name = 'adjust';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'AdjustStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uTexel: this.bundle.uniform('uTexel'),
      uExposure: this.bundle.uniform('uExposure'),
      uBrightness: this.bundle.uniform('uBrightness'),
      uContrast: this.bundle.uniform('uContrast'),
      uHighlights: this.bundle.uniform('uHighlights'),
      uShadows: this.bundle.uniform('uShadows'),
      uWhites: this.bundle.uniform('uWhites'),
      uBlacks: this.bundle.uniform('uBlacks'),
      uTemperature: this.bundle.uniform('uTemperature'),
      uTint: this.bundle.uniform('uTint'),
      uClarity: this.bundle.uniform('uClarity'),
      uDehaze: this.bundle.uniform('uDehaze'),
      uSaturation: this.bundle.uniform('uSaturation'),
      uVibrance: this.bundle.uniform('uVibrance'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const gl = ctx.gl;
    this.ensure(gl);
    const a = params.adjust;
    const { width, height } = ctx;

    const dst = createRGBA8Texture(gl, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteTexture(dst);
      throw new Error('[AdjustStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);
    gl.uniform2f(this.loc.uTexel, 1 / width, 1 / height);
    gl.uniform1f(this.loc.uExposure, a.exposure);
    gl.uniform1f(this.loc.uBrightness, a.brightness);
    gl.uniform1f(this.loc.uContrast, a.contrast);
    gl.uniform1f(this.loc.uHighlights, a.highlights);
    gl.uniform1f(this.loc.uShadows, a.shadows);
    gl.uniform1f(this.loc.uWhites, a.whites);
    gl.uniform1f(this.loc.uBlacks, a.blacks);
    gl.uniform1f(this.loc.uTemperature, a.temperature);
    gl.uniform1f(this.loc.uTint, a.tint);
    gl.uniform1f(this.loc.uClarity, a.clarity);
    gl.uniform1f(this.loc.uDehaze, a.dehaze);
    gl.uniform1f(this.loc.uSaturation, a.saturation);
    gl.uniform1f(this.loc.uVibrance, a.vibrance);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return dst;
  }

  destroy(): void {
    if (!this.gl) return;
    if (this.vbo) this.gl.deleteBuffer(this.vbo);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.fbo) this.gl.deleteFramebuffer(this.fbo);
    if (this.bundle) this.gl.deleteProgram(this.bundle.program);
    this.vbo = null;
    this.vao = null;
    this.fbo = null;
    this.bundle = null;
    this.loc = {};
    this.gl = null;
  }
}
