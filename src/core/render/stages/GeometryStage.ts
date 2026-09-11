import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams } from '@/types/EditParams';
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
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
// x0, v0, w, h：裁剪框在 UV（左下原点）空间中的位置
uniform vec4 uCrop;
// cos(theta), sin(theta)，theta = 屏幕顺时针旋转角
uniform vec2 uCosSin;
// 水平/垂直翻转开关（0 或 1）
uniform vec2 uFlip;

void main() {
  vec2 p = vTexCoord;
  // 逆旋转：输出点 -> 旋转前局部坐标 a = R(theta) * (p - 0.5) + 0.5
  vec2 d = p - 0.5;
  float c = uCosSin.x;
  float s = uCosSin.y;
  vec2 a = vec2(c * d.x - s * d.y, s * d.x + c * d.y) + 0.5;
  // 逆翻转
  a = mix(a, 1.0 - a, uFlip);
  vec2 uv = uCrop.xy + a * uCrop.zw;
  if (a.x < 0.0 || a.x > 1.0 || a.y < 0.0 || a.y > 1.0) {
    // 任意角度旋转后留白：透明，导出 JPEG 时由 2D 合成层填黑
    outColor = vec4(0.0, 0.0, 0.0, 0.0);
  } else {
    outColor = texture(uSource, uv);
  }
}`;

/**
 * 几何 Stage：裁剪 / 旋转 / 水平垂直翻转。
 * 输出尺寸 = 裁剪框像素尺寸；每旋转 90° 的奇数倍交换宽高。
 * 通过就地改写 ctx.width/height 把新尺寸传递给后续 Stage（§11 待办方案）。
 */
export class GeometryStage implements RenderStage {
  public readonly name = 'geometry';
  private gl: WebGL2RenderingContext | null = null;
  private bundle: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  // uniform 定位缓存
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.bundle) return;
    this.gl = gl;
    this.bundle = createProgram(gl, VERT, FRAG, 'GeometryStage');
    const quad = createFullscreenQuad(gl, this.bundle.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = gl.createFramebuffer();
    if (!this.fbo) throw new Error('[GeometryStage] createFramebuffer failed');
    this.loc = {
      uSource: this.bundle.uniform('uSource'),
      uCrop: this.bundle.uniform('uCrop'),
      uCosSin: this.bundle.uniform('uCosSin'),
      uFlip: this.bundle.uniform('uFlip'),
    };
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const gl = ctx.gl;
    this.ensure(gl);
    const g = params.geometry;

    // 1. 计算输出尺寸
    const cropW = Math.max(1, Math.round(ctx.width * g.width));
    const cropH = Math.max(1, Math.round(ctx.height * g.height));
    const quadrants = Math.round(((g.rotation % 360) + 360) % 360 / 90) % 4;
    const swap = quadrants === 1 || quadrants === 3;
    const outW = swap ? cropH : cropW;
    const outH = swap ? cropW : cropH;

    // 2. 创建本帧输出纹理（尺寸随参数变化，由管线统一销毁）
    const dst = createRGBA8Texture(gl, outW, outH);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      dst,
      0
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteTexture(dst);
      throw new Error(`[GeometryStage] FBO incomplete: 0x${status.toString(16)}`);
    }
    gl.viewport(0, 0, outW, outH);

    // 3. 绘制（状态自包含）
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.loc.uSource, 0);

    // UI 裁剪框原点左上 -> UV 原点左下
    const v0 = 1 - g.y - g.height;
    gl.uniform4f(this.loc.uCrop, g.x, v0, g.width, g.height);
    const rad = (g.rotation * Math.PI) / 180;
    gl.uniform2f(this.loc.uCosSin, Math.cos(rad), Math.sin(rad));
    gl.uniform2f(this.loc.uFlip, g.flipH ? 1 : 0, g.flipV ? 1 : 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 4. 改写管线当前尺寸
    ctx.width = outW;
    ctx.height = outH;
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
