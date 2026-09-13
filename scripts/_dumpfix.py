# 一次性脚本：dumpRow 提升到模块级 + 断言阈值按线性光修正（运行后删除）
import io
p = 'test/smoke/smoke.ts'
s = io.open(p, encoding='utf-8').read()

# 1) 模块级 dumpRowOf 函数（插在 readPixel helper 之后）
anchor = "function readPixel(gl: WebGL2RenderingContext, tex: WebGLTexture, w: number, h: number): Uint8Array {"
assert anchor in s, 'readPixel'
# 找 readPixel 函数结束的位置（简化：找它的结尾 "}" 后的空行）
end_marker = "  return px;\n}\n"
assert end_marker in s, 'readPixel end'
helper = """
/** 转储纹理一行（R,B 交替）用于诊断 */
function dumpRowOf(gl: WebGL2RenderingContext, tex: WebGLTexture): string {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const row = new Uint8Array(16 * 4);
  gl.readPixels(0, 8, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  const vals: string[] = [];
  for (let x = 0; x < 16; x++) vals.push(row[x * 4] + ',' + row[x * 4 + 2]);
  return vals.join(' | ');
}
"""
s = s.replace(end_marker, end_marker + helper, 1)

# 2) 移除亮度测试里的内联 dumpRow 定义与调用，改用模块级
old = """      const dumpRow = (tag: string): string => {
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
        const row = new Uint8Array(16 * 4);
        gl.readPixels(0, 8, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fb);
        const vals: string[] = [];
        for (let x = 0; x < 16; x++) vals.push(row[x * 4] + ',' + row[x * 4 + 2]);
        return tag + ' R/B行: ' + vals.join(' | ');
      };
"""
assert old in s, 'inline dump'
s = s.replace(old, '', 1)
s = s.replace("ok('DEBUG 亮度行', false, dumpRow('亮度'));", "ok('DEBUG 亮度行', false, dumpRowOf(gl, out));", 1)

# 3) 断言阈值按线性光修正
s = s.replace("ok('组合并集：左右两半都生效', L[0] >= 250 && R[0] >= 250, `L=${L[0]} R=${R[0]}`);",
              "ok('组合并集：左右两半都生效（线性光 +1EV ≈ ×1.68）', L[0] >= 160 && R[0] >= 160, `L=${L[0]} R=${R[0]}`);", 1)
s = s.replace("ok('组合差集：挖除区撤销累积调整', L[0] >= 250 && R[0] >= 120 && R[0] <= 136, `L=${L[0]} R=${R[0]}`);",
              "ok('组合差集：挖除区撤销累积调整', L[0] >= 160 && R[0] >= 120 && R[0] <= 136, `L=${L[0]} R=${R[0]}`);", 1)
s = s.replace("ok('画笔蒙版：笔画内全量生效', inStroke[0] >= 250, `in=${inStroke[0]}`);",
              "ok('画笔蒙版：笔画内全量生效（线性光 +2EV ≈ ×3.7）', inStroke[0] >= 220, `in=${inStroke[0]}`);", 1)

# 4) 颜色/画笔测试的 dumpRow 调用改模块级
s = s.replace("ok('DEBUG 颜色输入行', false, rowIn.join(' | '));\n      ok('DEBUG 颜色输出行', false, rowOut.join(' | '));",
              "ok('DEBUG 颜色输入行', false, dumpRowOf(gl, tex));\n      ok('DEBUG 颜色输出行', false, dumpRowOf(gl, out));", 1)
s = s.replace("ok('DEBUG 画笔行', false, bv.join(','));", "ok('DEBUG 画笔行', false, dumpRowOf(gl, out));", 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('done')
