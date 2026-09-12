// WebGL2 中间纹理池：按尺寸分桶、空闲复用，消灭拖动滑块时的逐帧纹理分配/销毁。
// 预览管线 7 个 Stage 每帧各要一张全分辨率 RGBA8（2000px 下每张 ~16MB），
// 复用后同尺寸稳态只需 2~3 张活跃纹理（天然的 ping-pong）。
// 导出 Worker 的一次性渲染不挂池，自动回落到「即建即删」旧路径。
import type { RenderContext } from './RenderStage';
import { createRGBA8Texture } from './gpuUtils';

/** 每个尺寸桶最多保留的空闲纹理数，超出直接销毁（防裁剪比例反复切换时内存膨胀） */
const MAX_FREE_PER_BUCKET = 3;

export class TexturePool {
  private readonly gl: WebGL2RenderingContext;
  /** 本池创建过的全部纹理（dispose 时统一销毁，含仍在外的） */
  private readonly owned = new Set<WebGLTexture>();
  /** sizeKey → 空闲纹理列表 */
  private readonly free = new Map<string, WebGLTexture[]>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  private static key(w: number, h: number): string {
    return `${w}x${h}`;
  }

  acquire(width: number, height: number): WebGLTexture {
    const key = TexturePool.key(width, height);
    const bucket = this.free.get(key);
    const tex = bucket?.pop();
    if (tex) {
      if (bucket!.length === 0) this.free.delete(key);
      return tex;
    }
    const created = createRGBA8Texture(this.gl, width, height);
    this.owned.add(created);
    return created;
  }

  /** 归还一张本池创建的纹理；外来纹理（如输入图）直接删除 */
  release(texture: WebGLTexture, width: number, height: number): void {
    if (!this.owned.has(texture)) {
      this.gl.deleteTexture(texture);
      return;
    }
    const key = TexturePool.key(width, height);
    let bucket = this.free.get(key);
    if (!bucket) {
      bucket = [];
      this.free.set(key, bucket);
    }
    if (bucket.length >= MAX_FREE_PER_BUCKET) {
      this.owned.delete(texture);
      this.gl.deleteTexture(texture);
      return;
    }
    bucket.push(texture);
  }

  owns(texture: WebGLTexture): boolean {
    return this.owned.has(texture);
  }

  /** 池内纹理数（含借出未还），测试/诊断用 */
  get liveCount(): number {
    return this.owned.size;
  }

  /** 空闲纹理数 */
  get freeCount(): number {
    let n = 0;
    for (const b of this.free.values()) n += b.length;
    return n;
  }

  /** 上下文丢失后调用：句柄全部失效，仅清引用、不发 GL 调用 */
  clear(): void {
    this.owned.clear();
    this.free.clear();
  }

  /** 销毁池内全部纹理（GL 上下文仍有效时用） */
  dispose(): void {
    for (const tex of this.owned) this.gl.deleteTexture(tex);
    this.owned.clear();
    this.free.clear();
  }
}

/** Stage 取目标纹理：有池走池，无池（导出 Worker / 测试直调）现建 */
export function acquireTarget(
  ctx: RenderContext,
  width: number,
  height: number
): WebGLTexture {
  if (ctx.pool) return ctx.pool.acquire(width, height);
  return createRGBA8Texture(ctx.gl, width, height);
}

/** 归还管线中间纹理：有池回收复用，无池删除（输入图等外来纹理不会被池误收） */
export function releaseTarget(
  ctx: RenderContext,
  texture: WebGLTexture,
  width: number,
  height: number
): void {
  if (ctx.pool) {
    ctx.pool.release(texture, width, height);
  } else {
    ctx.gl.deleteTexture(texture);
  }
}
