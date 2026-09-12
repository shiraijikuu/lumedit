import type { RenderStage, RenderContext } from './RenderStage';
import type { EditParams } from '@/types/EditParams';
import { cloneParams, defaultEditParams } from '@/types/EditParams';
import { BlitProgram } from './BlitProgram';
import { runPipeline } from './renderPipeline';
import { attachTextureToFBO, bitmapToTextureSource } from './gpuUtils';
import { TexturePool, releaseTarget } from './texturePool';

export class ImageRenderer {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private readonly context: RenderContext;

  private stages: RenderStage[] = [];
  private params: EditParams = cloneParams(defaultEditParams);

  private readonly blit = new BlitProgram();
  private inputBitmap: ImageBitmap | null = null;
  private inputSourceCanvas: OffscreenCanvas | null = null;
  private inputTexture: WebGLTexture | null = null;
  private currentTexture: WebGLTexture | null = null;
  private inputW = 0;
  private inputH = 0;
  private outW = 0;
  private outH = 0;
  private compareOriginal = false;
  private readonly restoreHooks: Array<() => void> = [];
  /** 中间纹理池：拖动滑块时逐帧复用，不再反复分配/销毁全分辨率纹理 */
  private pool: TexturePool | null = null;
  /** rAF 合帧：一帧内的多次 setParams 只跑一次管线 */
  private rafPending = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: false,
      antialias: false,
      alpha: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');

    this.gl = gl;
    this.context = { gl, width: 0, height: 0 };

    // 必须 preventDefault，否则上下文永久销毁
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  /** WebGL2 是否可用（供 UI 在构造前友好探测） */
  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch {
      return false;
    }
  }

  private stageChanged = false;

  setStages(stages: RenderStage[]): void {
    const before = this.stages.map((s) => s.name).join('>');
    const after = stages.map((s) => s.name).join('>');
    this.stageChanged = before !== after;
    this.stages = stages;
  }

  /** 输入图（Orientation 校正后）尺寸 */
  getInputSize(): { width: number; height: number } {
    return { width: this.inputW, height: this.inputH };
  }

  /** 最近一次管线输出尺寸（几何变换后），供 overlay 定位 */
  getOutputSize(): { width: number; height: number } {
    return { width: this.outW, height: this.outH };
  }

  getGLContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  getStage<T extends RenderStage>(name: string): T | undefined {
    return this.stages.find((s) => s.name === name) as T | undefined;
  }

  /** 注册上下文恢复后的资源重建钩子（如重新喂入外部 LUT 数据） */
  onRestored(hook: () => void): void {
    this.restoreHooks.push(hook);
  }

  private ensurePool(): void {
    if (!this.gl) return;
    if (!this.pool) this.pool = new TexturePool(this.gl);
    this.context.pool = this.pool;
  }

  setParams(params: EditParams): void {
    this.params = cloneParams(params);
    this.scheduleRender();
  }

  /** 参数变化经 rAF 合帧：同一帧内滑块的多次响应式触发只跑一次管线 */
  private scheduleRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.renderPreview();
    });
  }

  /** 按住显示原图：绕过全部 Stage，直接显示 Orientation 校正后的输入 */
  setCompareOriginal(on: boolean): void {
    if (this.compareOriginal === on) return;
    this.compareOriginal = on;
    this.renderPreview();
  }

  setInputImage(bitmap: ImageBitmap): void {
    if (this.inputBitmap) {
      this.inputBitmap.close();
    }
    // 归还上一张图的结果纹理（否则换图后池外泄漏），再清引用
    if (this.currentTexture && this.currentTexture !== this.inputTexture && this.pool) {
      releaseTarget(this.context, this.currentTexture, this.outW, this.outH);
    }
    this.currentTexture = null;
    this.inputBitmap = bitmap;
    this.uploadInputTexture();
    this.renderPreview();
  }

  private uploadInputTexture(): void {
    if (!this.gl || !this.inputBitmap) return;

    if (this.inputTexture) {
      this.gl.deleteTexture(this.inputTexture);
      this.inputTexture = null;
    }

    const tex = this.gl.createTexture();
    if (!tex) throw new Error('create input texture failed');

    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);

    // 关键：ANGLE(D3D11) 对 ImageBitmap 源会忽略 UNPACK_FLIP_Y（真机实测上下颠倒），
    // 必须先绘制到 OffscreenCanvas，用 Canvas 源上传 flipY 才生效。
    this.inputSourceCanvas = bitmapToTextureSource(this.inputBitmap);

    // 上传前翻转 Y 轴：匹配 WebGL 纹理坐标原点（左下）与图像像素原点（左上）
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA8,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.inputSourceCanvas
    );
    // 用完立即恢复默认，避免影响后续数据纹理（LUT 等不翻转）
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    this.inputTexture = tex;
    this.inputW = this.inputBitmap.width;
    this.inputH = this.inputBitmap.height;
    this.context.width = this.inputBitmap.width;
    this.context.height = this.inputBitmap.height;
  }

  renderPreview(): void {
    if (!this.gl || !this.inputTexture) return;
    this.ensurePool();

    // 旧结果纹理记账（其尺寸 = 上次输出尺寸），新帧就绪后归还池
    const prevTexture = this.currentTexture;
    const prevW = this.outW;
    const prevH = this.outH;

    let texture: WebGLTexture;
    if (this.compareOriginal) {
      texture = this.inputTexture;
      this.outW = this.inputW;
      this.outH = this.inputH;
    } else {
      // 每帧从输入尺寸开始（GeometryStage 会改写 context 尺寸）
      this.context.width = this.inputBitmap!.width;
      this.context.height = this.inputBitmap!.height;
      const out = runPipeline(
        this.gl,
        this.stages,
        this.inputTexture,
        this.params,
        this.context
      );
      texture = out.texture;
      this.outW = this.context.width;
      this.outH = this.context.height;
    }

    if (prevTexture && prevTexture !== this.inputTexture && prevTexture !== texture) {
      releaseTarget(this.context, prevTexture, prevW, prevH);
    }
    this.currentTexture = texture;
    this.drawToScreen(texture);

    // 管线构成切换（如进入/退出裁剪）后补一帧：可见窗口由 rAF 及时上屏，
    // 离屏/最小化时 rAF 可能被暂停，用 setTimeout 兜底，避免合成器残留上一条管线的旧帧。
    if (this.stageChanged) {
      this.stageChanged = false;
      const repaint = (): void => {
        const tex = this.currentTexture ?? this.inputTexture;
        if (this.gl && tex) this.drawToScreen(tex);
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(repaint);
      window.setTimeout(repaint, 0);
    }
  }

  /** 用最近一次管线结果重绘上屏（不重跑管线），供外部在布局变化后调用 */
  repaint(): void {
    if (!this.gl) return;
    const tex = this.currentTexture ?? this.inputTexture;
    if (!tex) return;
    this.drawToScreen(tex);
  }

  /**
   * 白平衡吸管：画布 CSS 坐标 → 当前输出纹理 5×5 均值取样（0-255）。
   * 复用 drawToScreen 的 contain 映射求 UV；WebGL 原点在左下，Y 需翻转。
   */
  pickColor(cssX: number, cssY: number): { r: number; g: number; b: number } | null {
    const gl = this.gl;
    const tex = this.currentTexture ?? this.inputTexture;
    if (!gl || !tex || !this.currentTexture) return null;

    const dpr = window.devicePixelRatio || 1;
    const px = cssX * dpr;
    const py = cssY * dpr;
    const imgAspect = this.context.width / this.context.height;
    const canvasAspect = this.canvas.width / this.canvas.height;
    let dw = this.canvas.width;
    let dh = this.canvas.height;
    if (imgAspect > canvasAspect) {
      dh = this.canvas.width / imgAspect;
    } else {
      dw = this.canvas.height * imgAspect;
    }
    const ox = (this.canvas.width - dw) / 2;
    const oy = (this.canvas.height - dh) / 2;
    const u = (px - ox) / dw;
    const vf = (py - oy) / dh;
    if (u < 0 || u > 1 || vf < 0 || vf > 1) return null;
    const v = 1 - vf;

    const W = this.context.width;
    const H = this.context.height;
    const size = Math.min(5, W, H);
    if (size <= 0) return null;
    const sx = Math.max(0, Math.min(W - size, Math.round(u * W) - (size >> 1)));
    const sy = Math.max(0, Math.min(H - size, Math.round(v * H) - (size >> 1)));

    let fbo: WebGLFramebuffer | null = null;
    try {
      fbo = attachTextureToFBO(gl, tex);
      // attachTextureToFBO 返回前会解绑，读像素前重新绑定
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const pixels = new Uint8Array(size * size * 4);
      gl.readPixels(sx, sy, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let r = 0, g = 0, b = 0;
      const n = size * size;
      for (let i = 0; i < n; i++) {
        r += pixels[i * 4];
        g += pixels[i * 4 + 1];
        b += pixels[i * 4 + 2];
      }
      return { r: r / n, g: g / n, b: b / n };
    } catch {
      return null;
    } finally {
      if (fbo) gl.deleteFramebuffer(fbo);
    }
  }

  private drawToScreen(texture: WebGLTexture): void {
    const gl = this.gl;
    if (!gl) return;

    // 1. 计算 canvas 物理像素尺寸，处理高 DPI
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

    // 2. 同步 canvas 缓冲区尺寸（修改宽高会清空缓冲区，必须紧接着重绘）
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    // 3. 绑定默认帧缓冲，全画布清屏（棋盘格由 CSS 背景承担）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0.078, 0.082, 0.094, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 4. contain 模式等比缩放，居中显示
    const imgAspect = this.context.width / this.context.height;
    const canvasAspect = pixelWidth / pixelHeight;

    let drawWidth = pixelWidth;
    let drawHeight = pixelHeight;
    if (imgAspect > canvasAspect) {
      drawHeight = pixelWidth / imgAspect;
    } else {
      drawWidth = pixelHeight * imgAspect;
    }
    const offsetX = Math.floor((pixelWidth - drawWidth) / 2);
    const offsetY = Math.floor((pixelHeight - drawHeight) / 2);

    // 5. 设置绘制视口并输出
    gl.viewport(offsetX, offsetY, drawWidth, drawHeight);
    this.blit.draw(gl, texture);
    gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  resize(): void {
    if (!this.gl) return;
    const tex = this.currentTexture ?? this.inputTexture;
    if (!tex) return;
    this.drawToScreen(tex);
  }

  /**
   * 离屏捕获「几何/调色/LUT 后、水印前」的结果为 PNG dataURL（无黑边、无 DPR 缩放）。
   * 供 camera-watermark 工作室取底图、以及水印预览/导出离屏合成使用。同步实现（HTMLCanvasElement）。
   */
  captureEdited(maxEdge = 2000): string | null {
    const gl = this.gl;
    if (!gl || !this.inputTexture) return null;
    this.ensurePool();

    const savedW = this.context.width;
    const savedH = this.context.height;
    this.context.width = this.inputW;
    this.context.height = this.inputH;
    const out = runPipeline(gl, this.stages, this.inputTexture, this.params, this.context);
    const W = this.context.width;
    const H = this.context.height;

    // 离屏 FBO + readPixels 读回（不依赖 preserveDrawingBuffer）
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      if (out.texture !== this.inputTexture) releaseTarget(this.context, out.texture, W, H);
      this.context.width = savedW;
      this.context.height = savedH;
      return null;
    }
    const pixels = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    if (out.texture !== this.inputTexture) releaseTarget(this.context, out.texture, W, H);
    this.context.width = savedW;
    this.context.height = savedH;

    // WebGL 像素原点在左下，垂直翻回上原点；按需降采样
    const k = Math.min(1, maxEdge / Math.max(W, H));
    const cw = Math.max(1, Math.round(W * k));
    const ch = Math.max(1, Math.round(H * k));
    const raw = document.createElement('canvas');
    raw.width = W;
    raw.height = H;
    raw.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), W, H), 0, 0);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = cw;
    outCanvas.height = ch;
    const cx = outCanvas.getContext('2d')!;
    cx.imageSmoothingQuality = 'high';
    cx.translate(0, ch);
    cx.scale(1, -1);
    cx.drawImage(raw, 0, 0, cw, ch);
    return outCanvas.toDataURL('image/png');
  }

  destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    this.stages.forEach((stage) => stage.destroy());
    this.stages = [];
    this.blit.destroy();
    this.pool?.dispose();
    this.pool = null;
    this.context.pool = undefined;

    const inputTex = this.inputTexture;
    const currentTex = this.currentTexture;
    this.inputTexture = null;
    this.currentTexture = null;

    if (currentTex && currentTex !== inputTex) {
      gl.deleteTexture(currentTex);
    }
    if (inputTex) {
      gl.deleteTexture(inputTex);
    }
    if (this.inputBitmap) {
      this.inputBitmap.close();
      this.inputBitmap = null;
    }
    this.inputSourceCanvas = null;

    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.gl = null;
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    if (!this.gl) return;
    // 触发所有 Stage 销毁，置空内部状态，保证恢复后重新初始化
    this.stages.forEach((stage) => stage.destroy());
    this.blit.destroy();
    // GPU 资源全部失效，清空引用（保留 context 对象，恢复时覆盖其 gl）
    this.inputTexture = null;
    this.currentTexture = null;
    // 池内句柄已全部失效：只清引用不发 GL 调用
    this.pool?.clear();
    this.pool = null;
    this.context.pool = undefined;
    this.gl = null;
  };

  private onContextRestored = (): void => {
    // canvas 是唯一可信入口
    const gl = this.canvas.getContext('webgl2', {
      preserveDrawingBuffer: false,
      antialias: false,
      alpha: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 context restore failed');

    this.gl = gl;
    this.context.gl = gl;

    // 重新上传原图
    this.uploadInputTexture();
    // 上层重建 Stage 内资源（内置 LUT 从内存重建，外部 LUT 重新解析喂入）
    this.restoreHooks.forEach((hook) => {
      try {
        hook();
      } catch (err) {
        console.error('[ImageRenderer] restore hook failed', err);
      }
    });
    this.renderPreview();
  };
}
