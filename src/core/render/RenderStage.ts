import type { EditParams } from '@/types/EditParams';

export type RenderContext = {
  gl: WebGL2RenderingContext;
  /** 当前管线图像宽度（像素），GeometryStage 裁剪后会就地改写，解决尺寸变化问题 */
  width: number;
  /** 当前管线图像高度（像素） */
  height: number;
};

export interface RenderStage {
  readonly name: string;
  /**
   * 执行渲染阶段
   * MVP 规则：固定返回新 WebGLTexture，旧纹理由 RenderPipeline 统一销毁
   * 注意：不要销毁 input 纹理；若直通返回 input 也允许（管线不会删除它）
   * 需要改变输出尺寸的 Stage（Geometry）就地改写 context.width/height
   */
  execute(
    input: WebGLTexture,
    params: EditParams,
    context: RenderContext
  ): WebGLTexture;

  destroy(): void;
}
