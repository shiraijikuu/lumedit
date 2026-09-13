// WebGL2 通用小工具：着色器编译、程序链接、纹理/FBO 创建，全部显式检查失败
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  tag: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`[${tag}] createShader failed`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[${tag}] shader compile failed: ${log}`);
  }
  return shader;
}

export interface ProgramBundle {
  program: WebGLProgram;
  uniform: (name: string) => WebGLUniformLocation | null;
  attrib: (name: string) => number;
}

/** 编译链接程序，返回 uniform/attrib 定位器 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  tag: string
): ProgramBundle {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc, tag);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, tag);
  const program = gl.createProgram();
  if (!program) throw new Error(`[${tag}] createProgram failed`);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[${tag}] program link failed: ${log}`);
  }
  return {
    program,
    uniform: (name: string) => gl.getUniformLocation(program, name),
    attrib: (name: string) => gl.getAttribLocation(program, name),
  };
}

/** 全屏三角形条带 VAO（aPos: vec2） */
export function createFullscreenQuad(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer } {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error('createFullscreenQuad: VAO/VBO failed');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return { vao, vbo };
}

/** 创建一块空的 RGBA8 2D 纹理（CLAMP_TO_EDGE + LINEAR） */
export function createRGBA8Texture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('createRGBA8Texture: createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
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
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/** 管线中间渲染目标格式：8bit 回退 / 16F 半浮点（高精度、可暂存 >1 高光） */
export type TargetFormat = 'rgba8' | 'rgba16f';

/**
 * 探测当前 WebGL2 上下文能否把 RGBA16F 作为「颜色渲染目标」。
 * WebGL2 里 16F 作为可采样纹理是核心能力，但渲染到 16F 必须启用 EXT_color_buffer_float；
 * 且 RGB16F 不可渲染，只能用 RGBA16F。仅 getExtension 成功不代表驱动真能渲染，
 * 必须真建一个 1×1 FBO 检查完整性（部分 SwiftShader / 老 ANGLE 会在此失败）。
 */
export function detectFloatRenderTarget(gl: WebGL2RenderingContext): boolean {
  if (!gl.getExtension('EXT_color_buffer_float')) return false;
  let ok = false;
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (tex && fbo) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (fbo) gl.deleteFramebuffer(fbo);
  if (tex) gl.deleteTexture(tex);
  return ok;
}

/** 按格式分配「可渲染中间纹理」（无初始数据）。RGBA16F 的线性过滤在 WebGL2 为核心可过滤格式，无需额外扩展。 */
export function createTargetTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: TargetFormat = 'rgba8'
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('createTargetTexture: createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    format === 'rgba16f' ? gl.RGBA16F : gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    format === 'rgba16f' ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/**
 * 从「当前已绑定的 FBO」读回一块像素，统一输出 0..255 的 RGBA。
 * rgba16f 颜色缓冲用 UNSIGNED_BYTE 读会 INVALID_OPERATION，必须 FLOAT + Float32Array 再量化；
 * rgba8 直接按字节读。调用方负责绑定/解绑 FBO。
 */
export function readFramebufferBytes(
  gl: WebGL2RenderingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  format: TargetFormat
): Uint8ClampedArray {
  const count = width * height * 4;
  if (format === 'rgba16f') {
    const f32 = new Float32Array(count);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.FLOAT, f32);
    const out = new Uint8ClampedArray(count);
    for (let i = 0; i < count; i++) out[i] = Math.round(f32[i] * 255);
    return out;
  }
  const out = new Uint8ClampedArray(count);
  gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
  return out;
}

/**
 * 把输入位图绘制到 OffscreenCanvas 后作为纹理源返回。
 *
 * 为什么需要：ANGLE(D3D11) 等后端对 ImageBitmap 走零拷贝快速上传路径时，
 * 会忽略 UNPACK_FLIP_Y_WEBGL（实测 RTX/ANGLE 下 flipY=true/false 结果相同、均上下颠倒）；
 * 而 Canvas / ImageData 源走逐像素上传，UNPACK_FLIP_Y 正常生效。
 * 主预览与导出 Worker 都经此转换，保证「flipY=true 上屏正立」在真机确定成立。
 * 主线程与 Worker 均有 OffscreenCanvas，可共用。
 */
export function bitmapToTextureSource(bitmap: ImageBitmap): OffscreenCanvas {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('bitmapToTextureSource: 2d context failed');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

/** 把纹理挂到新建 FBO 的 COLOR_ATTACHMENT0，并检查完整性 */
export function attachTextureToFBO(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('attachTextureToFBO: createFramebuffer failed');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}
