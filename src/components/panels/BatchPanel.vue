<template>
  <div>
    <div class="panel-section">
      <div class="panel-title">{{ t('batch.title') }}</div>
      <div class="row">
        <button style="flex: 1" @click="batch.addBatchFiles()">{{ t('batch.add') }}</button>
        <button class="ghost" :disabled="batch.batchRunning" @click="batch.clearBatch()">{{ t('batch.clear') }}</button>
      </div>
      <p class="hint">{{ t('batch.hint') }}</p>
      <div class="batch-list">
        <div v-for="it in batch.batchItems" :key="it.path" class="batch-item" @dblclick="editor.switchTo(it)">
          <span class="status-dot" :class="it.status"></span>
          <span class="batch-name" :title="it.path">{{ it.name }}</span>
          <span class="batch-status">{{ statusText(it.status) }}</span>
          <button class="ghost mini" :disabled="batch.batchRunning" @click="batch.removeBatchItem(it.path)">×</button>
        </div>
        <p v-if="!batch.batchItems.length" class="empty">{{ t('batch.empty') }}</p>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-title">{{ t('batch.outputDir') }}</div>
      <button class="ghost" style="width: 100%" @click="batch.pickBatchOutputDir()">
        {{ batch.batchOutputDir || t('batch.pickDir') }}
      </button>
      <div v-if="batch.batchRunning" class="progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: pct + '%' }"></div>
        </div>
        <span>{{ batch.batchProgress.done }} / {{ batch.batchProgress.total }}</span>
      </div>
      <button
        v-if="!batch.batchRunning"
        class="primary"
        style="width: 100%; margin-top: 12px"
        :disabled="!batch.batchItems.length"
        @click="batch.startBatch()"
      >
        {{ t('batch.start') }}
      </button>
      <button v-else class="ghost" style="width: 100%; margin-top: 12px" @click="batch.cancelBatch()">
        {{ t('batch.cancelTask') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { useBatchStore } from '@/stores/batch';
import { t } from '@/i18n';

const editor = useEditorStore();
const batch = useBatchStore();
const pct = computed(() =>
  batch.batchProgress.total ? Math.round((batch.batchProgress.done / batch.batchProgress.total) * 100) : 0
);
function statusText(s: string): string {
  const map: Record<string, string> = {
    pending: t('batch.stPending'),
    running: t('batch.stRunning'),
    done: t('batch.stDone'),
    error: t('batch.stError'),
  };
  return map[s] ?? s;
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
