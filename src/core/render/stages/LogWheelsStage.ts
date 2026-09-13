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
import { SRGB_TRANSFER_GLSL } from '../chunks/colorSpace.glsl';

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Lift / Gamma / Gain 在 log2 光域运算：色轮 xy 转为色度方向，z 为亮度偏移。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
${SRGB_TRANSFER_GLSL}
const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 hsv2rgb(float hue, float sat) {
  float h = mod(hue, 360.0) / 60.0;
  float c = sat;
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  vec3 rgb;
  if (h < 1.0) rgb = vec3(c, x, 0.0);
  else if (h < 2.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb;
}

vec3 wheelColor(vec2 xy) {
  float sat = min(length(xy), 1.0);
  float hue = atan(xy.y, xy.x) * 57.2957795 + 360.0;
  vec3 col = hsv2rgb(hue, sat);
  return col - vec3(dot(col, LUMA));
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 lin = srgbToLinear(src.rgb);
  float y = dot(lin, LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.35, y);
  float hi = smoothstep(0.35, 0.8, y);
  float mid = clamp(1.0 - sh - hi, 0.0, 1.0);
  vec3 logC = log2(max(lin, vec3(1e-5)));
  logC += wheelColor(uLift.xy) * sh * 1.8 + vec3(uLift.z * sh * 0.7);
  logC += wheelColor(uGamma.xy) * mid * 1.5 + vec3(uGamma.z * mid * 0.7);
  logC += wheelColor(uGain.xy) * hi * 1.2 + vec3(uGain.z * hi * 0.7);
  outColor = vec4(clamp(linearToSrgb(exp2(logC)), 0.0, 1.0), src.a);
}`;

/** Log 色轮 Stage：Lift / Gamma / Gain 三组 RGB 色轮。 */
export class LogWheelsStage implements RenderStage {
  public readonly name = 'logWheels';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private isNeutral(p: EditParams): boolean {
    const w = p.logWheels;
    return !w?.enabled || (
      w.lift.x === 0 && w.lift.y === 0 && w.lift.luma === 0 &&
      w.gamma.x === 0 && w.gamma.y === 0 && w.gamma.luma === 0 &&
      w.gain.x === 0 && w.gain.y === 0 && w.gain.luma === 0
    );
  }

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'LogWheelsStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      source: this.bundle.uniform('uSource'),
      lift: this.bundle.uniform('uLift'),
      gamma: this.bundle.uniform('uGamma'),
      gain: this.bundle.uniform('uGain'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    if (this.isNeutral(params)) return input;
    const gl = ctx.gl;
    this.ensure(gl);
    const { width, height } = ctx;
    const dst = acquireTarget(ctx, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, width, height);
      throw new Error('[LogWheelsStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.source, 0);
    const w = params.logWheels;
    gl.uniform3f(this.loc.lift, w.lift.x, w.lift.y, w.lift.luma);
    gl.uniform3f(this.loc.gamma, w.gamma.x, w.gamma.y, w.gamma.luma);
    gl.uniform3f(this.loc.gain, w.gain.x, w.gain.y, w.gain.luma);
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
