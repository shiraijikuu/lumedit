# 临时诊断：单右半蒙版的输出行
import io
p = 'test/smoke/smoke.ts'
s = io.open(p, encoding='utf-8').read()
anchor = "    // 交集：右半全幅曝光 +1，左半交集蒙版（零调整）→ 只有右半生效"
assert anchor in s
diag = """    // DEBUG: 单个右半 union 蒙版
    {
      const pD = params();
      pD.gradations = [mkC('d', 1, { x1: 0.5, x2: 1 })];
      const b = await solidBitmap(16, 16, [0.5, 0.5, 0.5]);
      const tex = uploadTexture(gl, b);
      const out = stage.execute(tex, pD, { gl, width: 16, height: 16 });
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
      const row = new Uint8Array(16 * 4);
      gl.readPixels(0, 8, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      const vals: string[] = [];
      for (let x = 0; x < 16; x++) vals.push(String(row[x * 4]));
      ok('DEBUG 右半行', false, vals.join(','));
      if (out !== tex) gl.deleteTexture(out);
      gl.deleteTexture(tex);
      b.close();
    }

"""
s = s.replace(anchor, diag + anchor, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('diag added')
