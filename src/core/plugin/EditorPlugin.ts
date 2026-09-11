import type { RenderStage } from '../render/RenderStage';

// 插件契约（P0 只留类型，P1 接 watermark-engine）
export interface PipelineContext {
  /** 往管线末尾注册 Stage（水印固定在 Lut 之后） */
  addStage(stage: RenderStage): void;
}

export interface EditorPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  setup(pipeline: PipelineContext): void;
  dispose?(): void;
}

/** 极简插件注册器：只支持内置插件注册，不做远程商店（第一版刻意不做） */
export class PluginRegistry {
  private readonly plugins = new Map<string, EditorPlugin>();
  private readonly instances = new Map<string, EditorPlugin>();

  register(plugin: EditorPlugin): void {
    if (this.plugins.has(plugin.id)) return;
    this.plugins.set(plugin.id, plugin);
  }

  list(): EditorPlugin[] {
    return [...this.plugins.values()];
  }

  /** 按注册顺序把插件的 Stage 挂到管线 */
  setupAll(ctx: PipelineContext): EditorPlugin[] {
    const started: EditorPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      plugin.setup(ctx);
      this.instances.set(plugin.id, plugin);
      started.push(plugin);
    }
    return started;
  }

  disposeAll(): void {
    for (const p of this.instances.values()) p.dispose?.();
    this.instances.clear();
  }
}
