<template>
  <div>
    <div class="panel-section">
      <div class="panel-title">批量处理（P1）</div>
      <div class="row">
        <button style="flex: 1" @click="store.addBatchFiles()">＋ 添加图片</button>
        <button class="ghost" :disabled="store.batchRunning" @click="store.clearBatch()">清空</button>
      </div>
      <p class="hint">批量任务统一套用当前调色 / LUT / 几何 / 水印参数，在 Worker 队列中逐张全分辨率导出。</p>
      <div class="batch-list">
        <div v-for="it in store.batchItems" :key="it.path" class="batch-item" @dblclick="store.switchTo(it)">
          <span class="status-dot" :class="it.status"></span>
          <span class="batch-name" :title="it.path">{{ it.name }}</span>
          <span class="batch-status">{{ statusText(it.status) }}</span>
          <button class="ghost mini" :disabled="store.batchRunning" @click="store.removeBatchItem(it.path)">×</button>
        </div>
        <p v-if="!store.batchItems.length" class="empty">尚未添加图片</p>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-title">输出目录</div>
      <button class="ghost" style="width: 100%" @click="store.pickBatchOutputDir()">
        {{ store.batchOutputDir || '选择输出文件夹' }}
      </button>
      <div v-if="store.batchRunning" class="progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: pct + '%' }"></div>
        </div>
        <span>{{ store.batchProgress.done }} / {{ store.batchProgress.total }}</span>
      </div>
      <button
        v-if="!store.batchRunning"
        class="primary"
        style="width: 100%; margin-top: 12px"
        :disabled="!store.batchItems.length"
        @click="store.startBatch()"
      >
        开始批量导出
      </button>
      <button v-else class="ghost" style="width: 100%; margin-top: 12px" @click="store.cancelBatch()">
        取消任务
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';

const store = useEditorStore();
const pct = computed(() =>
  store.batchProgress.total ? Math.round((store.batchProgress.done / store.batchProgress.total) * 100) : 0
);
function statusText(s: string): string {
  return { pending: '待处理', running: '处理中', done: '完成', error: '失败' }[s] ?? s;
}
</script>

<style scoped>
.batch-list {
  margin-top: 10px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.batch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--bg-2);
  font-size: 11.5px;
}
.batch-item:hover {
  background: var(--bg-3);
}
.batch-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--txt-1);
}
.batch-status {
  color: var(--txt-2);
  font-size: 10.5px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--txt-2);
  flex: none;
}
.status-dot.running {
  background: var(--accent);
  animation: pulse 1s infinite;
}
.status-dot.done {
  background: var(--ok);
}
.status-dot.error {
  background: var(--danger);
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
.mini {
  padding: 0 7px;
}
.empty {
  text-align: center;
  color: var(--txt-2);
  font-size: 11.5px;
  padding: 16px 0;
}
.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--txt-1);
}
.progress-bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--bg-3);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s var(--ease);
}
</style>
