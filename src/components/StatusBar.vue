<template>
  <footer class="statusbar glass">
    <div class="left">
      <span v-if="store.imageName" class="file-name" :title="store.imagePath ?? ''">{{ store.imageName }}</span>
      <span v-if="dims" class="meta-item">{{ dims.w }} × {{ dims.h }}</span>
      <span v-if="store.meta?.format" class="meta-item">{{ store.meta.format.toUpperCase() }}</span>
      <span v-if="store.meta?.hasGps" class="gps">{{ t('status.gps') }}</span>
    </div>
    <div class="right">
      <span v-if="stateText" class="update-state" @click="$emit('checkUpdate')">{{ stateText }}</span>
      <div class="zoom-ctl">
        <button class="zb" @click="store.zoomBy(1/1.2)">−</button>
        <span class="zoom-val">{{ Math.round(store.view.scale * 100) }}%</span>
        <button class="zb" @click="store.zoomBy(1.2)">+</button>
        <button class="zb fit" @click="store.resetView()">{{ t('status.fit') }}</button>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { useUpdate } from '@/composables/useUpdate';
import { t } from '@/i18n';

const store = useEditorStore();
const { stateText } = useUpdate();

defineEmits<{ (e: 'checkUpdate'): void }>();

const dims = computed(() => {
  const m = store.meta;
  if (!m) return null;
  return { w: m.origWidth, h: m.origHeight };
});
</script>

<style scoped>
.statusbar {
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-top: 1px solid var(--line);
  font-size: 11.5px;
  color: var(--txt-2);
  z-index: 10;
}
.left,
.right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.file-name {
  color: var(--txt-1);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-item {
  font-variant-numeric: tabular-nums;
}
.gps {
  color: var(--warn);
}
.update-state {
  color: var(--accent);
  cursor: pointer;
}
.zoom-ctl {
  display: flex;
  align-items: center;
  gap: 2px;
}
.zb {
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  background: transparent;
  color: var(--txt-1);
  font-size: 13px;
}
.zb.fit {
  font-size: 11px;
}
.zoom-val {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--txt-1);
}
</style>
