import type { RenderStage } from './RenderStage';
import { GeometryStage } from './stages/GeometryStage';
import { AdjustStage } from './stages/AdjustStage';
import { CurveStage } from './stages/CurveStage';
import { HslStage } from './stages/HslStage';
import { ColorGradeStage } from './stages/ColorGradeStage';
import { QualifierStage } from './stages/QualifierStage';
import { GradationStage } from './stages/GradationStage';
import { EffectsStage } from './stages/EffectsStage';
import { LutStage } from './stages/LutStage';
import { ToneRollStage } from './stages/ToneRollStage';

export interface EditStageBundle {
  ordered: RenderStage[];
  geometry: GeometryStage;
  adjust: AdjustStage;
  curve: CurveStage;
  hsl: HslStage;
  colorGrade: ColorGradeStage;
  qualifier: QualifierStage;
  gradation: GradationStage;
  effects: EffectsStage;
  lut: LutStage;
  tonemap: ToneRollStage;
  dispose(): void;
}

/**
 * 构建编辑管线（预览 ImageRenderer 与导出 Worker 共用同一套，保证所见即所得）。
 * 固定顺序（不可调整）：
 * 几何 → 基础调色 → 曲线 → HSL → 颜色分级 → 取色限定器(二级) →
 * 局部蒙版(多) → 效果 → LUT → Soft Clip 输出滚降。
 */
export function createEditStageBundle(): EditStageBundle {
  const geometry = new GeometryStage();
  const adjust = new AdjustStage();
  const curve = new CurveStage();
  const hsl = new HslStage();
  const colorGrade = new ColorGradeStage();
  const qualifier = new QualifierStage();
  const gradation = new GradationStage();
  const effects = new EffectsStage();
  const lut = new LutStage();
  const tonemap = new ToneRollStage();
  const ordered: RenderStage[] = [
    geometry,
    adjust,
    curve,
    hsl,
    colorGrade,
    qualifier,
    gradation,
    effects,
    lut,
    tonemap,
  ];
  return {
    ordered,
    geometry,
    adjust,
    curve,
    hsl,
    colorGrade,
    qualifier,
    gradation,
    effects,
    lut,
    tonemap,
    dispose() {
      ordered.forEach((s) => s.destroy());
    },
  };
}
