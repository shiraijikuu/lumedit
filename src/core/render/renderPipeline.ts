import type { EditParams } from '@/types/EditParams';
import type { RenderContext, RenderStage } from './RenderStage';

export interface PipelineOutput {
  texture: WebGLTexture;
  width: number;
  height: number;
}

/**
 * 顺序执行渲染管线（顺序不可调整）：
 * 原图 → Orientation 校正（上传前完成）→ 裁剪/旋转/翻转 → 基础调色 → LUT → 输出
 *
 * 统一负责中间纹理销毁：只删中间纹理，永不删 inputTexture；
 * Stage 需要改变尺寸时就地改写 context.width/height。
 * 预览（ImageRenderer）与导出（Worker）共用本函数，保证所见即所得。
 */
export function runPipeline(
  gl: WebGL2RenderingContext,
  stages: RenderStage[],
  inputTexture: WebGLTexture,
  params: EditParams,
  context: RenderContext
): PipelineOutput {
  let texture = inputTexture;
  for (const stage of stages) {
    const next = stage.execute(texture, params, context);
    if (next !== texture && texture !== inputTexture) {
      gl.deleteTexture(texture);
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
