// 纹理池：Stage 输出目标（FBO 颜色附件）按「尺寸 × 格式」分桶复用，
// 避免拖一次滑块就反复 texImage2D 全分辨率纹理（RGBA8 ≈16MB/张、RGBA16F ≈32MB/张）。
// 仅池自己 acquire 出来的纹理会被回收；管线传入的外来纹理 release 时直接删除。
import type { RenderContext } from './RenderStage';
import { createTargetTexture, type TargetFormat } from './gpuUtils';

const MAX_FREE_PER_BUCKET = 3;

function bucketKey(width: number, height: number, format: TargetFormat): string {
  return `${width}x${height}@${format}`;
}

export class TexturePool {
  private free = new Map<string, WebGLTexture[]>();
  private owned = new Set<WebGLTexture>();
  /** 当前拥有的纹理总数（含空闲桶内待复用），与历史语义保持一致 */
  get liveCount(): number {
    return this.owned.size;
  }

  constructor(private gl: WebGL2RenderingContext) {}

  /** 借一块指定尺寸/格式的可渲染纹理（优先取空闲桶，否则新建并记录所有权） */
  acquire(width: number, height: number, format: TargetFormat = 'rgba8'): WebGLTexture {
    const key = bucketKey(width, height, format);
    const bucket = this.free.get(key);
    if (bucket && bucket.length > 0) {
      return bucket.pop()!;
    }
    const tex = createTargetTexture(this.gl, width, height, format);
    this.owned.add(tex);
    return tex;
  }

  /** 归还：自有纹理回收到对应桶（桶超上限则删除），外来纹理直接删除 */
  release(texture: WebGLTexture, width: number, height: number, format: TargetFormat = 'rgba8'): void {
    if (!this.owned.has(texture)) {
      this.gl.deleteTexture(texture);
      return;
    }
    const key = bucketKey(width, height, format);
    const bucket = this.free.get(key) ?? [];
    if (bucket.length >= MAX_FREE_PER_BUCKET) {
      this.owned.delete(texture);
      this.gl.deleteTexture(texture);
      return;
    }
    bucket.push(texture);
    this.free.set(key, bucket);
  }

  get freeCount(): number {
    let n = 0;
    for (const b of this.free.values()) n += b.length;
    return n;
  }

  owns(texture: WebGLTexture): boolean {
    return this.owned.has(texture);
  }

  /** 上下文丢失/切换图片时清空全部池纹理（含被借出、空闲桶内的所有自有纹理） */
  dispose(): void {
    for (const t of this.owned) this.gl.deleteTexture(t);
    this.owned.clear();
    this.free.clear();
  }
}

/** Stage 统一入口：按 RenderContext 决定的目标格式借纹理（无池时即时新建） */
export function acquireTarget(
  ctx: RenderContext,
  width: number,
  height: number
): WebGLTexture {
  const format = ctx.targetFormat ?? 'rgba8';
  if (ctx.pool) return ctx.pool.acquire(width, height, format);
  return createTargetTexture(ctx.gl, width, height, format);
}

/** Stage 统一出口：按 RenderContext 的目标格式归还（外来纹理会被直接删除） */
export function releaseTarget(
  ctx: RenderContext,
  texture: WebGLTexture,
  width: number,
  height: number
): void {
  const format = ctx.targetFormat ?? 'rgba8';
  if (ctx.pool) {
    ctx.pool.release(texture, width, height, format);
  } else {
    ctx.gl.deleteTexture(texture);
  }
}
