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

// ---------------- 第二档：Log 色轮（Lift / Gamma / Gain） ----------------
export interface LogWheel {
  /** 色相平面 X，-1（青绿）~ 1（红橙） */
  x: number;
  /** 色相平面 Y，-1（蓝）~ 1（黄） */
  y: number;
  /** 亮度偏移，-1 ~ 1 */
  luma: number;
}
export interface LogWheelsParams {
  enabled: boolean;
  lift: LogWheel;
  gamma: LogWheel;
  gain: LogWheel;
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

// ---------------- 多重图片叠加（混合图层，进 WebGL 管线，参数化/可撤销/进工程） ----------------
/** W3C Compositing 混合模式（与 Canvas2D globalCompositeOperation 同公式），normal 为普通 Alpha 合成 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'color-dodge'
  | 'color-burn';

/** 混合模式固定顺序（BlendStage 以该索引选择 shader 分支，勿随意调序） */
export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'color-dodge',
  'color-burn',
];

/** 混合图层数量上限（多 pass / UI 列表共同约束） */
export const MAX_BLEND_LAYERS = 8;

export interface BlendLayer {
  id: string;
  /** 图层显示名（默认取文件名） */
  name: string;
  /** 外部图片绝对路径（文件引用，不嵌入工程；加载失败/缺失则跳过该层） */
  imagePath: string | null;
  mode: BlendMode;
  /** 不透明度 0~1 */
  opacity: number;
  /** 中心位置，归一化 0~1（相对画面左上） */
  x: number;
  y: number;
  /** 缩放，1=图层等比 contain 铺满画面 */
  scale: number;
  /** 旋转角度（度，顺时针） */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  visible: boolean;
}

export interface BlendParams {
  enabled: boolean;
  layers: BlendLayer[];
  /** 合成组相对 LUT 的位置：before-lut=叠加层参与后续 LUT 调色；after-lut=LUT 之后再叠加 */
  position: 'before-lut' | 'after-lut';
}

export function defaultBlendParams(): BlendParams {
  return { enabled: false, layers: [], position: 'after-lut' };
}

let blendSeq = 0;
/** 新建一个叠加图层（默认居中、全尺寸、normal、全不透明） */
export function createBlendLayer(imagePath: string | null, name: string): BlendLayer {
  blendSeq += 1;
  return {
    id: `b_${Date.now().toString(36)}_${blendSeq}`,
    name,
    imagePath,
    mode: 'normal',
    opacity: 1,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    visible: true,
  };
}

function clampB(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fb;
  return Math.min(hi, Math.max(lo, n));
}

/** 把任意（旧工程/损坏快照）图层数据补全为合法 BlendLayer */
export function normalizeBlendLayer(l: Partial<BlendLayer> | null | undefined, idx = 0): BlendLayer {
  const mode = BLEND_MODES.includes(l?.mode as BlendMode) ? (l!.mode as BlendMode) : 'normal';
  return {
    id: typeof l?.id === 'string' && l.id ? l.id : `b${idx + 1}`,
    name: typeof l?.name === 'string' && l.name ? l.name : `Layer ${idx + 1}`,
    imagePath: typeof l?.imagePath === 'string' ? l.imagePath : null,
    mode,
    opacity: clampB(l?.opacity, 0, 1, 1),
    x: clampB(l?.x, -0.5, 1.5, 0.5),
    y: clampB(l?.y, -0.5, 1.5, 0.5),
    scale: clampB(l?.scale, 0.02, 20, 1),
    rotation: clampB(l?.rotation, -180, 180, 0),
    flipH: !!l?.flipH,
    flipV: !!l?.flipV,
    visible: l?.visible !== false,
  };
}

export type GradationType = 'linear' | 'radial' | 'brush' | 'luminance' | 'color';

export interface GradationParams {
  enabled: boolean;
  /** linear=线性渐变（沿线段 0→1，垂直方向无限延伸），radial=径向（圆心→边缘），
   *  brush=画笔（笔画累积），luminance=亮度区间，color=色相范围 */
  type: GradationType;
  /** 与之前累积蒙版的组合方式（首个有效蒙版忽略）：并集/交集/差集 */
  combine: MaskCombine;
  /** 线段/圆心端点（归一化，y 以画面顶部为原点）：linear 为渐变起点（无效果侧），radial 为圆心 */
  x1: number;
  y1: number;
  /** linear 为渐变终点（全效果侧，箭头端），radial 为蒙版边缘上的点 */
  x2: number;
  y2: number;
  /** 亮度蒙版：画面亮度 [lo, hi] 区间入选，soft 为过渡带宽 */
  lumaLo: number;
  lumaHi: number;
  lumaSoft: number;
  /** 颜色范围蒙版：中心色相 0~360、半宽（度）、柔化（度）——同取色限定 */
  hueCenter: number;
  hueRange: number;
  hueFeather: number;
  /** 画笔蒙版：笔画列表（归一化坐标，radius 按画面高度比例） */
  strokes: MaskStroke[];
  /** 渐变内曝光（EV） */
  exposure: number;
  /** 渐变内色温 */
  temperature: number;
  /** 渐变内色调 */
  tint: number;
}

/** 蒙版组合方式：并集（加蒙版）/ 交集（限定在已有蒙版内）/ 差集（从已有蒙版挖除） */
export type MaskCombine = 'union' | 'intersect' | 'subtract';

/** 蒙版笔画（画笔蒙版）：归一化坐标点列（y 顶部原点），radius 按画面高度比例 */
export interface MaskStroke {
  pts: Array<[number, number]>;
  radius: number;
  hardness: number;
}

/** 多局部蒙版列表项：在单渐变参数上附加稳定 id（供 UI 列表 key 与选中） */
export interface GradationItem extends GradationParams {
  id: string;
}

// ---------------- 第二档：HSL 取色限定器（二级调色，仅完整版） ----------------
export interface QualifierParams {
  enabled: boolean;
  /** 中心色相 0~360（吸管点选像素后设定） */
  centerHue: number;
  /** 色相选中半宽（度），0~180 */
  hueRange: number;
  /** 选区边界柔化（度），0~60 */
  hueFeather: number;
  /** 选区内曝光（EV）-2 ~ 2 */
  exposure: number;
  /** 选区内色温 -1 ~ 1 */
  temperature: number;
  /** 选区内饱和度 -1 ~ 1 */
  saturation: number;
}

// ---------------- 第二档：Soft Clip 高光/阴影滚降（仅完整版） ----------------
export interface ToneRollParams {
  /** 高光滚降 0~1：把接近白的高光平滑压回、保住层次（0=关闭） */
  highlights: number;
  /** 阴影滚降 0~1：把接近黑的阴影平滑压实（0=关闭） */
  shadows: number;
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
  /** 第二档：Log 色轮 Lift / Gamma / Gain */
  logWheels: LogWheelsParams;
  /** 第二档：效果 */
  effects: EffectsParams;
  /** v0.3.0：局部渐变（兼容字段，新工程以 gradations 为准；旧工程由 ensureParams 迁移） */
  gradation: GradationParams;
  /** v0.4.0：多局部蒙版（线性/径向叠加，上限 8） */
  gradations: GradationItem[];
  /** v0.4.0：HSL 取色限定器（二级调色） */
  qualifier: QualifierParams;
  /** v0.4.0：Soft Clip 高光/阴影滚降 */
  tonemap: ToneRollParams;
  lut: LutParams;
  /** v0.5.0：多重图片叠加（混合图层，进 GL 管线） */
  blend?: BlendParams;
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
  logWheels: {
    enabled: false,
    lift: { x: 0, y: 0, luma: 0 },
    gamma: { x: 0, y: 0, luma: 0 },
    gain: { x: 0, y: 0, luma: 0 },
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
    combine: 'union',
    lumaLo: 0.25,
    lumaHi: 0.75,
    lumaSoft: 0.15,
    hueCenter: 0,
    hueRange: 30,
    hueFeather: 15,
    strokes: [],
    x1: 0.15,
    y1: 0.5,
    x2: 0.85,
    y2: 0.5,
    exposure: 0,
    temperature: 0,
    tint: 0,
  },
  gradations: [],
  qualifier: {
    enabled: false,
    centerHue: 0,
    hueRange: 30,
    hueFeather: 15,
    exposure: 0,
    temperature: 0,
    saturation: 0,
  },
  tonemap: {
    highlights: 0,
    shadows: 0,
  },
  lut: {
    id: null,
    path: null,
    isBuiltin: false,
    strength: 0,
  },
  blend: defaultBlendParams(),
};

/** 多局部蒙版数量上限（shader 多 pass / UI 列表共同约束） */
export const MAX_GRADATIONS = 8;

let gradSeq = 0;
/** 新建一个默认蒙版（线性，水平贯穿，中性参数），id 进程内唯一 */
export function createGradation(type: 'linear' | 'radial' | 'brush' | 'luminance' | 'color' = 'linear'): GradationItem {
  gradSeq += 1;
  return {
    id: `g_${Date.now().toString(36)}_${gradSeq}`,
    enabled: true,
    type,
    combine: 'union',
    lumaLo: 0.25,
    lumaHi: 0.75,
    lumaSoft: 0.15,
    hueCenter: 0,
    hueRange: 30,
    hueFeather: 15,
    strokes: [],
    x1: 0.15,
    y1: 0.5,
    x2: 0.85,
    y2: 0.5,
    exposure: 0,
    temperature: 0,
    tint: 0,
  };
}

function cloneStrokes(strokes: MaskStroke[] | null | undefined): MaskStroke[] {
  return Array.isArray(strokes)
    ? strokes.map((st) => ({
        radius: st.radius,
        hardness: st.hardness,
        pts: Array.isArray(st.pts) ? st.pts.map(([x, y]) => [x, y] as [number, number]) : [],
      }))
    : [];
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** 把任意（可能来自旧工程/损坏快照的）蒙版数据补全为合法 GradationItem */
export function normalizeGradation(g: Partial<GradationItem> | null | undefined, idx = 0): GradationItem {
  return {
    id: (g && typeof g.id === 'string' && g.id) || `g${idx + 1}`,
    enabled: !!g?.enabled,
    type: g?.type === 'radial' ? 'radial' : g?.type === 'brush' ? 'brush' : g?.type === 'luminance' ? 'luminance' : g?.type === 'color' ? 'color' : 'linear',
    combine: g?.combine === 'intersect' || g?.combine === 'subtract' ? g.combine : 'union',
    lumaLo: clampNum(g?.lumaLo, 0, 1, 0.25),
    lumaHi: clampNum(g?.lumaHi, 0, 1, 0.75),
    lumaSoft: clampNum(g?.lumaSoft, 0, 0.5, 0.15),
    hueCenter: clampNum(g?.hueCenter, 0, 360, 0),
    hueRange: clampNum(g?.hueRange, 0, 180, 30),
    hueFeather: clampNum(g?.hueFeather, 0, 90, 15),
    strokes: cloneStrokes(g?.strokes),
    x1: clampNum(g?.x1, -0.5, 1.5, 0.15),
    y1: clampNum(g?.y1, -0.5, 1.5, 0.5),
    x2: clampNum(g?.x2, -0.5, 1.5, 0.85),
    y2: clampNum(g?.y2, -0.5, 1.5, 0.5),
    exposure: clampNum(g?.exposure, -2, 2, 0),
    temperature: clampNum(g?.temperature, -1, 1, 0),
    tint: clampNum(g?.tint, -1, 1, 0),
  };
}

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
  if (p.logWheels) {
    out.logWheels.enabled = !!p.logWheels.enabled;
    for (const key of ['lift', 'gamma', 'gain'] as const) {
      Object.assign(out.logWheels[key], p.logWheels[key] ?? {});
    }
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
    out.gradation.type = gp.type === 'radial' ? 'radial' : gp.type === 'brush' ? 'brush' : gp.type === 'luminance' ? 'luminance' : gp.type === 'color' ? 'color' : 'linear';
    out.gradation.exposure = gp.exposure ?? 0;
    out.gradation.temperature = gp.temperature ?? 0;
    out.gradation.tint = gp.tint ?? 0;
  }
  if (p.lut) Object.assign(out.lut, p.lut);
  if (Array.isArray(p.gradations)) {
    out.gradations = p.gradations.slice(0, MAX_GRADATIONS).map((g, i) => normalizeGradation(g, i));
  } else if (p.gradation?.enabled) {
    // 旧版只有单个 gradation：迁移为多蒙版列表第一项
    out.gradations = [normalizeGradation({ ...p.gradation, id: 'g1' }, 0)];
  }
  if (p.qualifier) Object.assign(out.qualifier, p.qualifier);
  if (p.tonemap) Object.assign(out.tonemap, p.tonemap);
  if (p.blend) {
    out.blend = {
      enabled: !!p.blend.enabled,
      position: p.blend.position === 'before-lut' ? 'before-lut' : 'after-lut',
      layers: Array.isArray(p.blend.layers)
        ? p.blend.layers.slice(0, MAX_BLEND_LAYERS).map((l, i) => normalizeBlendLayer(l, i))
        : [],
    };
  }
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
    logWheels: {
      enabled: p.logWheels.enabled,
      lift: { ...p.logWheels.lift },
      gamma: { ...p.logWheels.gamma },
      gain: { ...p.logWheels.gain },
    },
    effects: { ...p.effects },
    gradation: { ...p.gradation, strokes: cloneStrokes(p.gradation.strokes) },
    gradations: Array.isArray(p.gradations)
      ? p.gradations.map((g) => ({ ...g, strokes: cloneStrokes(g.strokes) }))
      : [],
    qualifier: { ...defaultEditParams.qualifier, ...(p.qualifier ?? {}) },
    tonemap: { ...defaultEditParams.tonemap, ...(p.tonemap ?? {}) },
    lut: { ...p.lut },
  };
  if (p.blend) {
    cloned.blend = {
      enabled: p.blend.enabled,
      position: p.blend.position,
      layers: p.blend.layers.map((l) => ({ ...l })),
    };
  }
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
  logWheels: LogWheelsParams;
  effects: EffectsParams;
  qualifier: QualifierParams;
  tonemap: ToneRollParams;
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
    logWheels: c.logWheels,
    effects: c.effects,
    qualifier: c.qualifier,
    tonemap: c.tonemap,
    lut: c.lut,
  };
}
