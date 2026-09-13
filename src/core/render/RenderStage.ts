import type { TargetFormat } from './gpuUtils';
import type { TexturePool } from './texturePool';
import type { EditParams } from '@/types/EditParams';

export type RenderContext = {
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  pool?: TexturePool;
  /**
   * 中间渲染目标格式。能力探测后由渲染器/导出 Worker 决定：
   * - 'rgba8'   ：不支持浮点颜色缓冲时回退（旧行为）
   * - 'rgba16f' ：半浮点中间纹理，消除多级串联的量化色带，且能在 Stage 间保留 >1 的高光
   * 输入纹理始终是 RGBA8；仅管线中间纹理按此格式分配。缺省按 rgba8，保证旧调用点零改动。
   */
  targetFormat?: TargetFormat;
};

export interface RenderStage {
  readonly name: string;
  /**
   * 执行渲染阶段
   * MVP 规则：固定返回新 WebGLTexture，旧纹理由 RenderPipeline 统一销毁
   * 注意：不要销毁 input 纹理
   */
  execute(
    input: WebGLTexture,
    params: EditParams,
    context: RenderContext
  ): WebGLTexture;

  destroy(): void;
}
