import type { EditParams } from '@/types/EditParams';
import type { TexturePool } from './texturePool';

export type RenderContext = {
  gl: WebGL2RenderingContext;
  /** 当前管线图像宽度（像素），GeometryStage 裁剪后会就地改写，解决尺寸变化问题 */
  width: number;
  /** 当前管线图像高度（像素） */
  height: number;
  /** 中间纹理池（可选）：预览渲染器挂池复用纹理；导出 Worker / 单测不挂，即建即删 */
  pool?: TexturePool;
};

export interface RenderStage {
  readonly name: string;
  /**
   * 执行渲染阶段
   * 目标纹理统一经 acquireTarget(ctx, w, h) 获取：有池复用、无池现建；
   * 管线会经 releaseTarget 归还中间纹理，不要自删（输入纹理除外——永不删除）。
   * 直通时返回 input 也允许；需要改变输出尺寸的 Stage（Geometry）就地改写 context.width/height
   */
  execute(
    input: WebGLTexture,
    params: EditParams,
    context: RenderContext
  ): WebGLTexture;

  destroy(): void;
}
