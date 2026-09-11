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

const FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform float uBrightness;   // -1 ~ 1
uniform float uContrast;     // 对比度系数 1 + contrast
uniform float uSaturation;   // 饱和度系数 1 + saturation
uniform float uExposure;     // EV 档
uniform float uTemperature;  // -1 冷 ~ 1 暖

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;

  // 曝光：EV 档线性缩放
  c *= exp2(uExposure);
  // 亮度：加性
  c += uBrightness;
  // 对比度：围绕 0.5
  c = (c - 0.5) * uContrast + 0.5;
  // 饱和度：基于 Rec.601 亮度
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, uSaturation);
  // 色温：暖加红减蓝 / 冷加蓝减红，亮部少染
  c.r += uTemperature * 0.06 * (1.0 - c.r * 0.5);
  c.b -= uTemperature * 0.06 * (1.0 - c.b * 0.5);

  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** 基础调色 Stage：亮度 / 对比度 / 饱和度 / 曝光 / 色温，输出尺寸不变 */
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
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1)); // 占位，每帧重挂
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uBrightness: this.bundle.uniform('uBrightness'),
      uContrast: this.bundle.uniform('uContrast'),
      uSaturation: this.bundle.uniform('uSaturation'),
      uExposure: this.bundle.uniform('uExposure'),
      uTemperature: this.bundle.uniform('uTemperature'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const gl = ctx.gl;
    this.ensure(gl);
    const a = params.adjust;
    const { width, height } = ctx;

    const dst = createRGBA8Texture(gl, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      dst,
      0
    );
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
    gl.uniform1f(this.loc.uBrightness, a.brightness);
    gl.uniform1f(this.loc.uContrast, 1 + a.contrast);
    gl.uniform1f(this.loc.uSaturation, 1 + a.saturation);
    gl.uniform1f(this.loc.uExposure, a.exposure);
    gl.uniform1f(this.loc.uTemperature, a.temperature);
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
