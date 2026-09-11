<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @pointerdown.self="$emit('close')">
      <div class="about-card fade-in">
        <div class="hero">
          <AppLogo :size="68" class="app-icon" />
          <div class="hero-text">
            <div class="app-name">LumEdit</div>
            <div class="app-sub">光影轻修 · v{{ version }}</div>
          </div>
        </div>

        <p class="desc">
          一款纯本地、零上传的单张精修工具：裁剪旋转、基础调色、场景 LUT、
          水印插件与保真导出，预览与导出共用同一条 WebGL2 管线，所见即所得。
        </p>

        <div class="author-row">
          <span class="label">作者</span>
          <span class="author">shiraijikuu</span>
        </div>

        <div class="social">
          <button class="social-btn bili" @click="openLink(SOCIAL.bilibili)">
            <span class="ico">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.573 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.995 2.262-1.519 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>
            </span>
            <span>哔哩哔哩</span>
          </button>
          <button class="social-btn dy" @click="openLink(SOCIAL.douyin)">
            <span class="ico">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.05.85.13V9.4a6.33 6.33 0 1 0 5.77 6.3V8.84a8.16 8.16 0 0 0 4.77 1.52V6.91l-1.28-.22z"/></svg>
            </span>
            <span>抖音</span>
          </button>
          <button class="social-btn gh" @click="openLink(SOCIAL.github)">
            <span class="ico">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
            </span>
            <span>GitHub</span>
          </button>
        </div>

        <div class="foot">
          <span>Electron · Vue 3 · WebGL2</span>
          <span>MIT License</span>
        </div>

        <button class="primary close-btn" @click="$emit('close')">完成</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AppLogo from '@/components/ui/AppLogo.vue';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

// 与 camera-watermark 一致的作者社交链接
const SOCIAL = {
  bilibili: 'https://b23.tv/yJr6O00',
  douyin: 'https://v.douyin.com/aySgkT0fxTQ/',
  github: 'https://github.com/shiraijikuu/lumedit',
};

const version = ref('0.1.0');
if (window.api?.appMeta) {
  window.api.appMeta().then((m) => (version.value = m.version)).catch(() => {});
}

function openLink(url: string): void {
  if (!url) return;
  if (window.api?.openExternal) void window.api.openExternal(url);
  else window.open(url, '_blank');
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.about-card {
  width: 380px;
  background: #202129;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  padding: 22px;
  box-shadow: var(--shadow-pop);
}
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.app-icon {
  width: 68px;
  height: 68px;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 8px 22px rgba(10, 132, 255, 0.4);
}
.app-name {
  font-size: 18px;
  font-weight: 650;
}
.app-sub {
  font-size: 12px;
  color: #9aa1b2;
  margin-top: 3px;
}
.desc {
  font-size: 12.5px;
  line-height: 1.75;
  color: #c9cedb;
}
.author-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 13px;
}
.label {
  color: #9aa1b2;
  font-size: 12px;
}
.author {
  font-weight: 600;
  letter-spacing: 0.5px;
}
.social {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}
.social-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 4px;
  font-size: 11.5px;
  border-radius: 10px;
}
.social-btn .ico {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.social-btn .ico svg {
  width: 19px;
  height: 19px;
  display: block;
}
.social-btn.bili:hover {
  background: rgba(251, 114, 153, 0.14);
}
.social-btn.dy:hover {
  background: rgba(0, 0, 0, 0.25);
}
.social-btn.gh:hover {
  background: rgba(120, 120, 130, 0.18);
}
.foot {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 11px;
  color: #9aa1b2;
}
.close-btn {
  width: 100%;
  margin-top: 16px;
  padding: 9px;
}
</style>
