import type { RenderStage, RenderContext } from '../RenderStage';
import type { BlendLayer, EditParams } from '@/types/EditParams';
import { BLEND_MODES } from '@/types/EditParams';
import {
  attachTextureToFBO,
  bitmapToTextureSource,
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

// 底图 uBase + 叠加图层 uLayer；图层按中心/缩放/旋转/翻转做 contain 映射，再按混合模式与不透明度合成。
// 混合公式对齐 W3C Compositing（与 Canvas2D globalCompositeOperation 一致）。
const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uLayer;
uniform vec2 uCenter;   // 图层中心（归一化）
uniform vec2 uSize;     // 图层 contain 铺满后占画面的归一化宽/高（已乘 scale）
uniform float uRot;     // 视觉顺时针旋转（弧度，y-up 坐标内取正角逆变换）
uniform float uOpacity;
uniform int uMode;      // BLEND_MODES 索引
uniform float uFlipH;
uniform float uFlipV;

float dodge(float a, float b) {
  if (a <= 0.0) return 0.0;
  if (b >= 1.0) return 1.0;
  return min(a / max(1.0 - b, 1e-5), 1.0);
}
float burn(float a, float b) {
  if (a >= 1.0) return 1.0;
  if (b <= 0.0) return 0.0;
  return 1.0 - min((1.0 - a) / max(b, 1e-5), 1.0);
}

vec3 blendMode(vec3 a, vec3 b, int m) {
  if (m == 1) return a * b;                                            // multiply
  if (m == 2) return 1.0 - (1.0 - a) * (1.0 - b);                      // screen
  if (m == 3) // overlay（按基色 a 分支）
    return vec3(
      a.r < 0.5 ? 2.0*a.r*b.r : 1.0-2.0*(1.0-a.r)*(1.0-b.r),
      a.g < 0.5 ? 2.0*a.g*b.g : 1.0-2.0*(1.0-a.g)*(1.0-b.g),
      a.b < 0.5 ? 2.0*a.b*b.b : 1.0-2.0*(1.0-a.b)*(1.0-b.b));
  if (m == 4) { // soft-light（W3C）
    vec3 d = vec3(
      a.r <= 0.25 ? ((16.0*a.r-12.0)*a.r+4.0)*a.r : sqrt(a.r),
      a.g <= 0.25 ? ((16.0*a.g-12.0)*a.g+4.0)*a.g : sqrt(a.g),
      a.b <= 0.25 ? ((16.0*a.b-12.0)*a.b+4.0)*a.b : sqrt(a.b));
    vec3 lo = a - (1.0 - 2.0*b)*a*(1.0-a);
    vec3 hi = a + (2.0*b - 1.0)*(d - a);
    return mix(lo, hi, step(0.5, b));
  }
  if (m == 5) // hard-light（按混合色 b 分支）
    return vec3(
      b.r < 0.5 ? 2.0*a.r*b.r : 1.0-2.0*(1.0-a.r)*(1.0-b.r),
      b.g < 0.5 ? 2.0*a.g*b.g : 1.0-2.0*(1.0-a.g)*(1.0-b.g),
      b.b < 0.5 ? 2.0*a.b*b.b : 1.0-2.0*(1.0-a.b)*(1.0-b.b));
  if (m == 6) return abs(a - b);                                       // difference
  if (m == 7) return a + b - 2.0*a*b;                                  // exclusion
  if (m == 8) return vec3(dodge(a.r,b.r), dodge(a.g,b.g), dodge(a.b,b.b)); // color-dodge
  if (m == 9) return vec3(burn(a.r,b.r), burn(a.g,b.g), burn(a.b,b.b));    // color-burn
  return b;                                                            // normal
}

void main() {
  vec4 base = texture(uBase, vTexCoord);
  vec2 p = vTexCoord - uCenter;
  float c = cos(uRot), s = sin(uRot);
  vec2 q = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  vec2 luv = q / max(uSize, vec2(1e-4)) + 0.5;
  if (uFlipH > 0.5) luv.x = 1.0 - luv.x;
  if (uFlipV > 0.5) luv.y = 1.0 - luv.y;
  vec4 lay;
  if (luv.x < 0.0 || luv.x > 1.0 || luv.y < 0.0 || luv.y > 1.0) {
    lay = vec4(0.0);
  } else {
    lay = texture(uLayer, luv);
  }
  float a = clamp(lay.a * uOpacity, 0.0, 1.0);
  if (a <= 0.0001) { outColor = base; return; }
  vec3 mixed = uMode == 0 ? lay.rgb : blendMode(base.rgb, lay.rgb, uMode);
  // W3C source-over + blend：保留透明底图上的叠加层，并按真实 alpha 合成。
  float outA = a + base.a * (1.0 - a);
  vec3 co = a * (1.0 - base.a) * lay.rgb
          + a * base.a * mixed
          + (1.0 - a) * base.a * base.rgb;
  outColor = outA > 0.0001 ? vec4(co / outA, outA) : vec4(0.0);
}`;

interface LayerTex {
  tex: WebGLTexture;
  w: number;
  h: number;
}

/**
 * 多重图片叠加 Stage：按 params.blend.layers 顺序逐层把外部图片以选定混合模式合成进画面。
 * 图层位图由主线程/Worker 解码后经 setLayerBitmap 上传（文件路径不进 GPU）。
 * 无启用层 / 无可用纹理时直通。预览与导出共用，保证所见即所得。
 */
export class BlendStage implements RenderStage {
  public readonly name = 'blend';
  private gl: WebGL2RenderingContext | null = null;
  private prog: ProgramBundle | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private layerTex = new Map<string, LayerTex>();

  /** 上传/替换某图层位图（调用方可在之后 close bitmap） */
  setLayerBitmap(id: string, gl: WebGL2RenderingContext, bitmap: ImageBitmap): void {
    // 替换同 id 旧纹理时必须用“当前传入”的 gl：首次 execute 之前 this.gl 还是 null，
    // 上下文丢失/恢复后 this.gl 也可能是旧上下文。用 removeLayer(id) 会漏删或用错上下文。
    const old = this.layerTex.get(id);
    if (old) gl.deleteTexture(old.tex);
    this.layerTex.delete(id);
    // 记录上下文：即使首次 execute/执行 destroy 前也要能正确清理纹理。
    if (!this.gl) this.gl = gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('[BlendStage] create layer texture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // 与底图一致：转 Canvas 源并翻转 Y，使图层局部 UV 与画面同方向（正向显示）
    const source = bitmapToTextureSource(bitmap);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.layerTex.set(id, { tex, w: bitmap.width, h: bitmap.height });
  }

  removeLayer(id: string, gl?: WebGL2RenderingContext): void {
    const cur = this.layerTex.get(id);
    // 优先用调用方传入的当前上下文，其次用 ensure() 记录的上下文
    const ctx = gl ?? this.gl;
    if (cur && ctx) ctx.deleteTexture(cur.tex);
    this.layerTex.delete(id);
  }

  /** 切换图片时清空全部图层纹理（参数层由 store 重新喂入） */
  clearLayers(gl?: WebGL2RenderingContext): void {
    const ctx = gl ?? this.gl;
    if (ctx) for (const t of this.layerTex.values()) ctx.deleteTexture(t.tex);
    this.layerTex.clear();
  }

  hasLayer(id: string): boolean {
    return this.layerTex.has(id);
  }

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.prog) return;
    this.gl = gl;
    this.prog = createProgram(gl, VERT, FRAG, 'Blend');
    const quad = createFullscreenQuad(gl, this.prog.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    this.loc = {
      uBase: this.prog.uniform('uBase'),
      uLayer: this.prog.uniform('uLayer'),
      uCenter: this.prog.uniform('uCenter'),
      uSize: this.prog.uniform('uSize'),
      uRot: this.prog.uniform('uRot'),
      uOpacity: this.prog.uniform('uOpacity'),
      uMode: this.prog.uniform('uMode'),
      uFlipH: this.prog.uniform('uFlipH'),
      uFlipV: this.prog.uniform('uFlipV'),
    };
  }

  private activeLayers(params: EditParams): BlendLayer[] {
    const b = params.blend;
    if (!b?.enabled) return [];
    return b.layers.filter((l) => l.visible && l.opacity > 0 && this.layerTex.has(l.id));
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const layers = this.activeLayers(params);
    if (layers.length === 0) return input;
    const gl = ctx.gl;
    this.ensure(gl);

    let tex = input;
    const A = ctx.width / ctx.height;
    gl.bindVertexArray(this.vao);

    for (const layer of layers) {
      const lt = this.layerTex.get(layer.id)!;
      const B = lt.w / lt.h;
      // contain：图层等比最大化适配画面，得到归一化占比，再乘用户缩放
      let sx: number;
      let sy: number;
      if (B >= A) {
        sx = 1;
        sy = A / B;
      } else {
        sy = 1;
        sx = B / A;
      }
      sx *= layer.scale;
      sy *= layer.scale;

      const dst = acquireTarget(ctx, ctx.width, ctx.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        releaseTarget(ctx, dst, ctx.width, ctx.height);
        throw new Error('[BlendStage] FBO incomplete');
      }
      gl.viewport(0, 0, ctx.width, ctx.height);
      gl.useProgram(this.prog!.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.loc.uBase, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lt.tex);
      gl.uniform1i(this.loc.uLayer, 1);
      // EditParams 使用左上原点（y 向下），WebGL 纹理坐标使用左下原点（y 向上）。
      gl.uniform2f(this.loc.uCenter, layer.x, 1.0 - layer.y);
      gl.uniform2f(this.loc.uSize, sx, sy);
      gl.uniform1f(this.loc.uRot, (layer.rotation * Math.PI) / 180);
      gl.uniform1f(this.loc.uOpacity, layer.opacity);
      gl.uniform1i(this.loc.uMode, Math.max(0, BLEND_MODES.indexOf(layer.mode)));
      gl.uniform1f(this.loc.uFlipH, layer.flipH ? 1 : 0);
      gl.uniform1f(this.loc.uFlipV, layer.flipV ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (tex !== input) releaseTarget(ctx, tex, ctx.width, ctx.height);
      tex = dst;
    }

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return tex;
  }

  destroy(): void {
    const gl = this.gl;
    if (gl) {
      this.clearLayers(gl);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
      if (this.prog) gl.deleteProgram(this.prog.program);
    } else {
      this.layerTex.clear();
    }
    this.vbo = null;
    this.vao = null;
    this.fbo = null;
    this.prog = null;
    this.loc = {};
    this.gl = null;
  }
}
