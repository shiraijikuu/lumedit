// 双轨检查更新（对齐 camera-watermark v3.0 web 框架）：
// 1) 语义版本变大：Electron 下 electron-updater 后台自动下载，这里只提示
// 2) 同版本 build 变大：autoUpdater 不认 build，引导去下载页手动更新
import type { LumeditAPI } from '@/env.d';

export type UpdateVerdict =
  | { kind: 'newer'; version: string; build: number; notes: string; downloadUrl: string }
  | { kind: 'rebuilt'; version: string; build: number; notes: string; downloadUrl: string }
  | { kind: 'latest'; version: string; build: number }
  | { kind: 'error'; message: string };

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// 更新清单来自第三方 CDN 镜像且无签名：里面的下载地址只信任本仓库 Releases，
// 其余一律回退到 Releases 页，防被篡改的清单诱导用户去任意地址下载安装包。
const RELEASES_PAGE = 'https://github.com/shiraijikuu/lumedit/releases/latest';
const ALLOWED_DOWNLOAD_PREFIX = 'https://github.com/shiraijikuu/lumedit/releases/';

export function resolveDownloadUrl(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith(ALLOWED_DOWNLOAD_PREFIX)
    ? raw
    : RELEASES_PAGE;
}

/** 拉取远程清单并与本地版本比对 */
export async function checkRemote(
  api: LumeditAPI,
  localVersion: string,
  localBuild: number
): Promise<UpdateVerdict> {
  try {
    const j = await api.fetchRemoteUpdate();
    if (!j) throw new Error('远程清单不可用（离线或尚未发布）');
    const remote = String(j.version || '').trim();
    if (!/^\d+(\.\d+){2}/.test(remote)) throw new Error('清单 version 非法');
    const remoteBuild = Number(j.build || 0);
    const cmp = compareSemver(remote, localVersion);
    const notes = j.notes?.zh || '';
    const downloadUrl = resolveDownloadUrl(j.downloads?.windows ?? j.download_url);
    if (cmp > 0) {
      return { kind: 'newer', version: remote, build: remoteBuild, notes, downloadUrl };
    }
    if (cmp === 0 && remoteBuild > localBuild) {
      return { kind: 'rebuilt', version: remote, build: remoteBuild, notes, downloadUrl };
    }
    return { kind: 'latest', version: localVersion, build: localBuild };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
