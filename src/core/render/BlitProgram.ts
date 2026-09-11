// 可复用全屏四边形程序（按定稿实现：原子初始化 + 失败回滚）
export class BlitProgram {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private uSourceLoc: WebGLUniformLocation | null = null;

  private static readonly VERT_SRC = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vTexCoord;
void main() {
  vTexCoord = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  private static readonly FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vTexCoord;
out vec4 outColor;
uniform sampler2D uSource;
void main() {
  outColor = texture(uSource, vTexCoord);
}`;

  private initResources(gl: WebGL2RenderingContext): void {
    // 全部局部变量，最后一次性原子赋值
    let vert: WebGLShader | null = null;
    let frag: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let vbo: WebGLBuffer | null = null;
    let uSourceLoc: WebGLUniformLocation | null = null;

    try {
      vert = this.compileShader(gl, gl.VERTEX_SHADER, BlitProgram.VERT_SRC);
      frag = this.compileShader(gl, gl.FRAGMENT_SHADER, BlitProgram.FRAG_SRC);

      program = gl.createProgram();
      if (!program) throw new Error('[BlitProgram] createProgram failed');

      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`[BlitProgram] link failed: ${gl.getProgramInfoLog(program)}`);
      }

      uSourceLoc = gl.getUniformLocation(program, 'uSource');
      if (uSourceLoc === null) {
        throw new Error('[BlitProgram] uniform uSource not found');
      }

      vao = gl.createVertexArray();
      vbo = gl.createBuffer();
      if (!vao || !vbo) throw new Error('[BlitProgram] create VAO/VBO failed');

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );

      const aPosLoc = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      // 原子赋值
      this.gl = gl;
      this.program = program;
      this.vao = vao;
      this.vbo = vbo;
      this.uSourceLoc = uSourceLoc;

      // 标记已移交，避免 finally 重复释放
      program = null;
      vao = null;
      vbo = null;
    } finally {
      if (vbo) gl.deleteBuffer(vbo);
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
      if (frag) gl.deleteShader(frag);
      if (vert) gl.deleteShader(vert);
    }
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string
  ): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('[BlitProgram] createShader failed');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`[BlitProgram] shader compile failed: ${log}`);
    }

    return shader;
  }

  /**
   * 将源纹理绘制到当前绑定的帧缓冲
   * 调用方负责设置 FBO、viewport、裁剪区域
   */
  draw(gl: WebGL2RenderingContext, source: WebGLTexture): void {
    if (!this.program) this.initResources(gl);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this.uSourceLoc, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);
  }

  destroy(): void {
    if (!this.gl) return;

    if (this.vbo) {
      this.gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }
    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uSourceLoc = null;
    this.gl = null;
  }
}
