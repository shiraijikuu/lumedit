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

// Soft Clip（软膝滚降）：在 sRGB 感知域把越过阈值的高光单调压缩、渐近到白，
// 把低于阈值的阴影对称抬离纯黑，阈值处 C1 连续（导数=1），替代「到 1/0 直接硬切」。
// 思想参考 DaVinci Soft Clip / darktable filmic（仅学原理自写）。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform float uHi;  // 高光滚降 0~1
uniform float uSh;  // 阴影滚降 0~1

// 高光软膝：[th,+∞) 单调压缩到 [th,1)，阈值处导数 1，渐近到 1（可救回超白）
float rollHigh(float x, float k) {
  if (k <= 0.001) return x;
  float th = 1.0 - 0.6 * k;
  float span = 1.0 - th;
  if (x <= th) return x;
  float over = x - th;
  return th + span * over / (span + over);
}
// 阴影软膝：(-∞,th] 对称压缩到 (0,th]，把死黑柔和抬离 0
float rollShadows(float x, float k) {
  if (k <= 0.001) return x;
  float th = 0.6 * k;
  if (x >= th) return x;
  float under = th - x;
  return th - th * under / (th + under);
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  c = vec3(rollHigh(c.r, uHi), rollHigh(c.g, uHi), rollHigh(c.b, uHi));
  c = vec3(rollShadows(c.r, uSh), rollShadows(c.g, uSh), rollShadows(c.b, uSh));
  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** Soft Clip Stage：管线末端（LUT 之后）高光/阴影软滚降；全 0 直通 */
export class ToneRollStage implements RenderStage {
  public readonly name = 'tonemap';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'ToneRollStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uHi: this.bundle.uniform('uHi'),
      uSh: this.bundle.uniform('uSh'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const t = params.tonemap;
    if (!t || (t.highlights <= 0.001 && t.shadows <= 0.001)) return input;
    const gl = ctx.gl;
    this.ensure(gl);
    const { width, height } = ctx;
    const dst = acquireTarget(ctx, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, width, height);
      throw new Error('[ToneRollStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);
    gl.uniform1f(this.loc.uHi, Math.max(0, Math.min(1, t.highlights)));
    gl.uniform1f(this.loc.uSh, Math.max(0, Math.min(1, t.shadows)));
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
