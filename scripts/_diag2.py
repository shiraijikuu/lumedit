# 临时诊断：转储亮度/颜色/画笔测试的输出行（运行后删除）
import io
p = 'test/smoke/smoke.ts'
s = io.open(p, encoding='utf-8').read()

helper = """      const dumpRow = (tag: string): string => {
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

# 亮度测试：dark/bright 读点后加 dump
old = """      const dark = readAt(4, 8);
      const bright = readAt(12, 8);"""
new = helper + """      const dark = readAt(4, 8);
      const bright = readAt(12, 8);
      ok('DEBUG 亮度行', false, dumpRow('亮度'));"""
assert old in s; s = s.replace(old, new, 1)

old = """      const blue = readAt(12, 8);
      const orange = readAt(4, 8);"""
new = """      const blue = readAt(12, 8);
      const orange = readAt(4, 8);
      ok('DEBUG 颜色行', false, dumpRow('颜色'));"""
assert old in s; s = s.replace(old, new, 1)

old = """      const inStroke = readAt(6, 8);
      const outside = readAt(14, 2);"""
new = """      const inStroke = readAt(6, 8);
      const outside = readAt(14, 2);
      ok('DEBUG 画笔行', false, dumpRow('画笔'));"""
assert old in s; s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('diag ok')
