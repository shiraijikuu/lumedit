import { defineStore } from 'pinia';
import { toast } from './toast';
import { computed, reactive, ref, shallowRef } from 'vue';
import {
  cloneParams,
  defaultEditParams,
  ensureParams,
  pickPresetParams,
  type PresetColorParams,
} from '@/types/EditParams';
import {
  canRedo as canRedoStack,
  canUndo as canUndoStack,
  createStack,
  pushSnapshot,
  redo as redoStack,
  undo as undoStack,
} from '@/core/history/history';
import { decodeForPreview, type ImageMeta } from '@/core/image/imageLoader';
import { cubeToLutData, parseCube } from '@/core/render/lut/cubeParser';
import { lutManager, type BuiltinLutInfo } from '@/core/render/lut/lutManager';
import type { LutData } from '@/core/render/lut/lutTypes';
import type { EditParams } from '@/types/EditParams';
import { t } from '@/i18n';

/** camera-watermark「应用」回传（与 env.d.ts 的 CwmApplyResult 同构） */
interface CwmApplyPayload {
  state: Record<string, unknown>;
  meta: Record<string, unknown>;
  previewDataUrl: string;
  width: number;
  height: number;
}
import type { ExportFormat } from '@/core/export/exportWorker';
import { runExport } from '@/core/export/exporter';
import { parseProject, serializeProject, ProjectError } from '@/core/project/projectFile';
import type { BatchItem } from './batch';

export const useEditorStore = defineStore('editor', () => {
  // ---------- 当前图像 ----------
  const imagePath = ref<string | null>(null);
  const imageName = ref<string>('');
  const sourceBuffer = shallowRef<ArrayBuffer | null>(null);
  const meta = shallowRef<ImageMeta | null>(null);
  const previewBitmap = shallowRef<ImageBitmap | null>(null);
  const hasImage = computed(() => previewBitmap.value !== null);

  // ---------- 编辑参数 ----------
  const params = reactive<EditParams>(cloneParams(defaultEditParams));
  const history = createStack<EditParams>();
  const canUndo = ref(false);
  const canRedo = ref(false);
  let scrubbing = false;
  let scrubSnapshot: EditParams | null = null;
  let commitTimer: ReturnType<typeof setTimeout> | null = null;

  function refreshHistoryFlags(): void {
    canUndo.value = canUndoStack(history);
    canRedo.value = canRedoStack(history);
  }

  /** 在修改前留存当前快照（拖动开始时调一次即可） */
  function saveSnapshot(): void {
    pushSnapshot(history, cloneParams(params), 50);
    refreshHistoryFlags();
  }

  /**
   * 修改参数。
   * @param scrub true=拖动过程中（整段拖动只在开始时压一次栈），false=离散动作直接压栈
   */
  function mutate(mutator: (p: EditParams) => void, scrub = false): void {
    if (scrub) {
      if (!scrubbing) {
        scrubbing = true;
        scrubSnapshot = cloneParams(params);
        pushSnapshot(history, scrubSnapshot, 50);
        refreshHistoryFlags();
      }
    } else {
      saveSnapshot();
    }
    mutator(params);
    if (!scrub) {
      if (commitTimer) clearTimeout(commitTimer);
    }
  }

  /** 防抖兜底：程序化连续修改结束后统一落一次栈 */
  function scheduleCommit(): void {
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      // 拖动期间已在开始时压栈，这里只复位标记
      scrubbing = false;
      scrubSnapshot = null;
      commitTimer = null;
    }, 300);
  }

  function endScrub(): void {
    scrubbing = false;
    scrubSnapshot = null;
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = null;
  }

  function undoEdit(): void {
    const prev = undoStack(history, cloneParams(params));
    if (!prev) return;
    restoreParams(prev);
    refreshHistoryFlags();
  }

  function redoEdit(): void {
    const next = redoStack(history, cloneParams(params));
    if (!next) return;
    restoreParams(next);
    refreshHistoryFlags();
  }

  function restoreParams(srcRaw: EditParams): void {
    // ensureParams 补齐旧版工程/历史快照缺失的 curve/hsl/colorGrade/effects 分组
    const src = cloneParams(ensureParams(srcRaw));
    params.geometry = src.geometry;
    params.adjust = src.adjust;
    params.curve = src.curve;
    params.hsl = src.hsl;
    params.colorGrade = src.colorGrade;
    params.effects = src.effects;
    params.lut = src.lut;
    if (src.watermark) {
      params.watermark = {
        enabled: src.watermark.enabled,
        cwmState: src.watermark.cwmState ? JSON.parse(JSON.stringify(src.watermark.cwmState)) : null,
        cwmMeta: src.watermark.cwmMeta ? JSON.parse(JSON.stringify(src.watermark.cwmMeta)) : null,
      };
    } else {
      delete params.watermark;
    }
    void syncLutFromParams();
    scheduleWmPreview();
  }

  // ---------- 视图 ----------
  const view = reactive({ scale: 1, tx: 0, ty: 0, fitScale: 1 });
  const showOriginal = ref(false);
  function setShowOriginal(on: boolean): void {
    showOriginal.value = on;
  }
  function resetView(): void {
    view.scale = view.fitScale;
    view.tx = 0;
    view.ty = 0;
  }

  // ---------- LUT ----------
  const builtinLuts: BuiltinLutInfo[] = lutManager.list();
  const externalLut = shallowRef<{ name: string; path: string; data: LutData } | null>(null);
  const lutData = shallowRef<LutData | null>(null);
  const lutVersion = ref(0); // 数据替换通知渲染层重新上传 3D 纹理
  // 用户自建 LUT 库（导入后持久化到 userData，可命名/分类）
  const USER_LUT_PREFIX = 'user-lut:';
  interface UserLutRec {
    id: string;
    name: string;
    category: string;
    file: string;
    addedAt: number;
  }
  const userLuts = ref<UserLutRec[]>([]);
  const lutLoading = ref(false);
  const currentLutName = computed(() => {
    if (params.lut.id) {
      return builtinLuts.find((l) => l.id === params.lut.id)?.name ?? null;
    }
    return externalLut.value?.name ?? null;
  });

  async function selectBuiltin(id: string): Promise<void> {
    saveSnapshot();
    params.lut.id = id;
    params.lut.isBuiltin = true;
    params.lut.path = null;
    externalLut.value = null;
    if (params.lut.strength <= 0) params.lut.strength = 1;
    lutLoading.value = true;
    try {
      lutData.value = await lutManager.load(id);
      lutVersion.value++;
      // LUT 异步到位后兜底重建水印整图（修复先加水印再选 LUT 时预览停留在无 LUT 底图）
      scheduleWmPreview();
    } catch (err) {
      toast('error', t('msg.lutBuiltinFail', { v: err instanceof Error ? err.message : String(err) }));
    } finally {
      lutLoading.value = false;
    }
  }

  async function loadExternalCube(): Promise<void> {
    const picked = await window.api.openCube();
    if (!picked) return;
    try {
      const parsed = parseCube(picked.text);
      const data = cubeToLutData(parsed);
      saveSnapshot();
      externalLut.value = { name: picked.name, path: picked.path, data };
      params.lut.id = null;
      params.lut.isBuiltin = false;
      params.lut.path = picked.path;
      if (params.lut.strength <= 0) params.lut.strength = 1;
      lutData.value = data;
      lutVersion.value++;
      scheduleWmPreview();
    } catch (err) {
      toast('error', t('msg.lutFileFail', { v: err instanceof Error ? err.message : String(err) }));
    }
  }

  function setLutStrength(v: number, scrub = false): void {
    mutate((p) => {
      p.lut.strength = v;
    }, scrub);
  }

  function removeLut(): void {
    saveSnapshot();
    params.lut.id = null;
    params.lut.path = null;
    params.lut.isBuiltin = false;
    params.lut.strength = 0;
    externalLut.value = null;
    lutData.value = null;
    lutVersion.value++;
    scheduleWmPreview();
  }

  /** 从用户 LUT 库读取并应用指定 id */
  async function selectUserLut(id: string): Promise<void> {
    const res = await window.api.lutLib.read(id);
    if (!res) {
      toast('success', t('msg.lutRemoved'));
      return;
    }
    try {
      const data = cubeToLutData(parseCube(res.text));
      saveSnapshot();
      externalLut.value = { name: res.record.name, path: USER_LUT_PREFIX + id, data };
      params.lut.id = null;
      params.lut.isBuiltin = false;
      params.lut.path = USER_LUT_PREFIX + id;
      if (params.lut.strength <= 0) params.lut.strength = 1;
      lutData.value = data;
      lutVersion.value++;
      scheduleWmPreview();
    } catch (err) {
      toast('error', t('msg.lutFail', { v: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function loadUserLuts(): Promise<void> {
    try {
      userLuts.value = await window.api.lutLib.list();
    } catch {
      userLuts.value = [];
    }
  }

  /** 应用调色预设：saveSnapshot 后整体替换颜色分组，LUT 数据按参数重载 */
  async function applyPreset(name: string, preset: PresetColorParams): Promise<void> {
    if (!hasImage.value) {
      toast('info', t('msg.openImageFirst'));
      return;
    }
    try {
      saveSnapshot();
      const p = ensureParams(preset as Partial<EditParams>);
      params.adjust = p.adjust;
      params.curve = p.curve;
      params.hsl = p.hsl;
      params.colorGrade = p.colorGrade;
      params.effects = p.effects;
      params.lut = p.lut;
      // LUT 数据恢复：内置 / 用户库走 syncLutFromParams；外部文件按路径重读
      // （跨会话时文件未授权会被 readBuffer 拒绝 → 降级清空并提示，与工程文件行为一致）
      const lut = params.lut;
      if ((lut.isBuiltin && lut.id) || lut.path?.startsWith(USER_LUT_PREFIX)) {
        externalLut.value = null;
        await syncLutFromParams();
      } else if (lut.path) {
        try {
          const buf = await window.api.readBuffer(lut.path);
          const data = cubeToLutData(parseCube(new TextDecoder().decode(buf)));
          const shortName = lut.path.replace(/\\/g, '/').split('/').pop() ?? 'LUT';
          externalLut.value = { name: shortName, path: lut.path, data };
          lutData.value = data;
          lutVersion.value++;
        } catch {
          toast('error', t('msg.extLutLost', { v: lut.path }));
          params.lut.id = null;
          params.lut.path = null;
          params.lut.isBuiltin = false;
          params.lut.strength = 0;
          externalLut.value = null;
          lutData.value = null;
          lutVersion.value++;
        }
      }
      scheduleWmPreview();
      toast('success', t('preset.applied', { v: name }));
    } catch (err) {
      toast('error', t('msg.presetFail', { v: err instanceof Error ? err.message : String(err) }));
    }
  }

  // ---------- 调整复制 / 粘贴（跨图片，模块级暂存不持久化） ----------
  let copiedEdits: PresetColorParams | null = null;

  function copyEdits(): void {
    if (!hasImage.value) {
      toast('info', t('msg.openImageFirst'));
      return;
    }
    copiedEdits = pickPresetParams(params);
    toast('success', t('editCopy.copied'));
  }

  function pasteEdits(): void {
    if (!hasImage.value) {
      toast('info', t('msg.openImageFirst'));
      return;
    }
    if (!copiedEdits) {
      toast('info', t('editCopy.none'));
      return;
    }
    void applyPreset(t('editCopy.pastedName'), copiedEdits);
  }

  async function importUserLuts(): Promise<void> {
    const r = await window.api.lutLib.import();
    if (!r) return;
    userLuts.value = r.lib;
    if (r.imported[0]) await selectUserLut(r.imported[0].id);
  }

  async function renameUserLut(id: string, name: string): Promise<void> {
    userLuts.value = await window.api.lutLib.update(id, { name });
    if (externalLut.value?.path === USER_LUT_PREFIX + id) {
      externalLut.value = { ...externalLut.value, name };
    }
  }

  async function categorizeUserLut(id: string, category: string): Promise<void> {
    userLuts.value = await window.api.lutLib.update(id, { category });
  }

  async function removeUserLut(id: string): Promise<void> {
    userLuts.value = await window.api.lutLib.remove(id);
    if (params.lut.path === USER_LUT_PREFIX + id) removeLut();
  }

  /** 撤销/重做/打开工程后，按 params.lut 重新同步 LUT 数据 */
  async function syncLutFromParams(): Promise<void> {
    if (params.lut.isBuiltin && params.lut.id) {
      try {
        lutData.value = await lutManager.load(params.lut.id);
      } catch {
        toast('error', t('msg.lutBuiltinGone', { v: params.lut.id ?? '' }));
        lutData.value = null;
      }
    } else if (
      !params.lut.isBuiltin &&
      params.lut.path &&
      params.lut.path.startsWith(USER_LUT_PREFIX)
    ) {
      // 用户库 LUT：按 id 从持久化库读取
      const id = params.lut.path.slice(USER_LUT_PREFIX.length);
      try {
        const res = await window.api.lutLib.read(id);
        if (res) {
          externalLut.value = {
            name: res.record.name,
            path: params.lut.path,
            data: cubeToLutData(parseCube(res.text)),
          };
          lutData.value = externalLut.value.data;
        } else {
          lutData.value = null;
        }
      } catch {
        toast('error', t('msg.userLutLost', { v: id }));
        lutData.value = null;
      }
    } else if (!params.lut.isBuiltin && params.lut.path && externalLut.value?.path === params.lut.path) {
      lutData.value = externalLut.value.data;
    } else {
      lutData.value = null;
    }
    lutVersion.value++;
  }

  // ---------- 几何快捷操作 ----------
  function rotate90(direction: 1 | -1): void {
    mutate((p) => {
      p.geometry.rotation = (p.geometry.rotation + direction * 90 + 360) % 360;
    });
  }
  function toggleFlipH(): void {
    mutate((p) => {
      p.geometry.flipH = !p.geometry.flipH;
    });
  }
  function toggleFlipV(): void {
    mutate((p) => {
      p.geometry.flipV = !p.geometry.flipV;
    });
  }
  function setCrop(rect: { x: number; y: number; width: number; height: number }): void {
    mutate((p) => {
      p.geometry.x = rect.x;
      p.geometry.y = rect.y;
      p.geometry.width = rect.width;
      p.geometry.height = rect.height;
    });
  }
  function resetCrop(): void {
    mutate((p) => {
      p.geometry.x = 0;
      p.geometry.y = 0;
      p.geometry.width = 1;
      p.geometry.height = 1;
    });
  }
  function resetGeometryAll(): void {
    mutate((p) => {
      p.geometry = cloneParams(defaultEditParams).geometry;
    });
  }
  function resetAdjust(): void {
    mutate((p) => {
      p.adjust = cloneParams(defaultEditParams).adjust;
    });
  }
  /** 重置全部调色分组（影调 / 曲线 / HSL / 颜色分级 / 效果），不动几何与 LUT */
  function resetColorAll(): void {
    mutate((p) => {
      const d = cloneParams(defaultEditParams);
      p.adjust = d.adjust;
      p.curve = d.curve;
      p.hsl = d.hsl;
      p.colorGrade = d.colorGrade;
      p.effects = d.effects;
    });
  }

  // ---------- 水印（整体复用 camera-watermark 引擎） ----------
  // params.watermark（cwmState/cwmMeta）可撤销、进工程文件；
  // wmPreviewUrl 是运行时的「调色后 + 水印」整图预览，不进撤销/工程。
  const wmPreviewUrl = ref<string | null>(null);
  // 水印整图正在重建时为 true：此时让底层 WebGL 实时画面透出来，
  // 避免旧水印整图死盖住画布、让 LUT/调色看起来「没反应」
  const wmPreviewStale = ref(false);
  // 离屏合成代次令牌：丢弃过期返回，防止多个合成窗结果乱序覆盖
  let wmSeq = 0;
  // 由 EditorCanvas 注册：返回当前 WebGL 画布（调色/几何/LUT 后）的 PNG dataURL
  let editedCapture: (() => string) | null = null;
  function registerEditedCapture(fn: (() => string) | null): void {
    editedCapture = fn;
  }
  let wmPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  /** IPC/contextBridge 不能克隆 Vue reactive Proxy；水印状态进出主进程前统一转成普通对象。 */
  function cloneForIpc<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }
  /** 防抖重建水印预览（调色/几何/LUT/撤销后调用，仅在启用水印时开离屏合成窗） */
  function scheduleWmPreview(): void {
    const wm = params.watermark;
    // 已有可用水印整图时，先标记为过期、露出底层实时画面，保证调色/LUT 即时反馈
    if (wm?.enabled && wm.cwmState && wmPreviewUrl.value) wmPreviewStale.value = true;
    if (wmPreviewTimer) clearTimeout(wmPreviewTimer);
    wmPreviewTimer = setTimeout(() => {
      void refreshWmPreview();
    }, 400);
  }

  function bitmapToDataUrl(bmp: ImageBitmap): string {
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  }

  function setWatermarkEnabled(on: boolean): void {
    mutate((p) => {
      if (!p.watermark) p.watermark = { enabled: on, cwmState: null, cwmMeta: null };
      else p.watermark.enabled = on;
    });
    if (on) scheduleWmPreview();
    else {
      wmSeq++;
      wmPreviewUrl.value = null;
      wmPreviewStale.value = false;
    }
  }

  /** 打开 camera-watermark 水印工作室（整体加载其原始编辑器） */
  async function openCwmStudio(): Promise<void> {
    if (!previewBitmap.value) return;
    const baseDataUrl = editedCapture
      ? editedCapture()
      : bitmapToDataUrl(previewBitmap.value);
    await window.api.openCwm({
      baseDataUrl,
      // RAW 的原始字节无法被 camera-watermark 解码，传过去只会让工作室启动失败。
      // LumEdit 已完成 RAW 解码与 EXIF 解析，工作室直接复用预览和 meta。
      origBuffer: meta.value?.sourceFormat === 'raw'
        ? null
        : sourceBuffer.value
          ? sourceBuffer.value.slice(0)
          : null,
      fileName: imageName.value,
      meta: meta.value?.cwmMeta ? cloneForIpc(meta.value.cwmMeta) : {},
      savedState: params.watermark?.cwmState ? cloneForIpc(params.watermark.cwmState) : null,
    });
  }

  /** 工作室「应用」回传：保存完整 state/meta，并显示其渲染的整图预览（压一次撤销栈） */
  function applyCwmResult(payload: CwmApplyPayload): void {
    saveSnapshot();
    wmSeq++; // 作废任何在途的离屏重建
    params.watermark = {
      enabled: true,
      cwmState: payload.state,
      cwmMeta: payload.meta,
    };
    wmPreviewUrl.value = payload.previewDataUrl;
    wmPreviewStale.value = false;
  }

  /** 移除水印 */
  function clearWatermark(): void {
    saveSnapshot();
    wmSeq++;
    delete params.watermark;
    wmPreviewUrl.value = null;
    wmPreviewStale.value = false;
  }

  /** 用当前调色后预览 + 保存的 cwmState，经离屏窗口重建一张水印预览图 */
  async function refreshWmPreview(): Promise<void> {
    const wm = params.watermark;
    if (!wm?.enabled || !wm.cwmState) {
      wmPreviewStale.value = false;
      return;
    }
    if (!editedCapture) return;
    const seq = ++wmSeq;
    try {
      const baseDataUrl = editedCapture();
      if (!baseDataUrl) return;
      const r = await window.api.composeCwm({
        baseDataUrl,
        state: cloneForIpc(wm.cwmState),
        meta: wm.cwmMeta ? cloneForIpc(wm.cwmMeta) : {},
        format: 'image/png',
        quality: 1,
      });
      // 过期结果丢弃（期间又改了参数 / 移除了水印 / 切了图）
      if (seq !== wmSeq) return;
      const blob = new Blob([r.buffer], { type: 'image/png' });
      const url = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      if (seq !== wmSeq) return;
      wmPreviewUrl.value = url;
      wmPreviewStale.value = false;
    } catch (err) {
      if (seq === wmSeq) console.error('[watermark] 预览重建失败', err);
    }
  }

  // ---------- 导出选项 ----------
  const exportOptions = reactive({
    format: 'jpeg' as ExportFormat,
    quality: 0.92,
    keepExif: true,
    stripGps: true,
    scale: 1,
  });
  const exporting = ref(false);

  // ---------- 白平衡吸管 ----------
  const pickerActive = ref(false);
  function togglePicker(): void {
    if (!hasImage.value) return;
    pickerActive.value = !pickerActive.value;
  }
  function cancelPicker(): void {
    pickerActive.value = false;
  }
  /** 吸管取样输出像素（0-255）。按 AdjustStage 白平衡公式反解温/色调增量并叠加到当前值 */
  function applyWhiteBalance(r: number, g: number, b: number): void {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const denom = 0.06 * (2 - 0.5 * (rn + bn));
    const dTemp = denom > 1e-4 ? (bn - rn) / denom : 0;
    const dTint = (gn - (rn + bn) / 2) / 0.05;
    mutate((p) => {
      p.adjust.temperature = Math.min(1, Math.max(-1, p.adjust.temperature + dTemp));
      p.adjust.tint = Math.min(1, Math.max(-1, p.adjust.tint + dTint));
    });
    pickerActive.value = false;
  }

  // ---------- 分屏对比 / 剪裁警告（视图状态，不进撤销栈与工程） ----------
  const splitCompare = ref(false);
  const splitX = ref(0.5);
  const clipWarn = ref(false);
  function toggleSplitCompare(): void {
    if (!hasImage.value) return;
    splitCompare.value = !splitCompare.value;
  }
  function setSplitX(x: number): void {
    splitX.value = Math.min(0.98, Math.max(0.02, x));
  }
  function toggleClipWarn(): void {
    clipWarn.value = !clipWarn.value;
  }

  // ---------- 交互模式 / 裁剪比例 ----------
  const mode = ref<'edit' | 'crop'>('edit');
  const cropAspect = ref<number | null>(null);
  const cropGuide = ref<'thirds' | 'grid' | 'golden' | 'off'>('thirds');
  function cycleCropGuide(): void {
    const order = ['thirds', 'grid', 'golden', 'off'] as const;
    cropGuide.value = order[(order.indexOf(cropGuide.value) + 1) % order.length];
  }
  function setMode(m: 'edit' | 'crop'): void {
    mode.value = m;
  }
  function setCropAspect(a: number | null): void {
    cropAspect.value = a;
    // 选定具体比例即进入裁剪并实时显示居中最大裁剪框；「自由」仅解除约束
    if (a != null && hasImage.value) mode.value = 'crop';
  }
  function zoomBy(f: number): void {
    // 与画布滚轮一致的缩放范围（围绕画面中心，transform-origin:center）
    view.scale = Math.min(16, Math.max(0.1, view.scale * f));
  }

  // ---------- 导出 ----------
  async function exportCurrent(): Promise<string | null> {
    if (!sourceBuffer.value || !meta.value) {
      toast('info', t('msg.openImageFirst'));
      return null;
    }
    exporting.value = true;
    try {
      const ext = exportOptions.format === 'jpeg' ? 'jpg' : exportOptions.format;
      const base = imageName.value.replace(/\.[^.]+$/, '');
      const resp = await runExport({
        buffer: sourceBuffer.value.slice(0),
        meta: meta.value,
        params: cloneParams(params),
        lut: lutData.value,
        format: exportOptions.format,
        quality: exportOptions.quality,
        keepExif: exportOptions.keepExif,
        stripGps: exportOptions.stripGps,
        scale: exportOptions.scale,
      });
      if (!resp.ok || !resp.bytes) throw new Error(resp.error || t('msg.exportFailed'));
      // 水印由 exporter 在主线程离屏合成（params.watermark.cwmState）
      const saved = await window.api.saveBuffer(
        `${base}-lumedit.${ext}`,
        [{ name: t('topbar.openImage'), extensions: [ext] }],
        resp.bytes
      );
      return saved;
    } catch (err) {
      toast('error', t('msg.exportFail', { v: err instanceof Error ? err.message : String(err) }));
      return null;
    } finally {
      exporting.value = false;
    }
  }

  /** 修好的图直接写入系统剪贴板（PNG 无损，含水印），贴进微信/文档即用 */
  async function copyToClipboard(): Promise<boolean> {
    if (!sourceBuffer.value || !meta.value) {
      toast('info', t('msg.openImageFirst'));
      return false;
    }
    exporting.value = true;
    try {
      const resp = await runExport({
        buffer: sourceBuffer.value.slice(0),
        meta: meta.value,
        params: cloneParams(params),
        lut: lutData.value,
        format: 'png',
        quality: 1,
        keepExif: false,
        stripGps: exportOptions.stripGps,
        scale: exportOptions.scale,
      });
      if (!resp.ok || !resp.bytes) throw new Error(resp.error || t('msg.exportFail', { v: '' }));
      await window.api.writeClipboardImage(resp.bytes);
      toast('success', t('exportPanel.clipboardDone'));
      return true;
    } catch (err) {
      toast('error', t('msg.exportFail', { v: err instanceof Error ? err.message : String(err) }));
      return false;
    } finally {
      exporting.value = false;
    }
  }

  // ---------- 工程文件 ----------
  async function saveProjectFile(): Promise<void> {
    if (!hasImage.value) {
      toast('info', t('msg.openImageFirst'));
      return;
    }
    const json = serializeProject({
      sourcePath: imagePath.value,
      sourceName: imageName.value,
      params: cloneParams(params),
      externalLut: externalLut.value
        ? { path: externalLut.value.path, name: externalLut.value.name }
        : null,
    });
    const base = imageName.value.replace(/\.[^.]+$/, '');
    await window.api.saveProject(`${base}.lightedit`, json);
  }

  async function openProjectFile(): Promise<void> {
    const picked = await window.api.openProject();
    if (!picked) return;
    try {
      const proj = parseProject(picked.text);
      // 重新加载源图（路径引用，不内嵌）
      if (proj.source?.path) {
        try {
          const buf = await window.api.readBuffer(proj.source.path);
          await loadImageObject(proj.source.path, proj.source.name, buf);
        } catch {
          toast('error', t('msg.sourceLost', { v: proj.source.path }));
          return;
        }
      }
      // 恢复参数（ensureParams 兼容旧工程缺失的调色分组）
      const p = cloneParams(ensureParams(proj.params));
      params.geometry = p.geometry;
      params.adjust = p.adjust;
      params.curve = p.curve;
      params.hsl = p.hsl;
      params.colorGrade = p.colorGrade;
      params.effects = p.effects;
      params.lut = p.lut;
      if (p.watermark) {
        params.watermark = {
          enabled: p.watermark.enabled,
          cwmState: p.watermark.cwmState ? JSON.parse(JSON.stringify(p.watermark.cwmState)) : null,
          cwmMeta: p.watermark.cwmMeta ? JSON.parse(JSON.stringify(p.watermark.cwmMeta)) : null,
        };
      } else delete params.watermark;
      history.past = [];
      history.future = [];
      refreshHistoryFlags();
      // 外部 LUT：用户库按 id 读取，临时外部 LUT 按文件路径读取
      if (!p.lut.isBuiltin && p.lut.path) {
        try {
          let text: string;
          let name: string;
          if (p.lut.path.startsWith(USER_LUT_PREFIX)) {
            const id = p.lut.path.slice(USER_LUT_PREFIX.length);
            const res = await window.api.lutLib.read(id);
            if (!res) throw new Error(t('msg.userLutDeleted'));
            text = res.text;
            name = res.record.name;
          } else {
            const buf = await window.api.readBuffer(p.lut.path);
            text = new TextDecoder().decode(buf);
            name = proj.externalLut?.name ?? p.lut.path;
          }
          const parsed = parseCube(text);
          const data = cubeToLutData(parsed);
          externalLut.value = { name, path: p.lut.path, data };
          lutData.value = data;
          lutVersion.value++;
        } catch {
          toast('error', t('msg.extLutLost', { v: p.lut.path ?? '' }));
          params.lut.id = null;
          params.lut.path = null;
          params.lut.strength = 0;
        }
      } else if (p.lut.isBuiltin && p.lut.id) {
        syncLutFromParams();
      }
      // 水印预览按恢复的 cwmState 离屏重建
      scheduleWmPreview();
    } catch (err) {
      toast('error', err instanceof ProjectError ? err.message : t('msg.projectFail', { v: String(err) }));
    }
  }

  // ---------- 打开图片 ----------
  async function loadImageObject(path: string, name: string, buffer: ArrayBuffer): Promise<void> {
    const decoded = await decodeForPreview(buffer, name);
    // 预览解码会消费 buffer（exifr/blob 均不转移所有权，buffer 仍可用），另存一份原始字节
    if (previewBitmap.value) previewBitmap.value.close();
    imagePath.value = path;
    imageName.value = name;
    sourceBuffer.value = buffer;
    meta.value = decoded.meta;
    previewBitmap.value = decoded.bitmap;
    resetParamsInternal();
    resetView();
  }

  async function openPicker(): Promise<boolean> {
    const results = await window.api.openImages(false);
    if (!results || results.length === 0) return false;
    const r = results[0];
    await loadImageObject(r.path, r.name, r.buffer);
    return true;
  }

  function resetParamsInternal(): void {
    const d = cloneParams(defaultEditParams);
    Object.assign(params, d);
    params.geometry = d.geometry;
    params.adjust = d.adjust;
    params.curve = d.curve;
    params.hsl = d.hsl;
    params.colorGrade = d.colorGrade;
    params.effects = d.effects;
    params.lut = d.lut;
    wmSeq++;
    delete params.watermark;
    wmPreviewUrl.value = null;
    wmPreviewStale.value = false;
    history.past = [];
    history.future = [];
    refreshHistoryFlags();
    externalLut.value = null;
    lutData.value = null;
    lutVersion.value++;
  }

  /** 切换图片（批量列表双击等场景） */
  async function switchTo(item: BatchItem): Promise<void> {
    await loadImageObject(item.path, item.name, item.buffer.slice(0));
  }

  function closeImage(): void {
    previewBitmap.value?.close();
    previewBitmap.value = null;
    sourceBuffer.value = null;
    meta.value = null;
    imagePath.value = null;
    imageName.value = '';
    resetParamsInternal();
  }

  return {
    // state
    imagePath, imageName, sourceBuffer, meta, previewBitmap, hasImage,
    params, canUndo, canRedo,
    view, showOriginal,
    builtinLuts, externalLut, lutData, lutVersion, lutLoading, currentLutName,
    userLuts, loadUserLuts, importUserLuts, selectUserLut, renameUserLut, categorizeUserLut, removeUserLut,
    exportOptions, exporting,
    wmPreviewUrl, wmPreviewStale, registerEditedCapture, scheduleWmPreview,
    setWatermarkEnabled, openCwmStudio, applyCwmResult, clearWatermark, refreshWmPreview,
    // history / mutate
    mutate, saveSnapshot, endScrub, scheduleCommit, undoEdit, redoEdit,
    setShowOriginal, resetView,
    // lut
    selectBuiltin, loadExternalCube, setLutStrength, removeLut, syncLutFromParams,
    // presets / clipboard / copy-paste
    applyPreset, copyToClipboard, copyEdits, pasteEdits,
    // geometry
    rotate90, toggleFlipH, toggleFlipV, setCrop, resetCrop, resetGeometryAll, resetAdjust, resetColorAll,
    // picker / split / clip / mode / zoom / export / project
    pickerActive, togglePicker, cancelPicker, applyWhiteBalance,
    splitCompare, splitX, clipWarn, toggleSplitCompare, setSplitX, toggleClipWarn,
    mode, cropAspect, cropGuide, cycleCropGuide, setMode, setCropAspect, zoomBy,
    exportCurrent, saveProjectFile, openProjectFile,
    // image
    openPicker, loadImageObject, switchTo, closeImage,
  };
});
