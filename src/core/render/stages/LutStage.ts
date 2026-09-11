import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams } from '@/types/EditParams';
import type { LutData } from '../lut/lutTypes';
import {
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
precision highp sampler3D;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform sampler3D uLut;
uniform float uStrength; // 0 ~ 1
uniform float uSize;     // LUT 边长

void main() {
  vec4 src = texture(uSource, vTexCoord);
  // 半 texel 偏移，避免边缘截断
  vec3 q = src.rgb * ((uSize - 1.0) / uSize) + (0.5 / uSize);
  vec3 graded = texture(uLut, q).rgb;
  outColor = vec4(mix(src.rgb, graded, uStrength), src.a);
}`;

/**
 * LUT Stage：3D 纹理查表 + 强度混合。
 * LUT 数据由上层（store / 导出 Worker）喂入，Stage 不做文件 IO：
 * 内置 LUT 从内存重建，外部 cube 由上层重新解析后喂入（含上下文恢复场景）。
 */
export class LutStage implements RenderStage {
  public readonly name = 'lut';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private lutTexture: WebGLTexture | null = null;
  private lutSize = 0;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'LutStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = gl.createFramebuffer();
    if (!this.fbo) throw new Error('[LutStage] createFramebuffer failed');
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uLut: this.bundle.uniform('uLut'),
      uStrength: this.bundle.uniform('uStrength'),
      uSize: this.bundle.uniform('uSize'),
    };
  }

  /** 替换当前 3D LUT；传 null 表示移除 */
  setLut(gl: WebGL2RenderingContext, lut: LutData | null): void {
    this.releaseLut();
    if (!lut) return;
    this.ensure(gl);
    const tex = gl.createTexture();
    if (!tex) throw new Error('[LutStage] createTexture 3D failed');
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, tex);
    // RGB 每像素 3 字节，行宽未必 4 字节对齐（如 size=17），必须把对齐设为 1
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGB8,
      lut.size,
      lut.size,
      lut.size,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      lut.data
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_3D, null);
    this.lutTexture = tex;
    this.lutSize = lut.size;
  }

  private releaseLut(): void {
    if (this.gl && this.lutTexture) this.gl.deleteTexture(this.lutTexture);
    this.lutTexture = null;
    this.lutSize = 0;
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const gl = ctx.gl;
    const l = params.lut;
    // 无 LUT 或强度为 0：直通（返回 input，管线不会删除它）
    if (!this.lutTexture || !l.id && !l.path || l.strength <= 0.001) {
      return input;
    }
    this.ensure(gl);
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
      throw new Error('[LutStage] FBO incomplete');
    }
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.uniform1i(this.loc.uLut, 1);
    gl.uniform1f(this.loc.uStrength, l.strength);
    gl.uniform1f(this.loc.uSize, this.lutSize);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return dst;
  }

  destroy(): void {
    this.releaseLut();
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
