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

// 局部渐变：矩形（线性）或椭圆（径向）蒙版内应用 曝光/色温/色调（公式与 AdjustStage 一致）。
// q 为蒙版局部坐标（0~1，rect 内部），线性沿 q.x 形成 0→1 渐变并受 q.y 边缘衰减约束。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uCenter;   // 蒙版中心（UV，左下原点）
uniform vec2 uHalf;     // 半宽/半高
uniform vec2 uCosSin;   // 逆旋转
uniform float uType;    // 0 = linear, 1 = radial
uniform float uExposure;
uniform float uTemperature;
uniform float uTint;

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  vec2 d = vTexCoord - uCenter;
  vec2 p = vec2(uCosSin.x * d.x + uCosSin.y * d.y, -uCosSin.y * d.x + uCosSin.x * d.y);
  vec2 q = p / max(uHalf, vec2(1e-4)) + 0.5;
  float mask;
  if (uType < 0.5) {
    float along = clamp(q.x, 0.0, 1.0);
    float conf = smoothstep(0.0, 0.18, q.y) * (1.0 - smoothstep(0.82, 1.0, q.y));
    mask = along * conf;
  } else {
    mask = 1.0 - smoothstep(0.55, 1.0, length(q - 0.5) / 0.5);
  }
  vec3 a = c * exp2(uExposure);
  a.r += uTemperature * 0.06 * (1.0 - a.r * 0.5);
  a.b -= uTemperature * 0.06 * (1.0 - a.b * 0.5);
  a.r += uTint * 0.05;
  a.b += uTint * 0.05;
  a.g -= uTint * 0.05;
  outColor = vec4(mix(c, clamp(a, 0.0, 1.0), clamp(mask, 0.0, 1.0)), src.a);
}`;

/** 局部渐变 Stage：蒙版内应用曝光/色温/色调；未启用或全零参数直通 */
export class GradationStage implements RenderStage {
  public readonly name = 'gradation';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'GradationStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uCenter: this.bundle.uniform('uCenter'),
      uHalf: this.bundle.uniform('uHalf'),
      uCosSin: this.bundle.uniform('uCosSin'),
      uType: this.bundle.uniform('uType'),
      uExposure: this.bundle.uniform('uExposure'),
      uTemperature: this.bundle.uniform('uTemperature'),
      uTint: this.bundle.uniform('uTint'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const g = params.gradation;
    if (!g.enabled || (g.exposure === 0 && g.temperature === 0 && g.tint === 0)) return input;
    const gl = ctx.gl;
    this.ensure(gl);

    // 参数 y 以顶部为原点 → 纹理 UV 左下原点
    const cx = g.x + g.w / 2;
    const cy = 1 - (g.y + g.h / 2);
    const rad = (-g.rotation * Math.PI) / 180; // 逆变换用反向角

    const dst = acquireTarget(ctx, ctx.width, ctx.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, ctx.width, ctx.height);
      throw new Error('[GradationStage] FBO incomplete');
    }
    gl.viewport(0, 0, ctx.width, ctx.height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);
    gl.uniform2f(this.loc.uCenter, cx, cy);
    gl.uniform2f(this.loc.uHalf, Math.max(1e-4, g.w / 2), Math.max(1e-4, g.h / 2));
    gl.uniform2f(this.loc.uCosSin, Math.cos(rad), Math.sin(rad));
    gl.uniform1f(this.loc.uType, g.type === 'radial' ? 1 : 0);
    gl.uniform1f(this.loc.uExposure, g.exposure);
    gl.uniform1f(this.loc.uTemperature, g.temperature);
    gl.uniform1f(this.loc.uTint, g.tint);
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
