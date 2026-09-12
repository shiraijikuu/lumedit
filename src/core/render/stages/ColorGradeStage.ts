import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams } from '@/types/EditParams';
import {
  attachTextureToFBO,
  createFullscreenQuad,
  createProgram,
  createRGBA8Texture,
  type ProgramBundle,
} from '../gpuUtils';
import { acquireTarget, releaseTarget } from '../texturePool';

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 颜色分级：阴影 / 中间调 / 高光分别染色（去掉颜色的亮度分量，只叠加色度，保持明暗）
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec3 uSh;   // x=hue(0..360) y=sat(0..1) z=启用强度
uniform vec3 uMid;
uniform vec3 uHi;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 hsv2rgb(vec3 hsv) {
  float h = mod(hsv.x, 360.0) / 60.0;
  float s = hsv.y, v = hsv.z;
  float c = v * s;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  float m = v - c;
  vec3 rgb;
  if (h < 1.0) rgb = vec3(c, x, 0.0);
  else if (h < 2.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

vec3 chroma(float hue) {
  vec3 col = hsv2rgb(vec3(hue, 1.0, 1.0));
  return col - vec3(dot(col, LUMA)); // 去亮度 => 纯色度
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  float L = dot(c, LUMA);
  float mSh = 1.0 - smoothstep(0.3, 0.5, L);
  float mHi = smoothstep(0.5, 0.7, L);
  float mMid = clamp(1.0 - mSh - mHi, 0.0, 1.0);
  c += chroma(uSh.x) * uSh.y * mSh;
  c += chroma(uMid.x) * uMid.y * mMid;
  c += chroma(uHi.x) * uHi.y * mHi;
  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** 颜色分级 Stage（第二档） */
export class ColorGradeStage implements RenderStage {
  public readonly name = 'colorGrade';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'ColorGradeStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const g = params.colorGrade;
    if (g.shadows.sat === 0 && g.midtones.sat === 0 && g.highlights.sat === 0) return input;
    const gl = ctx.gl;
    this.ensure(gl);
    const { width, height } = ctx;

    const dst = acquireTarget(ctx, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, width, height);
      throw new Error('[ColorGradeStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.bundle!.uniform('uSource'), 0);
    gl.uniform3f(this.bundle!.uniform('uSh'), g.shadows.hue, g.shadows.sat, 0);
    gl.uniform3f(this.bundle!.uniform('uMid'), g.midtones.hue, g.midtones.sat, 0);
    gl.uniform3f(this.bundle!.uniform('uHi'), g.highlights.hue, g.highlights.sat, 0);
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
    this.vbo = null; this.vao = null; this.fbo = null; this.bundle = null;
    this.gl = null;
  }
}
