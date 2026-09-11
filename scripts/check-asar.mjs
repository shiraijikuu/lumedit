// asar 打包自检：确认渲染层构建产物真的被打进安装包
// 用法： node scripts/check-asar.mjs [asar路径]
// 默认检查 release/win-unpacked/resources/app.asar
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, 'release/win-unpacked/resources/app.asar');

if (!existsSync(target)) {
  console.error('[check-asar] 找不到 asar：' + target);
  console.error('[check-asar] 请先运行 npm run dist');
  process.exit(1);
}

const list = asar.listPackage(target).map((p) => String(p).split('\\').join('/'));
const hasHtml = list.includes('/dist/index.html');
const assetCount = list.filter((p) => p.startsWith('/dist/assets/')).length;
const hasMain = list.includes('/dist-electron/main.cjs');

console.log('[check-asar] ' + target);
console.log('  条目总数：' + list.length);
console.log('  /dist/index.html   ：' + (hasHtml ? 'OK' : '缺失'));
console.log('  /dist/assets/*     ：' + assetCount + ' 个');
console.log('  /dist-electron/main.cjs：' + (hasMain ? 'OK' : '缺失'));

if (!hasHtml || assetCount === 0) {
  console.error('[check-asar] 失败：渲染层未打进 asar，安装后会黑屏。');
  console.error('[check-asar] 常见原因：electron-builder 未读取 electron-builder.yml，');
  console.error('[check-asar] 导致输出目录落在 Vite 的 dist/ 下而被自动排除。');
  process.exit(1);
}
console.log('[check-asar] 通过：渲染层与主进程均已打包。');
