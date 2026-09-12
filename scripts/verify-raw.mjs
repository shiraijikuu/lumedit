import { extractRawPreview, detectRawKind, isRawFileName } from './raw-extract.bundle.mjs';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
let fail = 0;
for (const f of files) {
  const b = new Uint8Array(readFileSync(f));
  const kind = detectRawKind(b);
  const r = extractRawPreview(b, f);
  const name = f.split(/[\\/]/).pop();
  if (!r || r.width < 1000) { fail++; console.log(`FAIL ${name} kind=${kind} ->`, r ? `${r.width}x${r.height}` : 'NULL'); continue; }
  const head = [r.jpeg[0], r.jpeg[1], r.jpeg[2], r.jpeg[3]].map((x) => x.toString(16)).join(' ');
  console.log(`OK   ${name} (${(b.length / 1048576).toFixed(1)}MB) kind=${kind} nameRaw=${isRawFileName(f)} -> jpeg ${(r.jpeg.length / 1048576).toFixed(2)}MB ${r.width}x${r.height} head=${head} tiff=${!!r.tiff}`);
}
console.log(fail === 0 ? `\nALL ${files.length} PASSED` : `\n${fail}/${files.length} FAILED`);
process.exit(fail === 0 ? 0 : 1);
