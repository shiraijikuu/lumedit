import type { RenderStage, RenderContext } from '../RenderStage';
import type { EditParams } from '@/types/EditParams';
import { BlitProgram } from '../BlitProgram';

// 第二阶段验证：验证中间纹理创建 / 管线统一销毁 / 多 Stage 串联显存不泄漏
export class CopyStage implements RenderStage {
  public readonly name = 'copy';
  private readonly blit = new BlitProgram();
  private fbo: WebGLFramebuffer | null = null;
  private gl: WebGL2RenderingContext | null = null;

  private initResources(gl: WebGL2RenderingContext): void {
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('[CopyStage] createFramebuffer failed');
    this.gl = gl;
    this.fbo = fbo;
  }

  execute(
    input: WebGLTexture,
    _params: EditParams,
    ctx: RenderContext
  ): WebGLTexture {
    const { gl, width, height } = ctx;
    if (!this.fbo) this.initResources(gl);

    // 1. 创建目标纹理并分配存储
    const dstTex = gl.createTexture();
    if (!dstTex) throw new Error('[CopyStage] createTexture failed');

    gl.bindTexture(gl.TEXTURE_2D, dstTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 2. 绑定 FBO 并挂载目标纹理
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      dstTex,
      0
    );

    const fboStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (fboStatus !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteTexture(dstTex);
      throw new Error(`[CopyStage] framebuffer incomplete: 0x${fboStatus.toString(16)}`);
    }

    // 每次 execute 强制重设 viewport
    gl.viewport(0, 0, width, height);

    // 3. 复用 BlitProgram 绘制到离屏 FBO
    this.blit.draw(gl, input);

    // 4. 清理状态
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return dstTex;
  }

  destroy(): void {
    this.blit.destroy();
    if (this.gl && this.fbo) {
      this.gl.deleteFramebuffer(this.fbo);
    }
    this.fbo = null;
    this.gl = null;
  }
}
