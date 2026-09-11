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

export interface AdjustParams {
  /** 亮度 -1 ~ 1 */
  brightness: number;
  /** 对比度 -1 ~ 1 */
  contrast: number;
  /** 饱和度 -1 ~ 1 */
  saturation: number;
  /** 曝光（EV 档）-2 ~ 2 */
  exposure: number;
  /** 色温 -1（冷） ~ 1（暖） */
  temperature: number;
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

export interface EditParams {
  geometry: GeometryParams;
  adjust: AdjustParams;
  lut: LutParams;
  /** P1：camera-watermark 水印（管线最后一步，导出阶段离屏合成） */
  watermark?: WatermarkParams;
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
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    temperature: 0,
  },
  lut: {
    id: null,
    path: null,
    isBuiltin: false,
    strength: 0,
  },
};

/** 深拷贝参数（结构化克隆，杜绝撤销栈别名引用） */
export function cloneParams(p: EditParams): EditParams {
  const cloned: EditParams = {
    geometry: { ...p.geometry },
    adjust: { ...p.adjust },
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
