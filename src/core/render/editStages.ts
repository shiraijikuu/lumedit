// 渲染管线装配：预览（EditorCanvas）与导出（exportWorker）共用同一套 Stage 与顺序，
// 保证「所见即所得」。调色组内部顺序固定（有依赖关系）；多重叠加 blend 可置于 LUT 前/后；
// camera-watermark 水印不在 GL 管线内，导出时在主线程作为最后一步离屏合成。
import { GeometryStage } from './stages/GeometryStage';
import { AdjustStage } from './stages/AdjustStage';
import { CurveStage } from './stages/CurveStage';
import { HslStage } from './stages/HslStage';
import { ColorGradeStage } from './stages/ColorGradeStage';
import { LogWheelsStage } from './stages/LogWheelsStage';
import { QualifierStage } from './stages/QualifierStage';
import { GradationStage } from './stages/GradationStage';
import { EffectsStage } from './stages/EffectsStage';
import { LutStage } from './stages/LutStage';
import { ToneRollStage } from './stages/ToneRollStage';
import { BlendStage } from './stages/BlendStage';
import type { RenderStage } from './RenderStage';

export interface EditStageBundle {
  geometry: GeometryStage;
  adjust: AdjustStage;
  curve: CurveStage;
  hsl: HslStage;
  colorGrade: ColorGradeStage;
  logWheels: LogWheelsStage;
  qualifier: QualifierStage;
  gradation: GradationStage;
  effects: EffectsStage;
  lut: LutStage;
  blend: BlendStage;
  tonemap: ToneRollStage;
  /** 默认顺序（blend 在 LUT 之后） */
  readonly ordered: RenderStage[];
  /** 按叠加层相对 LUT 的位置组装管线 */
  orderedFor(position: 'before-lut' | 'after-lut'): RenderStage[];
  dispose(): void;
}

export function createEditStageBundle(): EditStageBundle {
  const geometry = new GeometryStage();
  const adjust = new AdjustStage();
  const curve = new CurveStage();
  const hsl = new HslStage();
  const colorGrade = new ColorGradeStage();
  const logWheels = new LogWheelsStage();
  const qualifier = new QualifierStage();
  const gradation = new GradationStage();
  const effects = new EffectsStage();
  const lut = new LutStage();
  const blend = new BlendStage();
  const tonemap = new ToneRollStage();

  // 调色组（顺序固定，存在色彩依赖）
  const colorStages: RenderStage[] = [
    geometry,
    adjust,
    curve,
    hsl,
    colorGrade,
    logWheels,
    qualifier,
    gradation,
    effects,
  ];

  const compose = (position: 'before-lut' | 'after-lut'): RenderStage[] => [
    ...colorStages,
    ...(position === 'before-lut' ? [blend] : []),
    lut,
    tonemap,
    ...(position === 'after-lut' ? [blend] : []),
  ];

  return {
    geometry,
    adjust,
    curve,
    hsl,
    colorGrade,
    logWheels,
    qualifier,
    gradation,
    effects,
    lut,
    blend,
    tonemap,
    get ordered() {
      return compose('after-lut');
    },
    orderedFor: compose,
    dispose() {
      geometry.destroy();
      adjust.destroy();
      curve.destroy();
      hsl.destroy();
      colorGrade.destroy();
      logWheels.destroy();
      qualifier.destroy();
      gradation.destroy();
      effects.destroy();
      lut.destroy();
      blend.destroy();
      tonemap.destroy();
    },
  };
}
