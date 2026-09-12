<template>
  <div class="filmstrip glass">
    <div
      v-for="(it, i) in store.sessionImages"
      :key="it.path + i"
      class="thumb"
      :class="{ current: it.path === store.imagePath }"
      :title="it.name"
      @click="store.openSessionImage(i)"
    >
      <img :src="it.thumb" alt="" draggable="false" />
      <button class="rm" :title="t('filmstrip.remove')" @click.stop="store.removeSessionImage(i)">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';

const store = useEditorStore();
</script>

<style scoped>
.filmstrip {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  overflow-x: auto;
  flex: none;
}
.thumb {
  position: relative;
  flex: none;
  width: 72px;
  height: 54px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--bg-2);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb.current {
  border-color: var(--accent);
}
.thumb .rm {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  display: none;
}
.thumb:hover .rm {
  display: block;
}
</style>
