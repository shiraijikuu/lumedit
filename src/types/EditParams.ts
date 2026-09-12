// ============================================================
// 类型契约（已定稿，撤销栈 / 工程文件 / 渲染入参统一复用）
// ============================================================

export interface GeometryParams {
  /** 裁剪框左上角 X，归一化 0~1（UI 坐标系：原点左上） */
  x: number;
  /** 裁剪框左上角 Y，归一化 0~1（UI 坐标系：原点左上） */
  y: number;
  /** 裁剪框宽度，归一化 0~1 */
  width: number;
  /** 裁剪框高度，归一化 0~1 */
  height: number;
  /** 旋转角度（度），顺时针为正；UI 步进按钮每次 ±90 */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

// ---------------- 第一档：基础影调（基础版 / 完整版均含） ----------------
export interface AdjustParams {
  /** 曝光（EV 档）-2 ~ 2 */
  exposure: number;
  /** 亮度（加性）-1 ~ 1 */
  brightness: number;
  /** 对比度 -1 ~ 1 */
  contrast: number;
  /** 高光 -1 ~ 1（压暗/提亮亮部） */
  highlights: number;
  /** 阴影 -1 ~ 1（提亮/压暗暗部） */
  shadows: number;
  /** 白色色阶 -1 ~ 1 */
  whites: number;
  /** 黑色色阶 -1 ~ 1 */
  blacks: number;
  /** 色温 -1（冷） ~ 1（暖） */
  temperature: number;
  /** 色调 -1（绿） ~ 1（品红） */
  tint: number;
  /** 清晰度（局部对比）-1 ~ 1 */
  clarity: number;
  /** 去朦胧 -1 ~ 1 */
  dehaze: number;
  /** 饱和度（全局）-1 ~ 1 */
  saturation: number;
  /** 自然饱和度（保护高饱和）-1 ~ 1 */
  vibrance: number;
}

// ---------------- 第一档：RGB 色调曲线 ----------------
export interface CurvePoint {
  /** 输入 0~1 */
  x: number;
  /** 输出 0~1 */
  y: number;
}
export interface CurveParams {
  /** 主曲线（同时作用 RGB） */
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

// ---------------- 第二档：HSL 混色器（仅完整版） ----------------
export const HSL_HUES = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
export type HslHue = (typeof HSL_HUES)[number];
export interface HslChannel {
  /** 色相偏移 -1 ~ 1 */
  hue: number;
  /** 饱和 -1 ~ 1 */
  sat: number;
  /** 明亮度 -1 ~ 1 */
  lum: number;
}
export type HslParams = Record<HslHue, HslChannel>;

// ---------------- 第二档：颜色分级（仅完整版） ----------------
export interface GradeWheel {
  /** 色相 0~360 */
  hue: number;
  /** 饱和 0~1 */
  sat: number;
}
export interface ColorGradeParams {
  shadows: GradeWheel;
  midtones: GradeWheel;
  highlights: GradeWheel;
}

// ---------------- 第二档：效果（仅完整版） ----------------
export interface EffectsParams {
  /** 晕影 -1（黑角）~ 1（白角） */
  vignette: number;
  /** 颗粒 0 ~ 1 */
  grain: number;
  /** 锐化 0 ~ 1 */
  sharpen: number;
  /** 降噪 0 ~ 1 */
  denoise: number;
}

export interface LutParams {
  /** 内置 LUT 标识 */
  id: string | null;
  /** 外部 cube 文件路径 */
  path: string | null;
  isBuiltin: boolean;
  /** 0 ~ 1 */
  strength: number;
}

// ---------------- 水印（整体复用 camera-watermark 引擎，可选；未启用不写入工程） ----------------
// 不自研水印渲染：保存 camera-watermark 编辑器的完整 state，编辑窗与离屏导出都由其原始引擎渲染。

export interface WatermarkParams {
  enabled: boolean;
  /** camera-watermark 完整 state（JSON 安全，含文字/样式/图片水印/画框/二维码等全部设置） */
  cwmState: Record<string, unknown> | null;
  /** camera-watermark 从原图解析出的 EXIF meta（离屏全分辨率合成时复用，保证变量一致） */
  cwmMeta: Record<string, unknown> | null;
}

export interface GradationParams {
  enabled: boolean;
  /** linear=线性渐变（沿线段 0→1，垂直方向无限延伸），radial=径向（圆心→边缘） */
  type: 'linear' | 'radial';
  /** 线段/圆心端点（归一化，y 以画面顶部为原点）：linear 为渐变起点（无效果侧），radial 为圆心 */
  x1: number;
  y1: number;
  /** linear 为渐变终点（全效果侧，箭头端），radial 为蒙版边缘上的点 */
  x2: number;
  y2: number;
  /** 渐变内曝光（EV） */
  exposure: number;
  /** 渐变内色温 */
  temperature: number;
  /** 渐变内色调 */
  tint: number;
}

export interface EditParams {
  geometry: GeometryParams;
  adjust: AdjustParams;
  /** 第一档：RGB 色调曲线 */
  curve: CurveParams;
  /** 第二档：HSL 混色器（基础版不挂载 Stage / 不显示 UI，但保留以兼容工程文件） */
  hsl: HslParams;
  /** 第二档：颜色分级 */
  colorGrade: ColorGradeParams;
  /** 第二档：效果 */
  effects: EffectsParams;
  /** v0.3.0：局部渐变 */
  gradation: GradationParams;
  lut: LutParams;
  /** P1：camera-watermark 水印（管线最后一步，导出阶段离屏合成） */
  watermark?: WatermarkParams;
}

export function linearCurve(): CurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

function defaultHsl(): HslParams {
  const out = {} as HslParams;
  for (const h of HSL_HUES) out[h] = { hue: 0, sat: 0, lum: 0 };
  return out;
}

export const defaultEditParams: EditParams = {
  geometry: {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
  },
  adjust: {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    clarity: 0,
    dehaze: 0,
    saturation: 0,
    vibrance: 0,
  },
  curve: {
    master: linearCurve(),
    red: linearCurve(),
    green: linearCurve(),
    blue: linearCurve(),
  },
  hsl: defaultHsl(),
  colorGrade: {
    shadows: { hue: 220, sat: 0 },
    midtones: { hue: 40, sat: 0 },
    highlights: { hue: 40, sat: 0 },
  },
  effects: {
    vignette: 0,
    grain: 0,
    sharpen: 0,
    denoise: 0,
  },
  gradation: {
    enabled: false,
    type: 'linear',
    x1: 0.15,
    y1: 0.5,
    x2: 0.85,
    y2: 0.5,
    exposure: 0,
    temperature: 0,
    tint: 0,
  },
  lut: {
    id: null,
    path: null,
    isBuiltin: false,
    strength: 0,
  },
};

/**
 * 用默认值补齐缺失字段（兼容旧版工程文件 / 历史撤销快照）。
 * 纯函数：不修改入参，返回一个结构完整的新对象。
 */
export function ensureParams(p: Partial<EditParams> | null | undefined): EditParams {
  const d = defaultEditParams;
  const out: EditParams = cloneParams(d);
  if (!p) return out;
  if (p.geometry) Object.assign(out.geometry, p.geometry);
  if (p.adjust) Object.assign(out.adjust, d.adjust, p.adjust);
  if (p.curve) {
    out.curve.master = p.curve.master?.length ? p.curve.master.map((q) => ({ ...q })) : linearCurve();
    out.curve.red = p.curve.red?.length ? p.curve.red.map((q) => ({ ...q })) : linearCurve();
    out.curve.green = p.curve.green?.length ? p.curve.green.map((q) => ({ ...q })) : linearCurve();
    out.curve.blue = p.curve.blue?.length ? p.curve.blue.map((q) => ({ ...q })) : linearCurve();
  }
  if (p.hsl) {
    for (const h of HSL_HUES) {
      const ch = p.hsl[h];
      if (ch) Object.assign(out.hsl[h], ch);
    }
  }
  if (p.colorGrade) {
    Object.assign(out.colorGrade.shadows, p.colorGrade.shadows);
    Object.assign(out.colorGrade.midtones, p.colorGrade.midtones);
    Object.assign(out.colorGrade.highlights, p.colorGrade.highlights);
  }
  if (p.effects) Object.assign(out.effects, p.effects);
  if (p.gradation) {
    const gp = p.gradation as Partial<GradationParams> & { x?: number; y?: number; w?: number; h?: number; rotation?: number };
    if (typeof gp.w === 'number') {
      // 旧版（中心 + 宽高 + 旋转）→ 线段两端
      const cx = (gp.x ?? 0.2) + gp.w / 2;
      const cy = (gp.y ?? 0.2) + (gp.h ?? 0.6) / 2;
      const th = ((gp.rotation ?? 0) * Math.PI) / 180;
      const half = gp.w / 2;
      out.gradation.x1 = cx - Math.cos(th) * half;
      out.gradation.y1 = cy - Math.sin(th) * half;
      out.gradation.x2 = cx + Math.cos(th) * half;
      out.gradation.y2 = cy + Math.sin(th) * half;
    } else {
      out.gradation.x1 = Math.min(1.5, Math.max(-0.5, gp.x1 ?? out.gradation.x1));
      out.gradation.y1 = Math.min(1.5, Math.max(-0.5, gp.y1 ?? out.gradation.y1));
      out.gradation.x2 = Math.min(1.5, Math.max(-0.5, gp.x2 ?? out.gradation.x2));
      out.gradation.y2 = Math.min(1.5, Math.max(-0.5, gp.y2 ?? out.gradation.y2));
    }
    out.gradation.enabled = !!gp.enabled;
    out.gradation.type = gp.type === 'radial' ? 'radial' : 'linear';
    out.gradation.exposure = gp.exposure ?? 0;
    out.gradation.temperature = gp.temperature ?? 0;
    out.gradation.tint = gp.tint ?? 0;
  }
  if (p.lut) Object.assign(out.lut, p.lut);
  if (p.watermark) out.watermark = p.watermark;
  return out;
}

/** 深拷贝参数（结构化克隆，杜绝撤销栈别名引用） */
export function cloneParams(p: EditParams): EditParams {
  const cloned: EditParams = {
    geometry: { ...p.geometry },
    adjust: { ...p.adjust },
    curve: {
      master: p.curve.master.map((q) => ({ ...q })),
      red: p.curve.red.map((q) => ({ ...q })),
      green: p.curve.green.map((q) => ({ ...q })),
      blue: p.curve.blue.map((q) => ({ ...q })),
    },
    hsl: Object.fromEntries(
      HSL_HUES.map((h) => [h, { ...p.hsl[h] }])
    ) as HslParams,
    colorGrade: {
      shadows: { ...p.colorGrade.shadows },
      midtones: { ...p.colorGrade.midtones },
      highlights: { ...p.colorGrade.highlights },
    },
    effects: { ...p.effects },
    gradation: { ...p.gradation },
    lut: { ...p.lut },
  };
  if (p.watermark) {
    cloned.watermark = {
      enabled: p.watermark.enabled,
      cwmState: p.watermark.cwmState ? JSON.parse(JSON.stringify(p.watermark.cwmState)) : null,
      cwmMeta: p.watermark.cwmMeta ? JSON.parse(JSON.stringify(p.watermark.cwmMeta)) : null,
    };
  }
  return cloned;
}

// ---------------- 调色预设（v0.3.0）：整套颜色参数的保存 / 应用 ----------------
/** 预设覆盖的颜色分组（不含几何与水印；应用时经 ensureParams 补齐兼容） */
export interface PresetColorParams {
  adjust: AdjustParams;
  curve: CurveParams;
  hsl: HslParams;
  colorGrade: ColorGradeParams;
  effects: EffectsParams;
  lut: LutParams;
}

/** 从当前参数中摘出预设所需的颜色分组（深拷贝） */
export function pickPresetParams(p: EditParams): PresetColorParams {
  const c = cloneParams(p);
  return {
    adjust: c.adjust,
    curve: c.curve,
    hsl: c.hsl,
    colorGrade: c.colorGrade,
    effects: c.effects,
    lut: c.lut,
  };
}
