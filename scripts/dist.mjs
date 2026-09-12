// 打包脚本：构建产物输出到工作区之外（~/lumedit-dist，可用 LUMEDIT_DIST_OUT 覆盖）。
// 原因：ZCode 等编辑器的文件监视会锁住工作区内新生成的 app.asar，导致重打包失败
// （"另一个程序正在使用此文件"）。输出到监视范围之外即可规避。
// 打包完成后把可发布资产（setup / blockmap / portable / latest.yml）拷回 release/ 供 publish 使用。
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const outDir = process.env.LUMEDIT_DIST_OUT || path.join(os.homedir(), 'lumedit-dist');

function run(cmd, args) {
  console.log(`[dist] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`[dist] command failed with code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

run('npx', ['vite', 'build']);
run('npx', ['electron-builder', '--config', 'electron-builder.yml', '-c.directories.output=' + outDir]);

// 拷回可发布资产
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const v = pkg.version;
let copied = 0;
for (const name of [
  `LumEdit-${v}-setup.exe`,
  `LumEdit-${v}-setup.exe.blockmap`,
  `LumEdit-${v}-portable.exe`,
  'latest.yml',
]) {
  const src = path.join(outDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(root, 'release', name));
    copied++;
  }
}
console.log(`[dist] done -> ${outDir}（${copied} 个资产已拷回 release/）`);
console.log(`[dist] 测试版：${path.join(outDir, 'win-unpacked', 'LumEdit.exe')}`);
