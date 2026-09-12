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

// 效果：晕影 / 颗粒 / 锐化(unsharp) / 降噪(局部均值混合)。锐化降噪共用一次 3x3。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uAspect;
uniform float uVignette;
uniform float uGrain;
uniform float uSharpen;
uniform float uDenoise;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vTexCoord;
  vec4 src = texture(uSource, uv);
  vec3 c = src.rgb;

  vec3 mean = vec3(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      mean += texture(uSource, uv + vec2(float(x), float(y)) * uTexel).rgb;
    }
  }
  mean /= 9.0;

  // 锐化：反遮罩；降噪：向局部均值靠拢
  vec3 sharp = c + (c - mean) * uSharpen * 2.0;
  c = mix(sharp, mean, uDenoise * 0.5);

  // 晕影（正=暗角，负=白角），按宽高比修正为正圆
  vec2 p = uv - 0.5;
  p.x /= max(uAspect, 1e-3);
  float r = length(p);
  float vig = smoothstep(0.95, 0.35, r);
  c *= 1.0 - uVignette * (1.0 - vig);

  // 颗粒（静态噪声，符合「参数变化才渲染」架构）
  float n = hash(gl_FragCoord.xy);
  c += (n - 0.5) * uGrain * 0.18;

  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** 效果 Stage（第二档） */
export class EffectsStage implements RenderStage {
  public readonly name = 'effects';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'EffectsStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uTexel: this.bundle.uniform('uTexel'),
      uAspect: this.bundle.uniform('uAspect'),
      uVignette: this.bundle.uniform('uVignette'),
      uGrain: this.bundle.uniform('uGrain'),
      uSharpen: this.bundle.uniform('uSharpen'),
      uDenoise: this.bundle.uniform('uDenoise'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const e = params.effects;
    if (e.vignette === 0 && e.grain === 0 && e.sharpen === 0 && e.denoise === 0) return input;
    const gl = ctx.gl;
    this.ensure(gl);
    const { width, height } = ctx;

    const dst = acquireTarget(ctx, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, width, height);
      throw new Error('[EffectsStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);
    gl.uniform2f(this.loc.uTexel, 1 / width, 1 / height);
    gl.uniform1f(this.loc.uAspect, width / height);
    gl.uniform1f(this.loc.uVignette, e.vignette);
    gl.uniform1f(this.loc.uGrain, e.grain);
    gl.uniform1f(this.loc.uSharpen, e.sharpen);
    gl.uniform1f(this.loc.uDenoise, e.denoise);
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
    this.loc = {};
    this.gl = null;
  }
}
