import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams, GradationParams, MaskStroke } from '@/types/EditParams';
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

// 画笔光柵化：每笔画线段展开为带 SDF 的四边形，片段计算到线段的距离（纵横比修正空间）。
const VERT_BRUSH = /* glsl */ `#version 300 es
in vec2 aA;
in vec2 aB;
in vec2 aPos;
in float aRad;
in float aHard;
uniform float uAspect;
out vec2 vP;
out vec2 vA;
out vec2 vB;
out float vRad;
out float vHard;
void main() {
  vP = aPos;
  vA = aA;
  vB = aB;
  vRad = aRad;
  vHard = aHard;
  vec2 uv = vec2(aPos.x / uAspect, aPos.y);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_BRUSH = /* glsl */ `#version 300 es
precision highp float;
in vec2 vP;
in vec2 vA;
in vec2 vB;
in float vRad;
in float vHard;
out vec4 outColor;
float distSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  float d = distSeg(vP, vA, vB);
  float soft = clamp((1.0 - vHard) * vRad, 0.002, vRad);
  float m = 1.0 - smoothstep(vRad - soft, vRad, d);
  outColor = vec4(vec3(m), 1.0);
}`;

// 形状着色器：把一个蒙版形状写入累积蒙版纹理（R = 覆盖率 0~1）。
// 0 线性（起点侧半平面软边界）/ 1 径向（椭圆衰减）/ 2 亮度区间 / 3 色相范围 / 4 画笔纹理。
// uInvert=1 时输出反相（差集组合用）。
const SHAPE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform sampler2D uBrush;
uniform vec2 uP1;
uniform vec2 uP2;
uniform float uType;
uniform float uInvert;
uniform float uLumaLo;
uniform float uLumaHi;
uniform float uLumaSoft;
uniform float uHueCenter;
uniform float uHueRange;
uniform float uHueFeather;

float hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (d < 1e-5) return 0.0;
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return h * 60.0;
}

void main() {
  float m = 0.0;
  if (uType < 0.5) {
    vec2 dir = uP2 - uP1;
    float len2 = max(dot(dir, dir), 1e-6);
    float t = dot(vTexCoord - uP1, dir) / len2;
    m = smoothstep(0.0, 0.03, t);
  } else if (uType < 1.5) {
    float r = sqrt(max(dot(uP2 - uP1, uP2 - uP1), 1e-6));
    m = 1.0 - smoothstep(0.55, 1.0, length(vTexCoord - uP1) / r);
  } else if (uType < 2.5) {
    float l = dot(texture(uSource, vTexCoord).rgb, vec3(0.299, 0.587, 0.114));
    m = smoothstep(uLumaLo - uLumaSoft, uLumaLo + uLumaSoft, l)
      * (1.0 - smoothstep(uLumaHi - uLumaSoft, uLumaHi + uLumaSoft, l));
  } else if (uType < 3.5) {
    vec3 c = texture(uSource, vTexCoord).rgb;
    float h = hueOf(c);
    float d = min(abs(h - uHueCenter), 360.0 - abs(h - uHueCenter));
    m = 1.0 - smoothstep(uHueRange, uHueRange + uHueFeather, d);
  } else {
    m = texture(uBrush, vTexCoord).r;
  }
  outColor = vec4(vec3(mix(m, 1.0 - m, uInvert)), 1.0);
}`;

// 应用着色器：按组合模式取有效蒙版，套用本蒙版层的曝光/色温/色调（线性光域）。
// 差集模式：蒙版=形状×累积，调整=累积调整的精确逆（曝光为 EV 和、色温/色调为通道乘积）。
const APPLY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
uniform sampler2D uAcc;
uniform sampler2D uBrush;
uniform vec2 uP1;
uniform vec2 uP2;
uniform float uType;       // 0 linear / 1 radial / 2 luminance / 3 color / 4 brush
uniform float uApplyMode;  // 0 union / 1 intersect / 2 subtract
uniform float uInvert;     // subtract 形状反相
uniform float uExposure;
uniform float uTemperature;
uniform float uTint;
uniform float uAccEv;
uniform vec3 uAccMul;
uniform float uLumaLo;
uniform float uLumaHi;
uniform float uLumaSoft;
uniform float uHueCenter;
uniform float uHueRange;
uniform float uHueFeather;
${SRGB_TRANSFER_GLSL}

float hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (d < 1e-5) return 0.0;
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return h * 60.0;
}

float shapeAt(vec2 uv, vec3 srcRgb) {
  if (uType < 0.5) {
    vec2 dir = uP2 - uP1;
    float len2 = max(dot(dir, dir), 1e-6);
    float t = dot(uv - uP1, dir) / len2;
    return smoothstep(0.0, 0.03, t);
  }
  if (uType < 1.5) {
    float r = sqrt(max(dot(uP2 - uP1, uP2 - uP1), 1e-6));
    return 1.0 - smoothstep(0.55, 1.0, length(uv - uP1) / r);
  }
  if (uType < 2.5) {
    float l = dot(srcRgb, vec3(0.299, 0.587, 0.114));
    return smoothstep(uLumaLo - uLumaSoft, uLumaLo + uLumaSoft, l)
      * (1.0 - smoothstep(uLumaHi - uLumaSoft, uLumaHi + uLumaSoft, l));
  }
  if (uType < 3.5) {
    float h = hueOf(srcRgb);
    float d = min(abs(h - uHueCenter), 360.0 - abs(h - uHueCenter));
    return 1.0 - smoothstep(uHueRange, uHueRange + uHueFeather, d);
  }
  return texture(uBrush, uv).r;
}

void main() {
  vec4 src = texture(uSource, vTexCoord);
  vec3 c = src.rgb;
  float acc = texture(uAcc, vTexCoord).r;
  float shape = shapeAt(vTexCoord, c);
  float mask;
  vec3 al;
  if (uApplyMode < 1.5) {
    // 并集/交集：本层自己的调整
    mask = uApplyMode < 0.5 ? shape : shape * acc;
    al = srgbToLinear(c) * exp2(uExposure);
    al.r *= 1.0 + uTemperature * 0.12;
    al.b *= 1.0 - uTemperature * 0.12;
    al.r *= 1.0 + uTint * 0.10;
    al.b *= 1.0 + uTint * 0.10;
    al.g *= 1.0 - uTint * 0.10;
    al = max(al, vec3(0.0));
    outColor = vec4(mix(c, linearToSrgb(al), clamp(mask, 0.0, 1.0)), src.a);
    return;
  }
  // 差集：撤销累积调整（线性光域精确逆），并把该区域从累积蒙版中排除
  mask = shape * acc;
  al = srgbToLinear(c) * exp2(-uAccEv);
  al.r /= max(uAccMul.r, 1e-4);
  al.g /= max(uAccMul.g, 1e-4);
  al.b /= max(uAccMul.b, 1e-4);
  al = max(al, vec3(0.0));
  outColor = vec4(mix(c, linearToSrgb(al), clamp(mask, 0.0, 1.0)), src.a);
}`;

/**
 * 蒙版 Stage：多蒙版（线性/径向/亮度/颜色/画笔）+ 组合语义（并集/交集/差集）。
 * 每个有效蒙版两个 pass：
 *   1) 形状写入累积蒙版纹理（并集=MAX、交集=乘、差集=乘反相；首个蒙版直接替换）
 *   2) 应用调整到画面（并集=自身形状；交集=形状×累积；差集=撤销累积调整）
 * 画笔形状先光柵化到独立纹理（干净无混合），再以组合混合并入累积。
 * 无有效蒙版直通。兼容旧版单渐变字段。
 */
export class GradationStage implements RenderStage {
  public readonly name = 'gradation';
  private gl: WebGL2RenderingContext | null = null;
  private shapeProg: ProgramBundle | null = null;
  private applyProg: ProgramBundle | null = null;
  private brushProg: ProgramBundle | null = null;
  private brushVao: WebGLVertexArrayObject | null = null;
  private brushVbo: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private sLoc: Record<string, WebGLUniformLocation | null> = {};
  private aLoc: Record<string, WebGLUniformLocation | null> = {};
  private bLoc: Record<string, number> = {};
  private bAspectLoc: WebGLUniformLocation | null = null;
  /** 1×1 空画笔纹理占位（画笔蒙版未绘制时的中性空纹理） */
  private emptyTex: WebGLTexture | null = null;

  private ensure(gl: WebGL2RenderingContext): void {
    if (this.applyProg) return;
    this.gl = gl;
    this.shapeProg = createProgram(gl, VERT, SHAPE_FRAG, 'GradationShape');
    this.applyProg = createProgram(gl, VERT, APPLY_FRAG, 'GradationApply');
    this.brushProg = createProgram(gl, VERT_BRUSH, FRAG_BRUSH, 'GradationBrush');
    this.bAspectLoc = this.brushProg.uniform('uAspect');
    const quad = createFullscreenQuad(gl, this.applyProg.program);
    this.vao = quad.vao;
    this.vbo = quad.vbo;
    this.fbo = attachTextureToFBO(gl, createRGBA8Texture(gl, 1, 1));
    // 画笔程序专属 VAO（多属性 + 动态 VBO）
    this.brushVao = gl.createVertexArray();
    this.brushVbo = gl.createBuffer();
    gl.bindVertexArray(this.brushVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.brushVbo);
    const bl = this.brushProg!;
    const layout: Array<[string, number, number]> = [
      ['aPos', 2, 0],
      ['aA', 2, 8],
      ['aB', 2, 16],
      ['aRad', 1, 24],
      ['aHard', 1, 28],
    ];
    for (const [name, size, offset] of layout) {
      const loc = bl.attrib(name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, offset);
      this.bLoc[name] = loc;
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.emptyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.emptyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const sl = this.shapeProg;
    this.sLoc = {
      uSource: sl.uniform('uSource'),
      uBrush: sl.uniform('uBrush'),
      uP1: sl.uniform('uP1'),
      uP2: sl.uniform('uP2'),
      uType: sl.uniform('uType'),
      uInvert: sl.uniform('uInvert'),
      uLumaLo: sl.uniform('uLumaLo'),
      uLumaHi: sl.uniform('uLumaHi'),
      uLumaSoft: sl.uniform('uLumaSoft'),
      uHueCenter: sl.uniform('uHueCenter'),
      uHueRange: sl.uniform('uHueRange'),
      uHueFeather: sl.uniform('uHueFeather'),
    };
    const al = this.applyProg;
    this.aLoc = {
      uSource: al.uniform('uSource'),
      uAcc: al.uniform('uAcc'),
      uBrush: al.uniform('uBrush'),
      uP1: al.uniform('uP1'),
      uP2: al.uniform('uP2'),
      uType: al.uniform('uType'),
      uApplyMode: al.uniform('uApplyMode'),
      uInvert: al.uniform('uInvert'),
      uExposure: al.uniform('uExposure'),
      uTemperature: al.uniform('uTemperature'),
      uTint: al.uniform('uTint'),
      uAccEv: al.uniform('uAccEv'),
      uAccMul: al.uniform('uAccMul'),
      uLumaLo: al.uniform('uLumaLo'),
      uLumaHi: al.uniform('uLumaHi'),
      uLumaSoft: al.uniform('uLumaSoft'),
      uHueCenter: al.uniform('uHueCenter'),
      uHueRange: al.uniform('uHueRange'),
      uHueFeather: al.uniform('uHueFeather'),
    };
  }

  /** 收集当前生效的蒙版（新数组优先，回退旧单字段）；仅要求 enabled（零调整的形状仍参与组合） */
  private activeMasks(params: EditParams): GradationParams[] {
    const source: GradationParams[] =
      Array.isArray(params.gradations) && params.gradations.length
        ? params.gradations
        : params.gradation?.enabled
          ? [params.gradation]
          : [];
    return source.filter((g) => g.enabled);
  }

  private typeIndex(type: GradationParams['type']): number {
    return type === 'radial' ? 1 : type === 'luminance' ? 2 : type === 'color' ? 3 : type === 'brush' ? 4 : 0;
  }

  private bindShape(g: GradationParams, invert: number, srcTex: WebGLTexture, brushTex?: WebGLTexture | null): void {
    const gl = this.gl!;
    gl.useProgram(this.shapeProg!.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.sLoc.uSource, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, brushTex ?? this.emptyTex!);
    gl.uniform1i(this.sLoc.uBrush, 1);
    gl.uniform2f(this.sLoc.uP1, g.x1, 1 - g.y1);
    gl.uniform2f(this.sLoc.uP2, g.x2, 1 - g.y2);
    gl.uniform1f(this.sLoc.uType, this.typeIndex(g.type));
    gl.uniform1f(this.sLoc.uInvert, invert);
    gl.uniform1f(this.sLoc.uLumaLo, g.lumaLo);
    gl.uniform1f(this.sLoc.uLumaHi, g.lumaHi);
    gl.uniform1f(this.sLoc.uLumaSoft, g.lumaSoft);
    gl.uniform1f(this.sLoc.uHueCenter, g.hueCenter);
    gl.uniform1f(this.sLoc.uHueRange, g.hueRange);
    gl.uniform1f(this.sLoc.uHueFeather, g.hueFeather);
  }

  execute(input: WebGLTexture, params: EditParams, ctx: RenderContext): WebGLTexture {
    const masks = this.activeMasks(params);
    if (masks.length === 0) return input;
    const gl = ctx.gl;
    this.ensure(gl);

    const acc = acquireTarget(ctx, ctx.width, ctx.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc, 0);
    gl.viewport(0, 0, ctx.width, ctx.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let tex = input;
    let accEv = 0;
    let accR = 1, accG = 1, accB = 1;
    let first = true;
    gl.bindVertexArray(this.vao);

    for (const g of masks) {
      const subtract = g.combine === 'subtract';
      const invert = subtract && !first ? 1 : 0;
      const isBrush = g.type === 'brush';
      const selfNonZero = g.exposure !== 0 || g.temperature !== 0 || g.tint !== 0;
      const hasAccEffect = accEv !== 0 || accR !== 1 || accG !== 1 || accB !== 1;

      // 0) 画笔光柵化：笔画 → brushTex（干净无混合，供组合与应用取样）
      let brushTex: WebGLTexture | null = null;
      if (isBrush && g.strokes.length) {
        brushTex = acquireTarget(ctx, ctx.width, ctx.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brushTex, 0);
        gl.viewport(0, 0, ctx.width, ctx.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const verts = brushVerts(g.strokes, ctx.width / ctx.height);
        if (verts.length) {
          gl.disable(gl.CULL_FACE);
          gl.useProgram(this.brushProg!.program);
          gl.bindVertexArray(this.brushVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.brushVbo);
          gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
          gl.uniform1f(this.bAspectLoc, ctx.width / ctx.height);
          gl.drawArrays(gl.TRIANGLES, 0, verts.length / 8);
          gl.bindVertexArray(null);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc, 0);
        gl.viewport(0, 0, ctx.width, ctx.height);
        gl.bindVertexArray(this.vao);
      }

      // 1) 应用 pass：并集/交集=自身调整；差集=撤销累积调整（无累积可撤则跳过）
      const doApply = subtract ? !first && hasAccEffect : selfNonZero;
      if (doApply) {
        const dst = acquireTarget(ctx, ctx.width, ctx.height);
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          releaseTarget(ctx, dst, ctx.width, ctx.height);
          throw new Error('[GradationStage] FBO incomplete');
        }
        gl.viewport(0, 0, ctx.width, ctx.height);
        gl.useProgram(this.applyProg!.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(this.aLoc.uSource, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, acc);
        gl.uniform1i(this.aLoc.uAcc, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, brushTex ?? this.emptyTex!);
        gl.uniform1i(this.aLoc.uBrush, 2);
        gl.uniform2f(this.aLoc.uP1, g.x1, 1 - g.y1);
        gl.uniform2f(this.aLoc.uP2, g.x2, 1 - g.y2);
        gl.uniform1f(this.aLoc.uType, this.typeIndex(g.type));
        gl.uniform1f(this.aLoc.uApplyMode, subtract ? 2 : g.combine === 'intersect' ? 1 : 0);
        gl.uniform1f(this.aLoc.uInvert, invert);
        gl.uniform1f(this.aLoc.uExposure, g.exposure);
        gl.uniform1f(this.aLoc.uTemperature, g.temperature);
        gl.uniform1f(this.aLoc.uTint, g.tint);
        gl.uniform1f(this.aLoc.uAccEv, accEv);
        gl.uniform3f(this.aLoc.uAccMul, accR, accG, accB);
        gl.uniform1f(this.aLoc.uLumaLo, g.lumaLo);
        gl.uniform1f(this.aLoc.uLumaHi, g.lumaHi);
        gl.uniform1f(this.aLoc.uLumaSoft, g.lumaSoft);
        gl.uniform1f(this.aLoc.uHueCenter, g.hueCenter);
        gl.uniform1f(this.aLoc.uHueRange, g.hueRange);
        gl.uniform1f(this.aLoc.uHueFeather, g.hueFeather);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (tex !== input) releaseTarget(ctx, tex, ctx.width, ctx.height);
        tex = dst;
      }

      // 2) 累积蒙版更新：形状以组合混合模式写入 acc
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc, 0);
      gl.viewport(0, 0, ctx.width, ctx.height);
      if (first && !subtract) {
        gl.disable(gl.BLEND);
      } else if (subtract) {
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
      } else if (g.combine === 'intersect') {
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      } else {
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MAX);
        gl.blendFunc(gl.ONE, gl.ONE);
      }
      this.bindShape(g, invert, tex, brushTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ZERO);

      // 累积调整量（差集层不计入）
      if (!subtract) {
        accEv += g.exposure;
        accR *= 1.0 + g.temperature * 0.12;
        accB *= 1.0 - g.temperature * 0.12;
        accR *= 1.0 + g.tint * 0.10;
        accB *= 1.0 + g.tint * 0.10;
        accG *= 1.0 - g.tint * 0.10;
      }
      first = false;
    }

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    releaseTarget(ctx, acc, ctx.width, ctx.height);
    return tex;
  }

  destroy(): void {
    if (!this.gl) return;
    if (this.vbo) this.gl.deleteBuffer(this.vbo);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.fbo) this.gl.deleteFramebuffer(this.fbo);
    if (this.shapeProg) this.gl.deleteProgram(this.shapeProg.program);
    if (this.applyProg) this.gl.deleteProgram(this.applyProg.program);
    if (this.brushProg) this.gl.deleteProgram(this.brushProg.program);
    if (this.brushVao) this.gl.deleteVertexArray(this.brushVao);
    if (this.brushVbo) this.gl.deleteBuffer(this.brushVbo);
    if (this.emptyTex) this.gl.deleteTexture(this.emptyTex);
    this.vbo = null;
    this.vao = null;
    this.fbo = null;
    this.shapeProg = null;
    this.applyProg = null;
    this.brushProg = null;
    this.brushVao = null;
    this.brushVbo = null;
    this.emptyTex = null;
    this.sLoc = {};
    this.aLoc = {};
    this.bLoc = {};
    this.bAspectLoc = null;
    this.gl = null;
  }
}

/** 笔画 → 胶囊四边形顶点（纵横比修正空间；6 顶点/线段；单点=圆点） */
function brushVerts(strokes: MaskStroke[], aspect: number): Float32Array {
  const out: number[] = [];
  for (const st of strokes) {
    const pts = st.pts.length === 1 ? [st.pts[0], st.pts[0]] : st.pts;
    const uv = pts.map(([x, y]) => [x * aspect, 1 - y]);
    for (let i = 0; i + 1 < uv.length; i++) {
      const [ax, ay] = uv[i];
      const [bx, by] = uv[i + 1];
      let dx = bx - ax;
      let dy = by - ay;
      const dl = Math.hypot(dx, dy);
      if (dl < 1e-5) continue;
      dx /= dl;
      dy /= dl;
      const px = -dy * st.radius;
      const py = dx * st.radius;
      const rr = st.radius;
      const corners: Array<[number, number]> = [
        [ax + px + dx * rr, ay + py + dy * rr],
        [ax - px + dx * rr, ay - py + dy * rr],
        [bx + px - dx * rr, by + py - dy * rr],
        [bx - px - dx * rr, by - py - dy * rr],
      ];
      for (const [cx, cy] of [corners[0], corners[1], corners[2], corners[1], corners[3], corners[2]]) {
        out.push(cx, cy, ax, ay, bx, by, st.radius, st.hardness);
      }
    }
  }
  return new Float32Array(out);
}
