import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams } from '@/types/EditParams';

export class PassthroughStage implements RenderStage {
  public readonly name = 'passthrough';

  execute(
    input: WebGLTexture,
    _params: EditParams,
    _ctx: RenderContext
  ): WebGLTexture {
    // 原样传递输入纹理，不创建新资源，用于验证基础链路
    return input;
  }

  destroy(): void {
    // 无长期持有的资源
  }
}
