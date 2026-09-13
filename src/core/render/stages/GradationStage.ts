import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams, GradationParams } from '@/types/EditParams';
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

// 局部渐变：矩形（线性）或椭圆（径向）蒙版内应用 曝光/色温/色调（公式与 AdjustStage 一致，线性光域）。
// q 为蒙版局部坐标（0~1，rect 内部），线性沿 q.x 形成 0→1 渐变并受 q.y 边缘衰减约束。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uP1;       // 线段起点（UV，左下原点）：linear=渐变起点，radial=圆心
uniform vec2 uP2;       // 线段终点：linear=渐变终点（全量侧），radial=蒙版边缘点
uniform float uType;    // 0 = linear, 1 = radial
uniform float uExposure;
uniform float uTemperature;
uniform float uTint;
${SRGB_TRANSFER_GLSL}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  vec2 dir = uP2 - uP1;
  float len2 = max(dot(dir, dir), 1e-6);
  float t = dot(vTexCoord - uP1, dir) / len2;
  float mask;
  if (uType < 0.5) {
    // 线性：沿线段 0→1 投影渐变，两端之外钳制，垂直方向无限延伸（PS/darktable 语义）
    mask = clamp(t, 0.0, 1.0);
  } else {
    // 径向：圆心全量，到边缘点距离处衰减到 0
    mask = 1.0 - smoothstep(0.55, 1.0, length(vTexCoord - uP1) / sqrt(len2));
  }
  // 曝光/白平衡与 AdjustStage 一致：在线性光域做光量运算后转回 sRGB
  vec3 al = srgbToLinear(c) * exp2(uExposure);
  al.r *= 1.0 + uTemperature * 0.12;
  al.b *= 1.0 - uTemperature * 0.12;
  al.r *= 1.0 + uTint * 0.10;
  al.b *= 1.0 + uTint * 0.10;
  al.g *= 1.0 - uTint * 0.10;
  vec3 a = linearToSrgb(max(al, 0.0));
  outColor = vec4(mix(c, clamp(a, 0.0, 1.0), clamp(mask, 0.0, 1.0)), src.a);
}`;

/**
 * 局部渐变 Stage：支持多个线性/径向蒙版叠加（v0.4.0，上限 MAX_GRADATIONS）。
 * 每个有效蒙版一次 pass，上一张中间纹理在被消费后立即归还纹理池；
 * 兼容旧版单个 params.gradation 字段（无 gradations 数组时回退）。无有效蒙版直通。
 */
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
      uP1: this.bundle.uniform('uP1'),
      uP2: this.bundle.uniform('uP2'),
      uType: this.bundle.uniform('uType'),
      uExposure: this.bundle.uniform('uExposure'),
      uTemperature: this.bundle.uniform('uTemperature'),
      uTint: this.bundle.uniform('uTint'),
    };
  }

  /** 收集当前生效的蒙版列表（新数组优先，回退旧单字段） */
  private activeMasks(params: EditParams): GradationParams[] {
    const source: GradationParams[] =
      Array.isArray(params.gradations) && params.gradations.length
        ? params.gradations
        : params.gradation?.enabled
          ? [params.gradation]
          : [];
    return source.filter(
      (g) => g.enabled && (g.exposure !== 0 || g.temperature !== 0 || g.tint !== 0)
    );
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const masks = this.activeMasks(params);
    if (masks.length === 0) return input;
    const gl = ctx.gl;
    this.ensure(gl);

    let tex = input;
    gl.useProgram(this.bundle!.program);
    gl.bindVertexArray(this.vao);

    for (const g of masks) {
      const dst = acquireTarget(ctx, ctx.width, ctx.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        releaseTarget(ctx, dst, ctx.width, ctx.height);
        throw new Error('[GradationStage] FBO incomplete');
      }
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.loc.uSource, 0);
      // 参数 y 以顶部为原点 → 纹理 UV 左下原点
      gl.uniform2f(this.loc.uP1, g.x1, 1 - g.y1);
      gl.uniform2f(this.loc.uP2, g.x2, 1 - g.y2);
      gl.uniform1f(this.loc.uType, g.type === 'radial' ? 1 : 0);
      gl.uniform1f(this.loc.uExposure, g.exposure);
      gl.uniform1f(this.loc.uTemperature, g.temperature);
      gl.uniform1f(this.loc.uTint, g.tint);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 上一张中间纹理已被消费，立即归还池复用（input 永不归还）
      if (tex !== input) releaseTarget(ctx, tex, ctx.width, ctx.height);
      tex = dst;
    }

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return tex;
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
