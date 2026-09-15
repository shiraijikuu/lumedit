import { defineStore } from 'pinia';
import { toast } from './toast';
import { watch } from 'vue';
import { computed, reactive, ref, shallowRef } from 'vue';
import {
  cloneParams,
  defaultEditParams,
  ensureParams,
  pickPresetParams,
  createGradation,
  MAX_GRADATIONS,
  type GradationType,
  createBlendLayer,
  MAX_BLEND_LAYERS,
  type BlendLayer,
  type BlendMode,
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
import type { AdjustParams, EditParams } from '@/types/EditParams';
import { bakeLutFromParams } from '@/core/render/lut/bakeCurrentLut';
import { t } from '@/i18n';
import { computeAutoAdjustments } from '@/core/analysis/AutoEnhanceEngine';
import type { AnalysisResult } from '@/core/analysis/HistogramAnalyzer';

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
    autoEnhanceApplied.value = false;
    autoEnhanceBefore = null;
    refreshHistoryFlags();
  }

  function redoEdit(): void {
    const next = redoStack(history, cloneParams(params));
    if (!next) return;
    restoreParams(next);
    autoEnhanceApplied.value = false;
    autoEnhanceBefore = null;
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
    params.logWheels = src.logWheels;
    params.effects = src.effects;
    params.gradation = src.gradation;
    params.gradations = src.gradations;
    params.qualifier = src.qualifier;
    params.tonemap = src.tonemap;
    params.lut = src.lut;
    if (src.blend) {
      params.blend = {
        enabled: src.blend.enabled,
        position: src.blend.position,
        layers: src.blend.layers.map((l) => ({ ...l })),
      };
    } else {
      delete params.blend;
    }
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
      params.logWheels = p.logWheels;
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
    autoEnhanceApplied.value = false;
    autoEnhanceBefore = null;
  }

  const autoEnhancing = ref(false);
  const autoEnhanceApplied = ref(false);
  let autoEnhanceBefore: AdjustParams | null = null;

  /** 分析当前预览并一次性应用规则引擎生成的影调参数。 */
  async function applyAutoEnhance(): Promise<boolean> {
    if (!hasImage.value || autoEnhancing.value || !analyzeImageCapture) return false;
    autoEnhancing.value = true;
    try {
      const analysis = await analyzeImageCapture();
      const adjustments = computeAutoAdjustments(analysis);
      autoEnhanceBefore = cloneParams(params).adjust;
      mutate((p) => Object.assign(p.adjust, adjustments));
      autoEnhanceApplied.value = true;
      toast('success', t('msg.autoEnhanceDone'));
      return true;
    } catch (err) {
      toast('error', t('msg.autoEnhanceFail', { v: err instanceof Error ? err.message : String(err) }));
      return false;
    } finally {
      autoEnhancing.value = false;
    }
  }
  /** 重置全部调色分组（影调 / 曲线 / HSL / 分级 / 局部 / 限定器 / Soft Clip / 效果），不动几何与 LUT */
  function resetColorAll(): void {
    mutate((p) => {
      const d = cloneParams(defaultEditParams);
      p.adjust = d.adjust;
      p.curve = d.curve;
      p.hsl = d.hsl;
      p.colorGrade = d.colorGrade;
      p.logWheels = d.logWheels;
      p.effects = d.effects;
      p.gradation = d.gradation;
      p.gradations = d.gradations;
      p.qualifier = d.qualifier;
      p.tonemap = d.tonemap;
      selectedGradId.value = null;
    });
    autoEnhanceApplied.value = false;
    autoEnhanceBefore = null;
  }

  // ---------- 多局部蒙版（v0.4.0） ----------
  const selectedGradId = ref<string | null>(null);
  function addGradation(type: GradationType = 'linear'): void {
    if (params.gradations.length >= MAX_GRADATIONS) {
      toast('info', t('gradation.maxReached'));
      return;
    }
    const item = createGradation(type);
    mutate((p) => {
      p.gradations.push(item);
    });
    selectedGradId.value = item.id;
  }
  function removeGradation(id: string): void {
    mutate((p) => {
      p.gradations = p.gradations.filter((g) => g.id !== id);
    });
    if (selectedGradId.value === id) selectedGradId.value = null;
  }
  function duplicateGradation(id: string): void {
    if (params.gradations.length >= MAX_GRADATIONS) {
      toast('info', t('gradation.maxReached'));
      return;
    }
    const src = params.gradations.find((g) => g.id === id);
    if (!src) return;
    const copy = createGradation(src.type);
    Object.assign(copy, {
      enabled: src.enabled,
      x1: src.x1, y1: src.y1, x2: src.x2, y2: src.y2,
      exposure: src.exposure, temperature: src.temperature, tint: src.tint,
    });
    mutate((p) => {
      const idx = p.gradations.findIndex((g) => g.id === id);
      p.gradations.splice(idx + 1, 0, copy);
    });
    selectedGradId.value = copy.id;
  }
  function selectGradation(id: string | null): void {
    selectedGradId.value = id;
    // 画笔绘制是蒙版级模式；切到线性/径向/亮度/颜色时必须退出，避免画布指针被画笔拦截。
    if (paintBrushId.value && paintBrushId.value !== id) paintBrushId.value = null;
  }
  /** 修改指定蒙版（滑块拖动走 scrub） */
  function mutateGrad(id: string, fn: (g: EditParams['gradations'][number]) => void, scrub = false): void {
    mutate((p) => {
      const g = p.gradations.find((x) => x.id === id);
      if (g) fn(g);
    }, scrub);
  }

  // ---------- 多重图片叠加（v0.5.0） ----------
  const selectedBlendId = ref<string | null>(null);
  const selectedBlendLayer = computed<BlendLayer | null>(
    () => params.blend?.layers.find((l) => l.id === selectedBlendId.value) ?? null
  );

  /** 保证 blend 组存在（在一次 mutate 内调用） */
  function ensureBlendGroup(p: EditParams): void {
    if (!p.blend) p.blend = { enabled: true, layers: [], position: 'after-lut' };
  }

  /** 从文件选择器添加叠加图层 */
  async function addBlendLayerFromPicker(): Promise<void> {
    if (!hasImage.value) return;
    if ((params.blend?.layers.length ?? 0) >= MAX_BLEND_LAYERS) {
      toast('info', t('blend.maxReached'));
      return;
    }
    const results = await window.api.openImages(false);
    if (!results || results.length === 0) return;
    const r = results[0];
    const layer = createBlendLayer(r.path, r.name.replace(/\.[^.]+$/, ''));
    mutate((p) => {
      ensureBlendGroup(p);
      p.blend!.enabled = true;
      p.blend!.layers.push(layer);
    });
    selectedBlendId.value = layer.id;
  }

  /** 用已有路径添加（工程恢复/内部） */
  function addBlendLayer(path: string, name: string): string {
    const layer = createBlendLayer(path, name);
    mutate((p) => {
      ensureBlendGroup(p);
      p.blend!.layers.push(layer);
    });
    selectedBlendId.value = layer.id;
    return layer.id;
  }

  function selectBlendLayer(id: string | null): void {
    selectedBlendId.value = id;
  }

  function mutateBlendLayer(
    id: string,
    fn: (l: BlendLayer) => void,
    scrub = false
  ): void {
    mutate((p) => {
      const l = p.blend?.layers.find((x) => x.id === id);
      if (l) fn(l);
    }, scrub);
  }

  function removeBlendLayer(id: string): void {
    mutate((p) => {
      if (!p.blend) return;
      p.blend.layers = p.blend.layers.filter((l) => l.id !== id);
    });
    if (selectedBlendId.value === id) selectedBlendId.value = null;
  }

  function duplicateBlendLayer(id: string): void {
    if ((params.blend?.layers.length ?? 0) >= MAX_BLEND_LAYERS) {
      toast('info', t('blend.maxReached'));
      return;
    }
    const src = params.blend?.layers.find((l) => l.id === id);
    if (!src) return;
    const copy = createBlendLayer(src.imagePath, `${src.name} ${t('common.copy')}`);
    Object.assign(copy, {
      mode: src.mode, opacity: src.opacity, x: src.x, y: src.y,
      scale: src.scale, rotation: src.rotation, flipH: src.flipH, flipV: src.flipV,
      visible: src.visible,
    });
    mutate((p) => {
      if (!p.blend) return;
      const idx = p.blend.layers.findIndex((l) => l.id === id);
      p.blend.layers.splice(idx + 1, 0, copy);
    });
    selectedBlendId.value = copy.id;
  }

  /** dir=-1 上移（更靠底）/ +1 下移（更靠顶）；数组末尾=最上层=最后合成 */
  function moveBlendLayer(id: string, dir: -1 | 1): void {
    mutate((p) => {
      if (!p.blend) return;
      const arr = p.blend.layers;
      const idx = arr.findIndex((l) => l.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= arr.length) return;
      const [item] = arr.splice(idx, 1);
      arr.splice(target, 0, item);
    });
  }

  function toggleBlendLayerVisible(id: string): void {
    mutate((p) => {
      const l = p.blend?.layers.find((x) => x.id === id);
      if (l) l.visible = !l.visible;
    });
  }

  function setBlendEnabled(on: boolean): void {
    mutate((p) => {
      ensureBlendGroup(p);
      p.blend!.enabled = on;
    });
  }

  function setBlendPosition(position: 'before-lut' | 'after-lut'): void {
    mutate((p) => {
      ensureBlendGroup(p);
      p.blend!.position = position;
    });
  }

  function setBlendMode(id: string, mode: BlendMode): void {
    mutateBlendLayer(id, (l) => {
      l.mode = mode;
    });
  }

  // ---------- HSL 取色限定器吸管（v0.4.0） ----------
  const qualifierPicker = ref(false);
  function toggleQualifierPicker(): void {
    if (!hasImage.value) return;
    qualifierPicker.value = !qualifierPicker.value;
    if (qualifierPicker.value) pickerActive.value = false; // 与白平衡吸管互斥
  }
  function rgbToHue(r8: number, g8: number, b8: number): number {
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    let h: number;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return h;
  }
  /** 取色限定器吸管落点：以像素色相为中心并启用 */
  function applyQualifierHue(r: number, g: number, b: number): void {
    const hue = rgbToHue(r, g, b);
    mutate((p) => {
      p.qualifier.enabled = true;
      p.qualifier.centerHue = Math.round(hue);
    });
    qualifierPicker.value = false;
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
  let analyzeImageCapture: (() => Promise<AnalysisResult>) | null = null;
  function registerAnalyzeCapture(fn: (() => Promise<AnalysisResult>) | null): void {
    analyzeImageCapture = fn;
  }
  let wmPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  /** IPC/contextBridge 不能克隆 Vue reactive Proxy；水印状态进出主进程前统一转成普通对象。 */
  function cloneForIpc<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }
  /** 防抖重建水印预览（调色/几何/LUT/撤销后调用，仅在启用水印时开离屏合成窗） */
  function scheduleWmPreview(): void {
    const wm = params.watermark;
    // 水印未启用 / 无水印内容：立即清空整图预览，绝不让旧整图残留遮挡实时 GL 画面
    if (!wm?.enabled || !wm.cwmState) {
      if (wmPreviewTimer) { clearTimeout(wmPreviewTimer); wmPreviewTimer = null; }
      wmPreviewUrl.value = null;
      wmPreviewStale.value = false;
      return;
    }
    // 已有可用水印整图时，先标记为过期、露出底层实时画面，保证调色/LUT 即时反馈
    if (wmPreviewUrl.value) wmPreviewStale.value = true;
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

  /** 恢复自动优化前的 adjust；自动优化开关关闭时调用。 */
  function resetAutoEnhance(): void {
    const before = autoEnhanceBefore;
    autoEnhanceBefore = null;
    autoEnhanceApplied.value = false;
    if (!before) return;
    mutate((p) => {
      p.adjust = { ...before };
    });
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
      // 等待重建期间水印被关闭/移除：清空残留整图，避免遮挡实时 GL 画面
      wmPreviewUrl.value = null;
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

  // ---------- 图片会话条 / 最近打开 / 会话恢复 ----------
  interface SessionImage { path: string; name: string; buffer: ArrayBuffer; thumb: string; params: EditParams | null; }
  const sessionImages = ref<SessionImage[]>([]);
  const SESSION_CAP = 20;
  let sessionCapWarned = false;
  let sessionSaveTimer: number | null = null;

  async function makeThumb(bmp: ImageBitmap): Promise<string> {
    const k = Math.min(1, 96 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  }

  function scheduleSessionSave(): void {
    if (sessionSaveTimer !== null) window.clearTimeout(sessionSaveTimer);
    sessionSaveTimer = window.setTimeout(() => {
      void saveSessionNow();
    }, 2000);
  }

  async function saveSessionNow(): Promise<void> {
    if (!hasImage.value || !imagePath.value) return;
    try {
      await window.api.session.save({
        imagePath: imagePath.value,
        imageName: imageName.value,
        params: cloneParams(params),
      });
    } catch {
      /* 会话保存失败静默 */
    }
  }

  async function restoreSession(): Promise<void> {
    try {
      const data = await window.api.session.load();
      if (!data) return;
      await loadImageObject(data.path, data.name, data.buffer);
      if (data.params) {
        const p = ensureParams(data.params as Partial<EditParams>);
        params.geometry = p.geometry;
        params.adjust = p.adjust;
        params.curve = p.curve;
        params.hsl = p.hsl;
        params.colorGrade = p.colorGrade;
        params.logWheels = p.logWheels;
        params.effects = p.effects;
        params.gradation = p.gradation;
        params.gradations = p.gradations;
        params.qualifier = p.qualifier;
        params.tonemap = p.tonemap;
        params.lut = p.lut;
        await syncLutFromParams();
        scheduleWmPreview();
      }
      toast('info', t('msg.sessionRestored'));
    } catch {
      /* 恢复失败静默 */
    }
  }

  async function openRecent(index: number): Promise<void> {
    try {
      const data = await window.api.recent.open(index);
      if (data) await loadImageObject(data.path, data.name, data.buffer);
    } catch (err) {
      toast('error', t('msg.exportFail', { v: err instanceof Error ? err.message : String(err) }));
    }
  }

  // ---------- 画笔蒙版绘制 ----------
  const paintBrushId = ref<string | null>(null);
  const brushRadius = ref(0.08);
  const brushHardness = ref(0.7);

  function setPaintBrush(id: string | null): void {
    paintBrushId.value = paintBrushId.value === id ? null : id;
  }

  /** 笔画开始：推入新笔画（走撤销栈，一次笔画一个快照） */
  function brushBeginStroke(id: string, x: number, y: number): void {
    mutate((p) => {
      const g = p.gradations.find((x2) => x2.id === id);
      if (!g) return;
      g.strokes.push({ pts: [[x, y]], radius: brushRadius.value, hardness: brushHardness.value });
    }, true);
  }

  /** 笔画续点：距离抽稀后追加（scrub 模式，不压栈） */
  function brushAddPoint(id: string, x: number, y: number): void {
    const g = params.gradations.find((x2) => x2.id === id);
    if (!g || !g.strokes.length) return;
    const st = g.strokes[g.strokes.length - 1];
    const [lx, ly] = st.pts[st.pts.length - 1];
    if (Math.hypot(x - lx, y - ly) < 0.006) return;
    st.pts.push([x, y]);
  }

  function brushEndStroke(): void {
    endScrub();
  }

  // ---------- 白平衡吸管 ----------
  const pickerActive = ref(false);
  function togglePicker(): void {
    if (!hasImage.value) return;
    pickerActive.value = !pickerActive.value;
    if (pickerActive.value) qualifierPicker.value = false; // 与取色限定器吸管互斥
  }
  function cancelPicker(): void {
    pickerActive.value = false;
    qualifierPicker.value = false;
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
      const ext = exportOptions.format === 'jpeg' ? 'jpg' : exportOptions.format === 'png16' ? 'png' : exportOptions.format;
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

  /** 当前调色（逐像素部分）GPU 烘焙为 .cube LUT 并保存 */
  async function exportLutCube(): Promise<void> {
    try {
      const text = await bakeLutFromParams(params);
      const saved = await window.api.saveText(
        `lumedit-${Date.now()}.cube`,
        [{ name: '3D LUT', extensions: ['cube'] }],
        text
      );
      if (saved) toast('success', t('lut.exported'));
    } catch (err) {
      toast('error', t('msg.exportFail', { v: err instanceof Error ? err.message : String(err) }));
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
      // 恢复全部参数组（曲线 / HSL / 分级 / 蒙版 / Qualifier / Tonemap / Blend / 水印）
      const p = cloneParams(ensureParams(proj.params));
      restoreParams(p);
      selectedBlendId.value = null;
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
    // 会话条 / 最近打开 / 会话保存
    void (async () => {
      try {
        if (!previewBitmap.value) return;
        const thumb = await makeThumb(previewBitmap.value);
        const existing = sessionImages.value.findIndex((x) => x.path === path);
        if (existing >= 0) {
          const it = sessionImages.value[existing];
          it.buffer = buffer;
          it.name = name;
          it.thumb = thumb;
        } else {
          if (sessionImages.value.length >= SESSION_CAP) {
            sessionImages.value.shift();
            if (!sessionCapWarned) {
              sessionCapWarned = true;
              toast('info', t('msg.sessionCap', { v: SESSION_CAP }));
            }
          }
          sessionImages.value.push({ path, name, buffer, thumb, params: null });
        }
      } catch {
        /* 缩略图失败不影响主流程 */
      }
    })();
    if (path) {
      void window.api.recent.push(path, name).catch(() => {});
      scheduleSessionSave();
    }
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
    autoEnhanceApplied.value = false;
    autoEnhanceBefore = null;
    params.curve = d.curve;
    params.hsl = d.hsl;
    params.colorGrade = d.colorGrade;
    params.logWheels = d.logWheels;
    params.effects = d.effects;
    params.gradation = d.gradation;
    params.gradations = d.gradations;
    params.qualifier = d.qualifier;
    params.tonemap = d.tonemap;
    params.lut = d.lut;
    params.blend = d.blend;
    selectedBlendId.value = null;
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

  /** 会话条切换：当前编辑暂存到条目，目标图重新解码并恢复其参数 */
  async function openSessionImage(index: number): Promise<void> {
    const target = sessionImages.value[index];
    if (!target || target.path === imagePath.value) return;
    const curIdx = sessionImages.value.findIndex((x) => x.path === imagePath.value);
    if (curIdx >= 0) sessionImages.value[curIdx].params = cloneParams(params);
    const savedParams = target.params;
    await loadImageObject(target.path, target.name, target.buffer.slice(0));
    if (savedParams) {
      const p = ensureParams(savedParams as Partial<EditParams>);
      restoreParams(p);
      selectedBlendId.value = null;
      await syncLutFromParams();
      scheduleWmPreview();
    }
  }

  function removeSessionImage(index: number): void {
    sessionImages.value.splice(index, 1);
  }

  watch(
    params,
    () => {
      if (hasImage.value) scheduleSessionSave();
    },
    { deep: true }
  );

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
    wmPreviewUrl, wmPreviewStale, registerEditedCapture, registerAnalyzeCapture, scheduleWmPreview,
    setWatermarkEnabled, openCwmStudio, applyCwmResult, clearWatermark, refreshWmPreview,
    // history / mutate
    mutate, saveSnapshot, endScrub, scheduleCommit, undoEdit, redoEdit,
    setShowOriginal, resetView,
    // lut
    selectBuiltin, loadExternalCube, setLutStrength, removeLut, syncLutFromParams,
    // presets / clipboard / copy-paste / lut-export / session / brush
    applyPreset, copyToClipboard, copyEdits, pasteEdits, exportLutCube,
    paintBrushId, brushRadius, brushHardness, setPaintBrush, brushBeginStroke, brushAddPoint, brushEndStroke,
    sessionImages, openSessionImage, removeSessionImage, restoreSession, openRecent, saveSessionNow,
    // geometry
    rotate90, toggleFlipH, toggleFlipV, setCrop, resetCrop, resetGeometryAll, resetAdjust, resetColorAll,
    autoEnhancing, autoEnhanceApplied, applyAutoEnhance, resetAutoEnhance,
    // 多局部蒙版
    selectedGradId, addGradation, removeGradation, duplicateGradation, selectGradation, mutateGrad,
    // 多重图片叠加
    selectedBlendId, selectedBlendLayer, addBlendLayerFromPicker, addBlendLayer, selectBlendLayer,
    mutateBlendLayer, removeBlendLayer, duplicateBlendLayer, moveBlendLayer, toggleBlendLayerVisible,
    setBlendEnabled, setBlendPosition, setBlendMode,
    // picker / split / clip / mode / zoom / export / project
    pickerActive, togglePicker, cancelPicker, applyWhiteBalance,
    qualifierPicker, toggleQualifierPicker, applyQualifierHue,
    splitCompare, splitX, clipWarn, toggleSplitCompare, setSplitX, toggleClipWarn,
    mode, cropAspect, cropGuide, cycleCropGuide, setMode, setCropAspect, zoomBy,
    exportCurrent, saveProjectFile, openProjectFile,
    // image
    openPicker, loadImageObject, switchTo, closeImage,
  };
});
