import type { RenderStage } from './RenderStage';
import { GeometryStage } from './stages/GeometryStage';
import { AdjustStage } from './stages/AdjustStage';
import { CurveStage } from './stages/CurveStage';
import { HslStage } from './stages/HslStage';
import { ColorGradeStage } from './stages/ColorGradeStage';
import { EffectsStage } from './stages/EffectsStage';
import { GradationStage } from './stages/GradationStage';
import { LutStage } from './stages/LutStage';

/**
 * 统一组装编辑管线 Stage（预览与导出共用，保证所见即所得）：
 * 几何 → 基础影调 → 色调曲线 → HSL → 颜色分级 → 效果 → LUT。
 */
export interface EditStageBundle {
  geometry: GeometryStage;
  adjust: AdjustStage;
  curve: CurveStage;
  hsl: HslStage;
  colorGrade: ColorGradeStage;
  gradation: GradationStage;
  effects: EffectsStage;
  lut: LutStage;
  /** 按管线固定顺序排列的 Stage（几何 → … → LUT） */
  ordered: RenderStage[];
  dispose: () => void;
}

export function createEditStageBundle(): EditStageBundle {
  const geometry = new GeometryStage();
  const adjust = new AdjustStage();
  const curve = new CurveStage();
  const hsl = new HslStage();
  const colorGrade = new ColorGradeStage();
  const gradation = new GradationStage();
  const effects = new EffectsStage();
  const lut = new LutStage();

  const ordered: RenderStage[] = [geometry, adjust, curve, hsl, colorGrade, gradation, effects, lut];

  return {
    geometry,
    adjust,
    curve,
    hsl,
    colorGrade,
    gradation,
    effects,
    lut,
    ordered,
    dispose() {
      for (const s of ordered) {
        try {
          s.destroy();
        } catch (err) {
          console.error(`[editStages] ${s.name} destroy error`, err);
        }
      }
    },
  };
}
