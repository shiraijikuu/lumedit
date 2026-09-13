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

// HSL 取色限定器（二级调色）：按像素色相与中心色相的环形距离生成平滑选区，
// 仅在选区内做曝光/色温/饱和度。曝光/白平衡在线性光域（与 AdjustStage 一致）。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform float uCenter;     // 中心色相 0~360
uniform float uRange;      // 选中半宽（度）
uniform float uFeather;    // 边界柔化（度）
uniform float uExposure;
uniform float uTemp;
uniform float uSat;
${SRGB_TRANSFER_GLSL}

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if (d > 1e-5) {
    s = d / (1.0 - abs(2.0 * l - 1.0) + 1e-5);
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
  }
  return vec3(h, s, l);
}

float hueDist(float a, float b) {
  float d = abs(a - b);
  return min(d, 360.0 - d);
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  vec3 hsl = rgb2hsl(c);
  float dh = hueDist(hsl.x, uCenter);
  // [0, range-feather] 全选，[range-feather, range+feather] 平滑衰减到 0
  float inner = max(uRange - uFeather, 0.0);
  float outer = uRange + uFeather;
  float mask = 1.0 - smoothstep(inner, outer, dh);
  // 灰/黑/白（无彩色）不参与色相选择
  mask *= smoothstep(0.02, 0.08, hsl.y);

  vec3 lin = srgbToLinear(c) * exp2(uExposure);
  lin.r *= 1.0 + uTemp * 0.12;
  lin.b *= 1.0 - uTemp * 0.12;
  vec3 a = linearToSrgb(max(lin, 0.0));
  float L = dot(a, vec3(0.299, 0.587, 0.114));
  a = mix(vec3(L), a, 1.0 + uSat);

  outColor = vec4(mix(c, clamp(a, 0.0, 1.0), mask), src.a);
}`;

/** HSL 取色限定器 Stage（完整版二级调色）；未启用或无调整时直通 */
export class QualifierStage implements RenderStage {
  public readonly name = 'qualifier';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'QualifierStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uCenter: this.bundle.uniform('uCenter'),
      uRange: this.bundle.uniform('uRange'),
      uFeather: this.bundle.uniform('uFeather'),
      uExposure: this.bundle.uniform('uExposure'),
      uTemp: this.bundle.uniform('uTemp'),
      uSat: this.bundle.uniform('uSat'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const q = params.qualifier;
    const idle = !q || !q.enabled || (q.exposure === 0 && q.temperature === 0 && q.saturation === 0);
    if (idle) return input;
    const gl = ctx.gl;
    this.ensure(gl);
    const { width, height } = ctx;
    const dst = acquireTarget(ctx, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, width, height);
      throw new Error('[QualifierStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);
    gl.uniform1f(this.loc.uCenter, q.centerHue);
    gl.uniform1f(this.loc.uRange, q.hueRange);
    gl.uniform1f(this.loc.uFeather, q.hueFeather);
    gl.uniform1f(this.loc.uExposure, q.exposure);
    gl.uniform1f(this.loc.uTemp, q.temperature);
    gl.uniform1f(this.loc.uSat, q.saturation);
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
