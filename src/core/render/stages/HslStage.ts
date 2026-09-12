import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams, HslHue } from '@/types/EditParams';
import { HSL_HUES } from '@/types/EditParams';
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

// 8 色相中心（度）：红 橙 黄 绿 青 蓝 紫 品
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform float uHue[8];
uniform float uSat[8];
uniform float uLum[8];
const float CENTERS[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 280.0, 320.0);
const float WIDTH = 60.0;

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

float hue2rgb(float p, float q, float t) {
  t = mod(t, 1.0);
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s <= 1e-5) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  float hk = h / 360.0;
  return vec3(
    hue2rgb(p, q, hk + 1.0 / 3.0),
    hue2rgb(p, q, hk),
    hue2rgb(p, q, hk - 1.0 / 3.0)
  );
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 hsl = rgb2hsl(src.rgb);
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int i = 0; i < 8; i++) {
    float diff = abs(mod(hsl.x - CENTERS[i] + 540.0, 360.0) - 180.0);
    float w = clamp(1.0 - diff / WIDTH, 0.0, 1.0);
    dh += w * uHue[i];
    ds += w * uSat[i];
    dl += w * uLum[i];
  }
  hsl.x = mod(hsl.x + dh * 30.0 + 360.0, 360.0);
  hsl.y = clamp(hsl.y * (1.0 + ds), 0.0, 1.0);
  hsl.z = clamp(hsl.z + dl * 0.5, 0.0, 1.0);
  outColor = vec4(clamp(hsl2rgb(hsl), 0.0, 1.0), src.a);
}`;

/** HSL 混色器 Stage（第二档，仅完整版挂载） */
export class HslStage implements RenderStage {
  public readonly name = 'hsl';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: { hue: WebGLUniformLocation | null; sat: WebGLUniformLocation | null; lum: WebGLUniformLocation | null; src: WebGLUniformLocation | null } = {
    hue: null, sat: null, lum: null, src: null,
  };

  private isNeutral(params: EditParams): boolean {
    return HSL_HUES.every((h) => {
      const c = params.hsl[h as HslHue];
      return c.hue === 0 && c.sat === 0 && c.lum === 0;
    });
  }

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'HslStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      src: this.bundle.uniform('uSource'),
      hue: this.bundle.uniform('uHue[0]'),
      sat: this.bundle.uniform('uSat[0]'),
      lum: this.bundle.uniform('uLum[0]'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    if (this.isNeutral(params)) return input;
    const gl = ctx.gl;
    this.ensure(gl);
    const { width, height } = ctx;
    const hue = new Float32Array(8);
    const sat = new Float32Array(8);
    const lum = new Float32Array(8);
    HSL_HUES.forEach((h, i) => {
      const c = params.hsl[h];
      hue[i] = c.hue; sat[i] = c.sat; lum[i] = c.lum;
    });

    const dst = createRGBA8Texture(gl, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteTexture(dst);
      throw new Error('[HslStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.src, 0);
    gl.uniform1fv(this.loc.hue, hue);
    gl.uniform1fv(this.loc.sat, sat);
    gl.uniform1fv(this.loc.lum, lum);
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
