// RAW 内嵌 JPEG 提取可行性验证（spike，验证后可删）
// 标准 JPEG marker walk：从每个 SOI(FFD8) 出发，正确跳过 SOS 熵数据找到匹配 EOI(FFD9)
import fs from 'node:fs';
import path from 'node:path';

function walkJpeg(b, start) {
  let i = start + 2;
  let w = 0, h = 0, sof = false;
  const n = b.length;
  while (i + 1 < n) {
    if (b[i] !== 0xff) { i++; continue; }
    // 跳过填充 FF
    while (i < n && b[i] === 0xff) i++;
    const m = b[i]; i++;
    if (m === 0xd9) return { end: i, w, h, sof };           // EOI
    if (m === 0xda) {                                        // SOS：跳过熵数据
      if (i + 2 > n) return null;
      const segLen = (b[i] << 8) | b[i + 1];
      i += segLen;
      // 找下一个有效 marker（FF 后非 0、非 RSTn、非 FF 填充）
      while (i + 1 < n) {
        if (b[i] === 0xff && b[i + 1] !== 0x00 &&
            !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7) && b[i + 1] !== 0xff) break;
        i++;
      }
      continue;
    }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { i; continue; } // standalone，无长度
    if (i + 2 > n) return null;
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2) return null;
    // SOF0..SOF15（除 DHT=C4/DAC=CC/JPG=D8）记录宽高
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      h = (b[i + 3] << 8) | b[i + 4];
      w = (b[i + 5] << 8) | b[i + 6];
      sof = true;
    }
    i += len;
  }
  return null;
}

function findEmbedded(b) {
  const cands = [];
  for (let i = 0; i + 3 < b.length; i++) {
    // SOI 且其后是常见 marker（E0 JFIF / E1 EXIF / DB DQT / E2 等），降低误报
    if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff &&
        (b[i + 3] === 0xe0 || b[i + 3] === 0xe1 || b[i + 3] === 0xdb || b[i + 3] === 0xee)) {
      const r = walkJpeg(b, i);
      if (r && r.sof && r.end - i > 4096) {
        cands.push({ start: i, end: r.end, len: r.end - i, w: r.w, h: r.h });
        i = r.end - 1; // 跳到本 JPEG 之后继续找
      }
    }
  }
  return cands;
}

const targets = process.argv.slice(2);
for (const f of targets) {
  const b = fs.readFileSync(f);
  const cands = findEmbedded(b);
  cands.sort((a, c) => c.len - a.len);
  console.log(`\n=== ${path.basename(f)}  total=${(b.length / 1048576).toFixed(1)}MB  embedded=${cands.length}`);
  cands.slice(0, 6).forEach((c, idx) => {
    console.log(`  [${idx}] ${(c.len / 1024).toFixed(0)}KB  ${c.w}x${c.h}  start=0x${c.start.toString(16)}`);
  });
  if (cands[0]) {
    const big = cands[0];
    const head = b.slice(big.start, big.start + 4);
    console.log(`  BIGGEST head=${[...head].map((x) => x.toString(16).padStart(2, '0')).join(' ')} tailOK=${b[big.end - 2] === 0xff && b[big.end - 1] === 0xd9}`);
  }
}
