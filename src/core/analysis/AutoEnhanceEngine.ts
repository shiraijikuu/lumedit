import type { AdjustParams } from '@/types/EditParams';
import type { AnalysisResult } from './HistogramAnalyzer';

export type AutoAdjustments = Partial<Pick<AdjustParams, 'exposure' | 'temperature' | 'contrast' | 'saturation'>>;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * 基于规则的自动优化决策。输入只依赖直方图分析结果，输出是 AdjustParams 的增量。
 * 第一版刻意保守：先曝光、再白平衡、最后对比度/饱和度，每项独立限幅。
 */
export function computeAutoAdjustments(result: AnalysisResult): AutoAdjustments {
  const out: AutoAdjustments = {};

  // 曝光：以平均亮度为锚点，暗图提亮、亮图压暗；极暗/极亮也保留上限保护。
  let exposure = 0;
  if (result.meanLuma < 0.42) {
    exposure = clamp((0.42 - result.meanLuma) * 2.4, 0, 1);
  } else if (result.meanLuma > 0.64) {
    exposure = -clamp((result.meanLuma - 0.64) * 2.4, 0, 1);
  }
  if (result.meanLuma < 0.03 || result.meanLuma > 0.97) exposure = clamp(exposure, -0.8, 0.8);
  if (Math.abs(exposure) >= 0.01) out.exposure = round3(exposure);

  // 白平衡：蓝偏多则加暖，红偏多则降温。
  const temp = clamp((result.averageColor.b - result.averageColor.r) * 1.8, -0.3, 0.3);
  if (Math.abs(temp) >= 0.01) out.temperature = round3(temp);

  const conservative = result.isLowContrast ? 0.75 : 1;

  // 对比度：按 0.5% / 99.5% 分位区间宽度决定，低对比才增加，最多 +0.4。
  const contrast = clamp((0.55 - result.contrastScore) * 0.9 * conservative, 0, 0.4);
  if (contrast >= 0.01) out.contrast = round3(contrast);

  // 饱和度：低饱和图像小幅增益；仅极高饱和时做极轻微回收。
  let saturation = 0;
  if (result.meanSaturation < 0.22) {
    saturation = clamp((0.22 - result.meanSaturation) * 1.1 * conservative, 0, 0.3);
  } else if (result.meanSaturation > 0.75) {
    saturation = clamp((0.22 - result.meanSaturation) * 0.4, -0.1, 0);
  }
  if (Math.abs(saturation) >= 0.01) out.saturation = round3(saturation);

  return out;
}
