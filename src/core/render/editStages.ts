import type { RenderStage } from './RenderStage';
import { GeometryStage } from './stages/GeometryStage';
import { AdjustStage } from './stages/AdjustStage';
import { CurveStage } from './stages/CurveStage';
import { HslStage } from './stages/HslStage';
import { ColorGradeStage } from './stages/ColorGradeStage';
import { EffectsStage } from './stages/EffectsStage';
import { LutStage } from './stages/LutStage';
import { IS_FULL_TIER } from '@/config/tier';

/**
 * 统一组装编辑管线 Stage（预览与导出共用，保证所见即所得）：
 * 几何 → 基础影调 → 色调曲线 → [HSL → 颜色分级 → 效果（第二档）] → LUT。
 * basic 构建在编译期剔除第二档 Stage（IS_FULL_TIER 为常量字面量，可 tree-shake）。
 */
export interface EditStageBundle {
  geometry: GeometryStage;
  adjust: AdjustStage;
  curve: CurveStage;
  hsl: HslStage | null;
  colorGrade: ColorGradeStage | null;
  effects: EffectsStage | null;
  lut: LutStage;
  /** 按管线固定顺序排列的 Stage（几何 → … → LUT） */
  ordered: RenderStage[];
  dispose: () => void;
}

export function createEditStageBundle(): EditStageBundle {
  const geometry = new GeometryStage();
  const adjust = new AdjustStage();
  const curve = new CurveStage();
  const hsl = IS_FULL_TIER ? new HslStage() : null;
  const colorGrade = IS_FULL_TIER ? new ColorGradeStage() : null;
  const effects = IS_FULL_TIER ? new EffectsStage() : null;
  const lut = new LutStage();

  const ordered: RenderStage[] = [geometry, adjust, curve];
  if (hsl) ordered.push(hsl);
  if (colorGrade) ordered.push(colorGrade);
  if (effects) ordered.push(effects);
  ordered.push(lut);

  return {
    geometry,
    adjust,
    curve,
    hsl,
    colorGrade,
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
