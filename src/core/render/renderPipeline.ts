import type { EditParams } from '@/types/EditParams';
import type { RenderContext, RenderStage } from './RenderStage';
import { releaseTarget } from './texturePool';

export interface PipelineOutput {
  texture: WebGLTexture;
  width: number;
  height: number;
}

/**
 * 顺序执行渲染管线（顺序不可调整）：
 * 原图 → Orientation 校正（上传前完成）→ 裁剪/旋转/翻转 → 调色链 → LUT → 输出
 *
 * 中间纹理统一经 releaseTarget 归还：有池（预览）回收复用，无池（导出）删除；
 * 永不归还 inputTexture；Stage 改变尺寸时就地改写 context.width/height，
 * 因此每个中间纹理的尺寸必须在 Stage 执行前记录。
 * 预览（ImageRenderer）与导出（Worker）共用本函数，保证所见即所得。
 */
export function runPipeline(
  _gl: WebGL2RenderingContext,
  stages: RenderStage[],
  inputTexture: WebGLTexture,
  params: EditParams,
  context: RenderContext
): PipelineOutput {
  let texture = inputTexture;
  for (const stage of stages) {
    const prevW = context.width;
    const prevH = context.height;
    const next = stage.execute(texture, params, context);
    if (next !== texture && texture !== inputTexture) {
      releaseTarget(context, texture, prevW, prevH);
    }
    texture = next;
  }
  return { texture, width: context.width, height: context.height };
}

/** 销毁管线中除输入纹理外的产物（兜底用） */
export function disposeStages(gl: WebGL2RenderingContext, stages: RenderStage[]): void {
  for (const stage of stages) {
    try {
      stage.destroy();
    } catch (err) {
      console.error(`[render] stage ${stage.name} destroy error`, err);
    }
  }
  void gl;
}
