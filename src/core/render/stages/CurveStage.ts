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
import { bakeCurveLut, CURVE_LUT_SIZE, isIdentityCurve } from '../curveLut';

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// RGB 色调曲线：R 通道存主曲线，G/B/A 分别存 R/G/B 通道曲线；先主后通道
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform sampler2D uCurve;

float applyChan(float v, int chan) {
  float m = texture(uCurve, vec2(clamp(v, 0.0, 1.0), 0.5)).r; // 主曲线
  vec4 ch = texture(uCurve, vec2(clamp(m, 0.0, 1.0), 0.5));
  if (chan == 0) return ch.g;
  if (chan == 1) return ch.b;
  return ch.a;
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  c.r = applyChan(c.r, 0);
  c.g = applyChan(c.g, 1);
  c.b = applyChan(c.b, 2);
  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/** RGB 色调曲线 Stage（第一档）。默认线性时短路直通，零开销。 */
export class CurveStage implements RenderStage {
  public readonly name = 'curve';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutKey = '';

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'CurveStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
  }

  private uploadLut(gl: WebGL2RenderingContext, params: EditParams): void {
    const key = JSON.stringify(params.curve);
    if (this.lutTex && key === this.lutKey) return;
    const data = bakeCurveLut(params.curve);
    if (!this.lutTex) {
      this.lutTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, CURVE_LUT_SIZE, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.lutKey = key;
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    if (isIdentityCurve(params.curve)) return input; // 恒等直通
    const gl = ctx.gl;
    this.ensure(gl);
    this.uploadLut(gl, params);
    const { width, height } = ctx;

    const dst = acquireTarget(ctx, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      releaseTarget(ctx, dst, width, height);
      throw new Error('[CurveStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.bundle!.uniform('uSource'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(this.bundle!.uniform('uCurve'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return dst;
  }

  destroy(): void {
    if (!this.gl) return;
    if (this.vbo) this.gl.deleteBuffer(this.vbo);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.fbo) this.gl.deleteFramebuffer(this.fbo);
    if (this.lutTex) this.gl.deleteTexture(this.lutTex);
    if (this.bundle) this.gl.deleteProgram(this.bundle.program);
    this.vbo = null;
    this.vao = null;
    this.fbo = null;
    this.lutTex = null;
    this.bundle = null;
    this.lutKey = '';
    this.gl = null;
  }
}
