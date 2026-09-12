// GitHub Release 发布脚本（跨平台 Node 版，替代 publish-release.ps1 的 PS5.1 编码/凭据问题）：
// 1) 从 Git Credential Manager 取令牌（只存在于内存，不打印不落盘）
// 2) 按 package.json 版本号创建/获取 Release（正文 = release-notes.md）
// 3) 上传 release/ 下的安装包、blockmap、latest.yml（同名先删后传，可重复执行）
// 用法：node scripts/publish.mjs   （或 npm run publish）
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const repo = 'shiraijikuu/lumedit';
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
const tag = `v${pkg.version}`;
const version = pkg.version;

function die(msg) {
  console.error(`[publish] ${msg}`);
  process.exit(1);
}

// 1) 令牌
let token = '';
try {
  const cred = execFileSync('git', ['credential', 'fill'], {
    input: `protocol=https\nhost=github.com\n\n`,
    encoding: 'utf-8',
  });
  token = (cred.split(/\r?\n/).find((l) => l.startsWith('password=')) ?? '').slice('password='.length);
} catch (err) {
  die(`git credential fill 失败：${err.message}`);
}
if (!token) die('无法从 Git 凭据管理器获取 GitHub 令牌');
const auth = { Authorization: `Bearer ${token}`, 'User-Agent': 'lumedit', Accept: 'application/vnd.github+json' };

const api = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  if (!r.ok && r.status !== 404) {
    throw new Error(`${init.method ?? 'GET'} ${url} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  return r;
};

// 2) 创建或获取 Release（正文始终同步为最新 release-notes.md）
const notes = readFileSync(path.join(root, 'release-notes.md'), 'utf-8');
let rel = await (await api(`https://api.github.com/repos/${repo}/releases/tags/${tag}`)).json();
if (!rel.id) {
  rel = await (
    await api(`https://api.github.com/repos/${repo}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: `LumEdit v${version}`, body: notes, draft: false, prerelease: false }),
    })
  ).json();
  console.log(`[publish] release 已创建：${rel.html_url}`);
} else {
  await api(`https://api.github.com/repos/${repo}/releases/${rel.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `LumEdit v${version}`, body: notes, draft: false, prerelease: false }),
  });
  console.log(`[publish] release 已存在，正文已更新：${rel.html_url}`);
}

const uploadBase = rel.upload_url.replace(/\{\?name,label\}/, '');

// 3) 上传资产（同名先删后传）
const assets = [
  `release/LumEdit-${version}-setup.exe`,
  `release/LumEdit-${version}-setup.exe.blockmap`,
  `release/LumEdit-${version}-portable.exe`,
  `release/latest.yml`,
].filter((p) => existsSync(path.join(root, p)));
if (assets.length === 0) die('release/ 下没有可上传的资产，先执行 npm run dist');

for (const relPath of assets) {
  const name = path.basename(relPath);
  const old = (rel.assets ?? []).find((a) => a.name === name);
  if (old) {
    await api(`https://api.github.com/repos/${repo}/releases/assets/${old.id}`, { method: 'DELETE' });
    console.log(`[publish] 旧资产已删除：${name}`);
  }
  const bytes = readFileSync(path.join(root, relPath));
  const r = await fetch(`${uploadBase}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'lumedit', 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });
  if (!r.ok) die(`上传 ${name} 失败：${r.status} ${(await r.text()).slice(0, 300)}`);
  const a = await r.json();
  console.log(`[publish] 资产上传：${a.name} size=${a.size} state=${a.state}`);
  console.log(`  下载：${a.browser_download_url}`);
}
console.log('[publish] ALL_DONE');
