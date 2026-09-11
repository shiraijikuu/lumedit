<template>
  <header class="topbar glass">
    <div class="brand" title="关于 LumEdit" @click="$emit('openAbout')">
      <AppLogo :size="24" class="brand-mark" />
      <span class="brand-name">LumEdit</span>
      <span class="brand-sub">光影轻修</span>
    </div>

    <div class="group">
      <button class="primary" @click="store.openPicker()">打开图片</button>
      <button class="ghost" @click="store.openProjectFile()">打开工程</button>
      <button class="ghost" :disabled="!store.hasImage" @click="store.saveProjectFile()">保存工程</button>
    </div>

    <div class="divider"></div>

    <div class="group">
      <button class="icon-btn" title="撤销 Ctrl+Z" :disabled="!store.canUndo" @click="store.undoEdit()">
        ↶
      </button>
      <button class="icon-btn" title="重做 Ctrl+Y" :disabled="!store.canRedo" @click="store.redoEdit()">
        ↷
      </button>
      <div class="divider"></div>
      <button class="icon-btn" title="逆时针 90°" :disabled="!store.hasImage" @click="store.rotate90(-1)">
        ↺
      </button>
      <button class="icon-btn" title="顺时针 90°" :disabled="!store.hasImage" @click="store.rotate90(1)">
        ↻
      </button>
      <button
        class="icon-btn"
        title="按住查看原图（\\）"
        :class="{ active: store.showOriginal }"
        :disabled="!store.hasImage"
        @pointerdown="store.setShowOriginal(true)"
        @pointerup="store.setShowOriginal(false)"
        @pointerleave="store.setShowOriginal(false)"
      >
        原图
      </button>
    </div>

    <div class="spacer"></div>

    <div class="group">
      <button class="ghost" @click="$emit('checkUpdate')">检查更新</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import AppLogo from '@/components/ui/AppLogo.vue';
const store = useEditorStore();
defineEmits<{ (e: 'checkUpdate'): void; (e: 'openAbout'): void }>();
</script>

<style scoped>
.topbar {
  height: 50px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--line);
  z-index: 10;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-right: 6px;
  cursor: pointer;
  border-radius: 8px;
  padding: 3px 6px;
  transition: background 0.14s var(--ease);
}
.brand:hover {
  background: rgba(255, 255, 255, 0.06);
}
.brand-mark {
  width: 24px;
  height: 24px;
  align-self: center;
  flex: none;
}
.brand-name {
  font-weight: 650;
  font-size: 14px;
  letter-spacing: 0.5px;
}
.brand-sub {
  font-size: 11px;
  color: var(--txt-2);
}
.group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.divider {
  width: 1px;
  height: 20px;
  background: var(--line);
}
.icon-btn {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  background: transparent;
  color: var(--txt-1);
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--txt-0);
}
.icon-btn.active {
  background: var(--accent-soft);
  color: #7db8ff;
}
.spacer {
  flex: 1;
}
</style>
