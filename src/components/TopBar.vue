<template>
  <header class="topbar glass">
    <div class="brand" title="LumEdit" @click="$emit('openAbout')">
      <AppLogo :size="24" class="brand-mark" />
      <span class="brand-name">LumEdit</span>
      <span class="brand-sub">{{ t('topbar.brandSub') }}</span>
    </div>

    <div class="group">
      <button class="primary" @click="store.openPicker()">{{ t('topbar.openImage') }}</button>
      <button class="ghost" @click="store.openProjectFile()">{{ t('topbar.openProject') }}</button>
      <button class="ghost" :disabled="!store.hasImage" @click="store.saveProjectFile()">{{ t('topbar.saveProject') }}</button>
    </div>

    <div class="divider"></div>

    <div class="group">
      <button class="icon-btn" :title="t('topbar.undoTitle')" :disabled="!store.canUndo" @click="store.undoEdit()">
        ↶
      </button>
      <button class="icon-btn" :title="t('topbar.redoTitle')" :disabled="!store.canRedo" @click="store.redoEdit()">
        ↷
      </button>
      <button class="icon-btn text-icon" :title="t('topbar.copyEditsTitle')" :disabled="!store.hasImage" @click="store.copyEdits()">
        {{ t('topbar.copyEdits') }}
      </button>
      <button
        class="icon-btn text-icon"
        :title="t('topbar.pasteEditsTitle')"
        :disabled="!store.hasImage"
        @click="store.pasteEdits()"
      >
        {{ t('topbar.pasteEdits') }}
      </button>
      <div class="divider"></div>
      <button class="icon-btn" :title="t('topbar.rotL')" :disabled="!store.hasImage" @click="store.rotate90(-1)">
        ↺
      </button>
      <button class="icon-btn" :title="t('topbar.rotR')" :disabled="!store.hasImage" @click="store.rotate90(1)">
        ↻
      </button>
      <button
        class="icon-btn"
        :title="t('topbar.originalTitle')"
        :class="{ active: store.showOriginal }"
        :disabled="!store.hasImage"
        @pointerdown="store.setShowOriginal(true)"
        @pointerup="store.setShowOriginal(false)"
        @pointerleave="store.setShowOriginal(false)"
      >
        {{ t('topbar.original') }}
      </button>
      <button
        class="icon-btn"
        :title="t('topbar.splitTitle')"
        :class="{ active: store.splitCompare }"
        :disabled="!store.hasImage"
        @click="store.toggleSplitCompare()"
      >
        ⇔
      </button>
      <button
        class="icon-btn"
        :title="t('topbar.clipTitle')"
        :class="{ active: store.clipWarn }"
        :disabled="!store.hasImage"
        @click="store.toggleClipWarn()"
      >
        ⚠
      </button>
    </div>

    <div class="spacer"></div>

    <div class="group">
      <button class="ghost" :disabled="!store.hasImage" @click="$emit('openExif')">{{ t('topbar.exif') }}</button>
      <button class="icon-btn lang-btn" @click="toggleLocale()">{{ otherLangLabel }}</button>
      <button class="ghost" @click="$emit('checkUpdate')">{{ t('topbar.checkUpdate') }}</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { t, getLocale, toggleLocale } from '@/i18n';
import AppLogo from '@/components/ui/AppLogo.vue';
const store = useEditorStore();
defineEmits<{ (e: 'checkUpdate'): void; (e: 'openAbout'): void; (e: 'openExif'): void }>();
const otherLangLabel = computed(() => (getLocale() === 'zh-CN' ? 'EN' : '中'));
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
.lang-btn {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.spacer {
  flex: 1;
}
</style>
