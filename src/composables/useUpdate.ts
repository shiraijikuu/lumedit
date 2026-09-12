// 检查更新（对齐 camera-watermark v3.0 双轨逻辑）：
// - 语义版本变大：Electron autoUpdater 后台自动下载，主进程弹原生重启框
// - 同版本 build 递增：引导浏览器打开下载页手动更新
import { ref } from 'vue';
import { checkRemote } from '@/core/update/updateService';
import { t } from '@/i18n';

type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'manual' | 'latest' | 'error';

const state = ref<UpdateState>('idle');
const stateText = ref('');
let bound = false;

function bindUpdaterEvents(): void {
  if (bound || !window.api?.onUpdaterEvent) return;
  bound = true;
  window.api.onUpdaterEvent((ev) => {
    switch (ev.type) {
      case 'available':
        state.value = 'downloading';
        stateText.value = t('update.foundDownloading', { v: ev.version ?? '' });
        break;
      case 'downloading':
        state.value = 'downloading';
        stateText.value = t('update.downloading', { p: ev.percent ?? 0 });
        break;
      case 'downloaded':
        // 主进程已弹原生「立即重启」对话框，这里只更新状态
        state.value = 'ready';
        stateText.value = t('update.readyRestart');
        break;
      case 'not-available':
        if (state.value === 'checking') {
          state.value = 'latest';
          stateText.value = '';
        }
        break;
      case 'error':
        state.value = 'error';
        stateText.value = '';
        break;
    }
  });
}

async function checkNow(silent = false): Promise<void> {
  const api = window.api;
  if (!api?.appMeta) return; // 浏览器开发环境无更新能力
  bindUpdaterEvents();
  state.value = 'checking';
  stateText.value = t('update.checking');
  try {
    const meta = await api.appMeta();
    // 1) 语义版本：交给 electron-updater（后台自动下载）
    if (api.checkAutoUpdater) {
      try {
        await api.checkAutoUpdater();
      } catch {
        /* 网络失败走远程清单兜底 */
      }
    }
    // 2) 远程清单：build 修订 / 兜底提示
    const verdict = await checkRemote(api, meta.version, meta.build);
    if (verdict.kind === 'newer') {
      state.value = 'downloading';
      stateText.value = t('update.preparing', { v: verdict.version });
      if (!silent) {
        alert(t('update.foundAuto', { v: verdict.version, notes: verdict.notes }));
      }
    } else if (verdict.kind === 'rebuilt') {
      state.value = 'manual';
      stateText.value = t('update.revision', { b: verdict.build });
      if (confirm(t('update.foundManual', { b: verdict.build, notes: verdict.notes }))) {
        await api.openExternal(verdict.downloadUrl);
      }
    } else if (verdict.kind === 'latest') {
      state.value = 'latest';
      stateText.value = '';
      if (!silent) alert(t('update.latest'));
    } else {
      state.value = 'error';
      stateText.value = '';
      if (!silent) alert(t('update.checkFail', { v: verdict.message }));
    }
  } catch (err) {
    state.value = 'error';
    stateText.value = '';
    if (!silent) alert(t('update.checkFail', { v: err instanceof Error ? err.message : String(err) }));
  }
}

export function useUpdate() {
  return { state, stateText, checkNow };
}
