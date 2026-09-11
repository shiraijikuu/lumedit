<template>
  <aside class="right-panel">
    <div class="tab-bar">
      <div class="segmented tabs">
        <button
          v-for="t in tabs"
          :key="t.v"
          :class="{ active: tab === t.v }"
          @click="tab = t.v"
        >
          {{ t.label }}
        </button>
      </div>
    </div>
    <div class="tab-body">
      <GeometryPanel v-show="tab === 'geometry'" />
      <AdjustPanel v-show="tab === 'adjust'" />
      <LutPanel v-show="tab === 'lut'" />
      <WatermarkPanel v-show="tab === 'watermark'" />
      <ExportPanel v-show="tab === 'export'" />
      <BatchPanel v-show="tab === 'batch'" />
    </div>

    <!-- 作者主页入口（对齐 camera-watermark 顶栏社交按钮） -->
    <div class="social-bar">
      <span class="social-author">shiraijikuu</span>
      <div class="social-links">
        <button class="social-btn" type="button" title="抖音" aria-label="抖音" @click="openLink(SOCIAL.douyin)">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.05.85.13V9.4a6.33 6.33 0 1 0 5.77 6.3V8.84a8.16 8.16 0 0 0 4.77 1.52V6.91l-1.28-.22z"/></svg>
        </button>
        <button class="social-btn" type="button" title="哔哩哔哩" aria-label="哔哩哔哩" @click="openLink(SOCIAL.bilibili)">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.573 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.995 2.262-1.519 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>
        </button>
        <button class="social-btn" type="button" title="GitHub" aria-label="GitHub" @click="openLink(SOCIAL.github)">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import GeometryPanel from './panels/GeometryPanel.vue';
import AdjustPanel from './panels/AdjustPanel.vue';
import LutPanel from './panels/LutPanel.vue';
import WatermarkPanel from './panels/WatermarkPanel.vue';
import ExportPanel from './panels/ExportPanel.vue';
import BatchPanel from './panels/BatchPanel.vue';

const tabs = [
  { v: 'geometry', label: '几何' },
  { v: 'adjust', label: '调色' },
  { v: 'lut', label: 'LUT' },
  { v: 'watermark', label: '水印' },
  { v: 'export', label: '导出' },
  { v: 'batch', label: '批量' },
] as const;

const tab = ref<(typeof tabs)[number]['v']>('adjust');

// 与 camera-watermark 一致的作者主页链接
const SOCIAL = {
  douyin: 'https://v.douyin.com/aySgkT0fxTQ/',
  bilibili: 'https://b23.tv/yJr6O00',
  github: 'https://github.com/shiraijikuu/lumedit',
};

function openLink(url: string): void {
  if (!url) return;
  if (window.api?.openExternal) void window.api.openExternal(url);
  else window.open(url, '_blank');
}
</script>

<style scoped>
.right-panel {
  width: 308px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border-left: 1px solid var(--line);
  z-index: 5;
}
.tab-bar {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
.tabs {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
}
.tabs button {
  font-size: 11.5px;
  padding: 5px 0;
}
.tab-body {
  flex: 1;
  overflow-y: auto;
}

/* 底部作者主页栏（样式对齐 camera-watermark 顶栏社交按钮） */
.social-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  border-top: 1px solid var(--line);
  background: var(--bg-1);
}
.social-author {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--dim, #9aa1b2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.social-links {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.social-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--dim, #9aa1b2);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.social-btn:hover {
  color: var(--accent, #0a84ff);
  background: var(--soft, rgba(120, 120, 130, 0.14));
  border-color: var(--line);
}
.social-btn svg {
  width: 18px;
  height: 18px;
  display: block;
}
</style>
