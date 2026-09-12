// 批量处理 store：从 editor store 拆出的独立切片（任务列表 / 输出目录 / 串行执行与取消）。
// 只读编辑器的参数、LUT 数据与导出选项，不回写编辑状态。
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import { runBatch, CancelToken, type BatchSourceItem } from '@/core/batch/batchProcessor';
import { useEditorStore } from './editor';
import { toast } from './toast';
import { t } from '@/i18n';
import { cloneParams } from '@/types/EditParams';

export type BatchItemStatus = 'pending' | 'running' | 'done' | 'error';

export interface BatchItem {
  path: string;
  name: string;
  buffer: ArrayBuffer;
  status: BatchItemStatus;
  message?: string;
}

export const useBatchStore = defineStore('batch', () => {
  const batchItems = ref<BatchItem[]>([]);
  const batchOutputDir = ref<string | null>(null);
  const batchRunning = ref(false);
  const batchProgress = reactive({ done: 0, total: 0 });
  let batchToken: CancelToken | null = null;

  async function addBatchFiles(): Promise<void> {
    const results = await window.api.openImages(true);
    if (!results) return;
    for (const r of results) {
      if (!batchItems.value.some((x) => x.path === r.path)) {
        batchItems.value.push({
          path: r.path,
          name: r.name,
          buffer: r.buffer,
          status: 'pending',
        });
      }
    }
  }

  function removeBatchItem(path: string): void {
    const i = batchItems.value.findIndex((x) => x.path === path);
    if (i >= 0) batchItems.value.splice(i, 1);
  }

  function clearBatch(): void {
    if (batchRunning.value) return;
    batchItems.value.splice(0, batchItems.value.length);
  }

  async function pickBatchOutputDir(): Promise<void> {
    const dir = await window.api.pickDir();
    if (dir) batchOutputDir.value = dir;
  }

  async function startBatch(): Promise<void> {
    if (batchRunning.value) return;
    const editor = useEditorStore();
    if (batchItems.value.length === 0) {
      toast('info', t('msg.addImageFirst'));
      return;
    }
    if (!batchOutputDir.value) {
      await pickBatchOutputDir();
      if (!batchOutputDir.value) return;
    }
    batchRunning.value = true;
    batchToken = new CancelToken();
    batchItems.value.forEach((it) => (it.status = 'pending'));
    batchProgress.done = 0;
    batchProgress.total = batchItems.value.length;

    const sources: BatchSourceItem[] = batchItems.value.map((it) => ({
      path: it.path,
      name: it.name,
      buffer: it.buffer.slice(0),
    }));
    const result = await runBatch(
      {
        items: sources,
        params: cloneParams(editor.params),
        lut: editor.lutData,
        format: editor.exportOptions.format,
        quality: editor.exportOptions.quality,
        keepExif: editor.exportOptions.keepExif,
        stripGps: editor.exportOptions.stripGps,
        scale: editor.exportOptions.scale,
        outputDir: batchOutputDir.value,
        suffix: '-lumedit',
        writeFile: (absPath, bytes) => window.api.writeFile(absPath, bytes),
        onItemStart: (_name, index) => {
          const it = batchItems.value[index];
          if (it) it.status = 'running';
        },
        onProgress: (done, _total, index) => {
          batchProgress.done = done;
          const it = batchItems.value[index];
          if (it && it.status !== 'error') it.status = 'done';
        },
        onItemError: (index, error) => {
          const it = batchItems.value[index];
          if (it) {
            it.status = 'error';
            it.message = error;
          }
        },
        isCancelled: () => batchToken?.cancelled ?? false,
      },
      batchToken
    );
    batchRunning.value = false;
    const msg = result.cancelled
      ? `已取消：成功 ${result.done} 张，失败 ${result.failed.length} 张`
      : `批量完成：成功 ${result.done} 张${result.failed.length ? `，失败 ${result.failed.length} 张` : ''}`;
    toast(result.failed.length ? 'error' : result.cancelled ? 'info' : 'success', msg);
  }

  function cancelBatch(): void {
    batchToken?.cancel();
  }

  return {
    batchItems, batchOutputDir, batchRunning, batchProgress,
    addBatchFiles, removeBatchItem, clearBatch, pickBatchOutputDir, startBatch, cancelBatch,
  };
});
