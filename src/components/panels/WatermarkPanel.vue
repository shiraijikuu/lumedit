<template>
  <div>
    <div class="panel-section">
      <div class="panel-title" style="margin-bottom: 0">
        水印 · camera-watermark
        <ToggleSwitch
          :model-value="!!store.params.watermark?.enabled"
          @update:model-value="store.setWatermarkEnabled($event)"
        />
      </div>
    </div>

    <template v-if="store.params.watermark?.enabled">
      <div class="panel-section">
        <button class="studio-entry" @click="store.openCwmStudio()">
          <span class="se-ico">◳</span>
          <span class="se-txt">
            <strong>{{ configured ? '编辑水印' : '打开水印工作室' }}</strong>
            <small>文字 / 模糊卡片 / 画框 / 图片水印 / 二维码 · 独立窗口完整编辑</small>
          </span>
          <span class="se-arrow">›</span>
        </button>
        <p class="hint">
          水印在裁剪、调色、LUT 之后作为最后一步合成，不会被调色影响；导出时按全分辨率渲染。
        </p>
      </div>

      <div class="panel-section" v-if="configured">
        <div class="wm-status">
          <span class="dot-ok"></span>
          <span class="wm-status-txt">已配置水印，导出时自动合成</span>
          <button class="ghost wm-clear" @click="store.clearWatermark()">移除</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';
import ToggleSwitch from '../ui/ToggleSwitch.vue';

const store = useEditorStore();
const configured = computed(() => !!store.params.watermark?.cwmState);
</script>

<style scoped>
.studio-entry {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: linear-gradient(135deg, var(--accent-soft), var(--bg-2));
  color: var(--txt-0);
  cursor: pointer;
  text-align: left;
  transition: filter 0.15s ease;
}
.studio-entry:hover {
  filter: brightness(1.08);
}
.se-ico {
  flex: none;
  font-size: 20px;
  color: var(--accent);
}
.se-txt {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.se-txt strong {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.se-txt small {
  font-size: 10.5px;
  color: var(--txt-2);
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.se-arrow {
  flex: none;
  font-size: 18px;
  color: var(--accent);
}
.hint {
  margin-top: 9px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.55;
}
.wm-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--bg-2);
}
.dot-ok {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #30d158;
  flex: none;
}
.wm-status-txt {
  flex: 1;
  font-size: 12px;
  color: var(--txt-1);
}
.wm-clear {
  padding: 3px 10px;
  font-size: 11px;
  color: var(--danger);
}
</style>
