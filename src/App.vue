<template>
  <div class="app" @dragover.prevent @drop.prevent="onDrop">
    <TopBar @check-update="manualCheck" @open-about="aboutOpen = true" @open-exif="exifOpen = true" />
    <main class="workspace">
      <EditorCanvas />
      <RightPanel />
    </main>
    <FilmStrip v-if="store.sessionImages.length > 1" />
    <StatusBar @check-update="manualCheck" />
    <AboutModal :open="aboutOpen" @close="aboutOpen = false" />
    <ExifModal :open="exifOpen" @close="exifOpen = false" />
    <Toaster />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import TopBar from './components/TopBar.vue';
import StatusBar from './components/StatusBar.vue';
import RightPanel from './components/RightPanel.vue';
import EditorCanvas from './components/EditorCanvas.vue';
import AboutModal from './components/AboutModal.vue';
import ExifModal from './components/ExifModal.vue';
import FilmStrip from './components/FilmStrip.vue';
import Toaster from './components/ui/Toaster.vue';
import { useEditorStore } from './stores/editor';
import { useUpdate } from './composables/useUpdate';
import { getLocale } from './i18n';

const store = useEditorStore();
const { checkNow } = useUpdate();
const aboutOpen = ref(false);
const exifOpen = ref(false);

function manualCheck(): void {
  void checkNow(false);
}

// ---------- 全局快捷键 ----------
function onKeydown(e: KeyboardEvent): void {
  const ctrl = e.ctrlKey || e.metaKey;
  const tag = (e.target as HTMLElement)?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (ctrl && e.key.toLowerCase() === 'o' && e.shiftKey) {
    e.preventDefault();
    void store.openProjectFile();
  } else if (ctrl && e.altKey && e.key.toLowerCase() === 'c' && !typing) {
    e.preventDefault();
    store.copyEdits();
  } else if (ctrl && e.altKey && e.key.toLowerCase() === 'v' && !typing) {
    e.preventDefault();
    store.pasteEdits();
  } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c' && !typing) {
    e.preventDefault();
    void store.copyToClipboard();
  } else if (e.key.toLowerCase() === 'j' && !typing && !ctrl && !e.altKey) {
    e.preventDefault();
    store.toggleClipWarn();
  } else if (ctrl && e.key.toLowerCase() === 'o' && !typing) {
    e.preventDefault();
    void store.openPicker();
  } else if (ctrl && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void store.saveProjectFile();
  } else if (ctrl && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    void store.exportCurrent();
  } else if (ctrl && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    store.undoEdit();
  } else if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !typing) {
    e.preventDefault();
    store.redoEdit();
  } else if (e.key === '\\' && !typing) {
    store.setShowOriginal(true);
  } else if (e.key === '0' && !typing) {
    store.resetView();
  } else if ((e.key === '=' || e.key === '+') && !typing) {
    store.zoomBy(1.2);
  } else if (e.key === '-' && !typing) {
    store.zoomBy(1 / 1.2);
  }
}
function onKeyup(e: KeyboardEvent): void {
  if (e.key === '\\') store.setShowOriginal(false);
}

// ---------- 原生菜单动作 ----------
function onMenuAction(action: string): void {
  switch (action) {
    case 'open':
    case 'open-image': void store.openPicker(); break;
    case 'open-lut': void store.importUserLuts(); break;
    case 'open-project': void store.openProjectFile(); break;
    case 'save-project': void store.saveProjectFile(); break;
    case 'export': void store.exportCurrent(); break;
    case 'undo': store.undoEdit(); break;
    case 'redo': store.redoEdit(); break;
    case 'zoom-in': store.zoomBy(1.2); break;
    case 'zoom-out': store.zoomBy(1 / 1.2); break;
    case 'fit':
    case 'fit-view': store.resetView(); break;
    case 'check-update': manualCheck(); break;
    case 'about': aboutOpen.value = true; break;
    default:
      if (action.startsWith('recent:')) {
        const idx = Number(action.slice(7));
        if (Number.isInteger(idx)) void store.openRecent(idx);
      }
  }
}

async function onDrop(e: DragEvent): Promise<void> {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  await store.loadImageObject(file.name, file.name, buffer);
}

let removeMenuListener: (() => void) | null = null;
let removeWmListener: (() => void) | null = null;

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
  // 把持久化的界面语言同步到主进程，重建对应语言的原生菜单
  void window.api?.setLocale?.(getLocale());
  // 载入用户自建 LUT 库（命名/分类/持久化）
  void store.loadUserLuts();
  if (window.api?.onMenuAction) {
    removeMenuListener = window.api.onMenuAction(onMenuAction);
  }
  // camera-watermark 工作室「应用」回传
  if (window.api?.onCwmApplied) {
    removeWmListener = window.api.onCwmApplied((payload) => {
      store.applyCwmResult(payload);
    });
  }
  // 启动 5 秒后静默检查更新（对齐 camera-watermark）
  window.setTimeout(() => void checkNow(true), 5000);
  // 恢复上次编辑会话（图片 + 全部参数）
  void store.restoreSession();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('keyup', onKeyup);
  removeMenuListener?.();
  removeWmListener?.();
});
</script>

<style scoped>
.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
}
.workspace {
  flex: 1;
  display: flex;
  min-height: 0;
}
</style>
