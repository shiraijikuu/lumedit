<template>
  <div
    ref="vpRef"
    class="canvas-viewport checkerboard"
    :class="{ grabbing: panning, picking: store.pickerActive }"
    @wheel.prevent="onWheel"
    @pointerdown="onViewportPointerDown"
    @dblclick="store.resetView()"
  >
    <div v-if="store.hasImage && fitRect" class="stage" :style="stageStyle">
      <canvas ref="canvasRef" class="gl-canvas"></canvas>

      <!-- 裁剪层 -->
      <div v-if="isCrop" class="overlay-layer" @pointerdown.self="cropDrawStart">
        <div class="crop-box" :style="cropBoxStyle" @pointerdown.stop="cropMoveStart">
          <div class="crop-guides" :data-mode="store.cropGuide">
            <i v-for="n in guideV" :key="'v' + n" class="gv" :style="{ left: `${(n / (guideV + 1)) * 100}%` }"></i>
            <i v-for="n in guideH" :key="'h' + n" class="gh" :style="{ top: `${(n / (guideH + 1)) * 100}%` }"></i>
            <template v-if="store.cropGuide === 'golden'">
              <i class="gv golden" style="left: 38.2%"></i>
              <i class="gv golden" style="left: 61.8%"></i>
              <i class="gh golden" style="top: 38.2%"></i>
              <i class="gh golden" style="top: 61.8%"></i>
            </template>
          </div>
          <span
            v-for="h in HANDLES"
            :key="h"
            class="crop-handle"
            :class="h"
            @pointerdown.stop="cropHandleStart($event, h)"
          ></span>
        </div>
      </div>

      <!-- camera-watermark 整图水印层（覆盖在调色结果上，不拦截交互）；
           重建期间 stale，淡出以露出底层实时调色/LUT 画面 -->
      <img
        v-else-if="store.wmPreviewUrl"
        class="wm-overlay"
        :class="{ stale: store.wmPreviewStale }"
        :src="store.wmPreviewUrl ?? ''"
        alt=""
        draggable="false"
        @load="onWmPreviewLoad"
      />

      <!-- 剪裁警告蒙版（高光红 / 阴影蓝） -->
      <canvas v-if="store.clipWarn && !isCrop" ref="clipCanvasRef" class="clip-overlay"></canvas>

      <!-- 分屏对比分割线（可拖动） -->
      <div
        v-if="store.splitCompare && !isCrop"
        class="split-divider"
        :style="{ left: `${store.splitX * 100}%` }"
        @pointerdown.stop="splitDragStart"
      >
        <span class="split-knob">↔</span>
      </div>
    </div>

    <!-- 裁剪确认条 -->
    <div v-if="isCrop" class="crop-toolbar glass fade-in">
      <button class="ghost" @click="store.cycleCropGuide()">{{ t('canvas.guide') }}：{{ t(`canvas.${store.cropGuide}`) }}</button>
      <span class="crop-tip">{{ t('canvas.cropTip') }}</span>
      <button class="ghost" @click="cancelCrop">{{ t('canvas.cancelCrop') }}</button>
      <button class="primary" @click="applyCrop">{{ t('canvas.applyCrop') }}</button>
    </div>

    <!-- 原图对比提示 -->
    <div v-if="store.showOriginal && store.hasImage" class="compare-badge glass">{{ t('canvas.original') }}</div>

    <!-- 白平衡吸管提示 -->
    <div v-if="store.pickerActive && store.hasImage" class="compare-badge glass">{{ t('canvas.pickerTip') }}</div>

    <!-- 空状态 -->
    <div v-if="!store.hasImage" class="empty-state">
      <AppLogo :size="76" class="empty-logo" />
      <p class="empty-title">{{ t('canvas.title') }}</p>
      <p class="empty-sub">{{ t('canvas.empty1') }}</p>
      <p class="empty-sub">{{ t('canvas.empty2') }}</p>
    </div>

    <!-- WebGL2 不支持 -->
    <div v-if="webglFailed" class="empty-state">
      <p class="empty-title">{{ t('canvas.webglFail') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import { ImageRenderer } from '@/core/render/ImageRenderer';
import { createEditStageBundle } from '@/core/render/editStages';
import { PassthroughStage } from '@/core/render/stages/PassthroughStage';
import AppLogo from '@/components/ui/AppLogo.vue';
import type { EditParams } from '@/types/EditParams';

const store = useEditorStore();

const vpRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const webglFailed = ref(false);
const panning = ref(false);

let renderer: ImageRenderer | null = null;
const passthrough = new PassthroughStage();
// 统一按档位组装编辑管线（几何→影调→曲线→[二档]→LUT），预览/导出同源
const editBundle = createEditStageBundle();
const lutStage = editBundle.lut;

const clipCanvasRef = ref<HTMLCanvasElement | null>(null);
let clipTimer: number | null = null;
const viewportSize = reactive({ w: 0, h: 0 });
const stageBaseSize = reactive({ w: 0, h: 0 });
// camera-watermark 预览整图的自然尺寸（画框/模糊卡片可能改变输出比例）
const wmNatural = reactive({ w: 0, h: 0 });
let resizeObserver: ResizeObserver | null = null;

const isCrop = computed(() => store.mode === 'crop');
// 裁剪参考线：三分(2+2) / 网格(3+3) / 黄金比例(独立) / 关闭
const guideV = computed(() => (store.cropGuide === 'grid' ? 3 : store.cropGuide === 'thirds' ? 2 : 0));
const guideH = computed(() => guideV.value);
// 舞台比例只要存在水印整图就按其走（含重建期间，避免尺寸跳变）；显隐由 CSS 透明度控制
const wmShow = computed(
  () => !!store.params.watermark?.enabled && !!store.wmPreviewUrl
);

function onWmPreviewLoad(e: Event): void {
  const img = e.target as HTMLImageElement;
  wmNatural.w = img.naturalWidth;
  wmNatural.h = img.naturalHeight;
  refreshStageSize();
}

// fit contain 矩形（CSS 像素，相对 viewport）
const fitRect = computed(() => {
  if (!viewportSize.w || !stageBaseSize.w) return null;
  const { w: vw, h: vh } = viewportSize;
  const pad = 48;
  const aw = vw - pad * 2;
  const ah = vh - pad * 2;
  const scale = Math.min(aw / stageBaseSize.w, ah / stageBaseSize.h);
  const w = stageBaseSize.w * scale;
  const h = stageBaseSize.h * scale;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h, scale };
});

const stageStyle = computed(() => {
  const r = fitRect.value;
  if (!r) return {};
  const v = store.view;
  return {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    transform: `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`,
  };
});

function refreshStageSize(): void {
  if (!renderer) return;
  // 启用水印且已有整图预览时，舞台按水印整图比例（画框/模糊可能改变构图）
  if (wmShow.value && wmNatural.w > 0) {
    stageBaseSize.w = wmNatural.w;
    stageBaseSize.h = wmNatural.h;
  } else {
    const size = isCrop.value ? renderer.getInputSize() : renderer.getOutputSize();
    if (size.width > 0) {
      stageBaseSize.w = size.width;
      stageBaseSize.h = size.height;
    }
  }
  nextTick(() => renderer?.resize());
}

function applyStages(): void {
  if (!renderer) return;
  // 水印不在 WebGL 管线内：camera-watermark 整图在主线程离屏合成后以 overlay 叠加
  if (isCrop.value) {
    renderer.setStages([passthrough]);
  } else {
    renderer.setStages(editBundle.ordered);
  }
  renderer.setParams(store.params);
  feedLut();
  refreshStageSize();
}

function feedLut(): void {
  const gl = renderer?.getGLContext();
  if (!gl) return;
  lutStage.setLut(gl, store.lutData);
  // 纹理替换本身不触发渲染，必须让管线带着新 3D 纹理重绘一次
  renderer?.setParams(store.params);
}

// ---------- 分屏对比 / 剪裁警告 ----------
function splitDragStart(e: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const move = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    store.setSplitX((ev.clientX - r.left) / r.width);
    renderer?.setSplit(true, store.splitX);
    renderer?.repaint();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  move(e);
}

watch(
  () => store.splitCompare,
  (v) => {
    renderer?.setSplit(v, store.splitX);
    renderer?.repaint();
  }
);
watch(
  () => store.splitX,
  (x) => {
    renderer?.setSplit(store.splitCompare, x);
    renderer?.repaint();
  }
);
watch(
  () => store.clipWarn,
  (on) => {
    if (clipTimer !== null) {
      window.clearInterval(clipTimer);
      clipTimer = null;
    }
    if (on) {
      const refresh = () => {
        if (clipCanvasRef.value && renderer) renderer.renderClipMask(clipCanvasRef.value);
      };
      refresh();
      clipTimer = window.setInterval(refresh, 500);
    }
  }
);

// ---------- 缩放 / 平移 ----------
// 与 camera-watermark 完全一致：以鼠标指针为不动点缩放（transform-origin 为舞台中心）
const MIN_SCALE = 0.1;
const MAX_SCALE = 16;

function onWheel(e: WheelEvent): void {
  if (!store.hasImage) return;
  const vp = vpRef.value;
  if (!vp) return;
  const v = store.view;
  const old = v.scale;
  // 步进对齐 camera-watermark：上滚 ×1.1，下滚 ×0.9
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, old * (e.deltaY < 0 ? 1.1 : 0.9)));
  if (next === old) return;
  const r = fitRect.value;
  if (!r) return;
  const viewRect = vp.getBoundingClientRect();
  // 指针相对「舞台未缩放中心」的偏移
  const sx = e.clientX - viewRect.left - (r.x + r.w / 2);
  const sy = e.clientY - viewRect.top - (r.y + r.h / 2);
  const k = next / old;
  // 保持指针下的内容点不动：pan = s - k*(s - pan)
  v.tx = sx - k * (sx - v.tx);
  v.ty = sy - k * (sy - v.ty);
  v.scale = next;
}

function onViewportPointerDown(e: PointerEvent): void {
  if (e.button === 2) return;
  // 白平衡吸管：点击取样，不触发平移
  if (store.pickerActive) {
    if (isCrop.value) {
      store.cancelPicker();
      return;
    }
    const canvas = canvasRef.value;
    if (canvas && renderer) {
      const rect = canvas.getBoundingClientRect();
      const scale = store.view.scale || 1;
      // rect 含舞台 CSS transform scale，换回布局坐标再映射纹理
      const c = renderer.pickColor((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
      if (c) store.applyWhiteBalance(c.r, c.g, c.b);
    }
    return;
  }
  if (isCrop.value) return;
  const vp = vpRef.value;
  if (!vp) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const origTx = store.view.tx;
  const origTy = store.view.ty;
  panning.value = true;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  const move = (ev: PointerEvent) => {
    store.view.tx = origTx + ev.clientX - startX;
    store.view.ty = origTy + ev.clientY - startY;
  };
  const up = () => {
    panning.value = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ---------- 裁剪 ----------
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type HandleName = (typeof HANDLES)[number];
const cropDraft = reactive({ x: 0, y: 0, w: 1, h: 1 });
let cropDrag:
  | { kind: 'draw' | 'move' | 'handle'; handle?: HandleName; sx: number; sy: number; orig: typeof cropDraft }
  | null = null;

const cropBoxStyle = computed(() => ({
  left: `${cropDraft.x * 100}%`,
  top: `${cropDraft.y * 100}%`,
  width: `${cropDraft.w * 100}%`,
  height: `${cropDraft.h * 100}%`,
}));

function stageNorm(e: PointerEvent): { x: number; y: number } {
  const el = canvasRef.value;
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}

function startCropDrag(e: PointerEvent, kind: 'draw' | 'move' | 'handle', handle?: HandleName): void {
  const p = stageNorm(e);
  cropDrag = { kind, handle, sx: p.x, sy: p.y, orig: { ...cropDraft } };
  const move = (ev: PointerEvent) => onCropDrag(ev);
  const up = () => {
    cropDrag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
function cropDrawStart(e: PointerEvent): void {
  const p = stageNorm(e);
  Object.assign(cropDraft, { x: p.x, y: p.y, w: 0.001, h: 0.001 });
  startCropDrag(e, 'draw');
}
function cropMoveStart(e: PointerEvent): void {
  startCropDrag(e, 'move');
}
function cropHandleStart(e: PointerEvent, h: HandleName): void {
  startCropDrag(e, 'handle', h);
}

function constrainAspect(d: { x: number; y: number; w: number; h: number }): void {
  const a = store.cropAspect;
  if (!a || !stageBaseSize.w) return;
  // 归一化坐标下的屏幕宽高比换算
  const target = a * (stageBaseSize.h / stageBaseSize.w);
  d.h = d.w / target;
}

/** 计算指定比例下、居中且尽量大的裁剪框（归一化，左上原点） */
function centeredLargestBox(): { x: number; y: number; w: number; h: number } {
  const a = store.cropAspect;
  if (!a || !stageBaseSize.w) return { x: 0, y: 0, w: 1, h: 1 };
  // 归一化框的 宽/高 = 目标比例 × (图高/图宽)
  const normWH = a * (stageBaseSize.h / stageBaseSize.w);
  let w: number;
  let h: number;
  if (normWH >= 1) { w = 1; h = 1 / normWH; } else { h = 1; w = normWH; }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function onCropDrag(e: PointerEvent): void {
  if (!cropDrag) return;
  const p = stageNorm(e);
  const o = cropDrag.orig;
  const d = { ...cropDraft };
  if (cropDrag.kind === 'draw') {
    d.x = Math.min(cropDrag.sx, p.x);
    d.y = Math.min(cropDrag.sy, p.y);
    d.w = Math.abs(p.x - cropDrag.sx);
    d.h = Math.abs(p.y - cropDrag.sy);
    constrainAspect(d);
  } else if (cropDrag.kind === 'move') {
    let nx = o.x + (p.x - cropDrag.sx);
    let ny = o.y + (p.y - cropDrag.sy);
    nx = Math.min(1 - o.w, Math.max(0, nx));
    ny = Math.min(1 - o.h, Math.max(0, ny));
    d.x = nx;
    d.y = ny;
  } else {
    const h = cropDrag.handle!;
    let { x, y, w, h: hh } = o;
    const dx = p.x - cropDrag.sx;
    const dy = p.y - cropDrag.sy;
    if (h.includes('w')) { x = o.x + dx; w = o.w - dx; }
    if (h.includes('e')) { w = o.w + dx; }
    if (h.includes('n')) { y = o.y + dy; hh = o.h - dy; }
    if (h.includes('s')) { hh = o.h + dy; }
    // 翻转保护
    if (w <= 0.005) { w = 0.005; if (h.includes('w')) x = o.x + o.w - 0.005; }
    if (hh <= 0.005) { hh = 0.005; if (h.includes('n')) y = o.y + o.h - 0.005; }
    d.x = x; d.y = y; d.w = w; d.h = hh;
  }
  Object.assign(cropDraft, d);
}

function applyCrop(): void {
  if (cropDraft.w < 0.02 || cropDraft.h < 0.02) {
    store.setMode('edit');
    return;
  }
  store.mutate((p: EditParams) => {
    p.geometry.x = cropDraft.x;
    p.geometry.y = cropDraft.y;
    p.geometry.width = cropDraft.w;
    p.geometry.height = cropDraft.h;
  });
  store.setMode('edit');
}
function cancelCrop(): void {
  store.setMode('edit');
}

// ---------- 生命周期 / watch ----------
function onKey(e: KeyboardEvent): void {
  if (store.pickerActive && e.key === 'Escape') {
    store.cancelPicker();
    return;
  }
  if (!isCrop.value) return;
  if (e.key === 'Escape') cancelCrop();
  if (e.key === 'Enter') applyCrop();
}

// canvas 受 v-if="hasImage && fitRect" 控制，首帧无图时并不存在；
// 因此 renderer 必须在 canvas 真正挂载后懒初始化，否则用户首次打开图片画布会空白
function ensureRenderer(): boolean {
  if (renderer) return true;
  if (!ImageRenderer.isSupported()) {
    webglFailed.value = true;
    return false;
  }
  if (!canvasRef.value) return false;
  try {
    renderer = new ImageRenderer(canvasRef.value);
  } catch (err) {
    console.error(err);
    webglFailed.value = true;
    return false;
  }
  renderer.onRestored(() => {
    applyStages();
  });
  // 供水印工作室 / 离屏合成获取「调色后无水印」底图
  store.registerEditedCapture(() => renderer?.captureEdited(2000) ?? '');
  applyStages();
  feedLut();
  renderer.setParams(store.params);
  renderer.setCompareOriginal(store.showOriginal);
  return true;
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (!vpRef.value) return;
    viewportSize.w = vpRef.value.clientWidth;
    viewportSize.h = vpRef.value.clientHeight;
    nextTick(() => renderer?.resize());
  });
  if (vpRef.value) resizeObserver.observe(vpRef.value);
  window.addEventListener('keydown', onKey);
  void nextTick(() => ensureRenderer());
});

onUnmounted(() => {
  if (clipTimer !== null) window.clearInterval(clipTimer);
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKey);
  store.registerEditedCapture(null);
  renderer?.destroy();
  renderer = null;
  editBundle.dispose();
});

// 输入图切换：克隆一份 bitmap 给 renderer（renderer 销毁纹理时会 close）
watch(
  () => store.previewBitmap,
  async (bmp) => {
    if (!bmp) return;
    // 先用预览位图尺寸解锁 fitRect（否则 canvas 的 v-if 不渲染、renderer 无法创建，形成死锁）
    stageBaseSize.w = bmp.width;
    stageBaseSize.h = bmp.height;
    // 等 v-if 的 canvas 完成挂载，再懒创建 renderer
    await nextTick();
    if (!ensureRenderer()) return;
    const clone = await createImageBitmap(bmp);
    renderer?.setInputImage(clone);
    refreshStageSize();
  }
);

watch(
  () => store.params,
  () => {
    renderer?.setParams(store.params);
    refreshStageSize();
    // 调色/几何/LUT 变化后，防抖让 camera-watermark 按新底图重建水印预览
    if (store.params.watermark?.enabled) store.scheduleWmPreview();
  },
  { deep: true }
);

// 水印整图预览替换时（应用工作室 / 离屏重建完成）刷新舞台比例
watch(
  () => store.wmPreviewUrl,
  (url) => {
    if (!url) {
      wmNatural.w = 0;
      wmNatural.h = 0;
      refreshStageSize();
    }
  }
);

// LUT 异步加载/替换到位后：先把 3D 纹理上传并重绘，再按新底图重建水印整图预览。
// 关键：内置 LUT 首次为动态 import，可能晚于 params deep watch 的 500ms 防抖，
// 必须在 LUT 真正上屏后再 schedule 一次，否则水印图会停留在「无 LUT 底图」上。
watch(
  () => [store.lutVersion, store.lutData] as const,
  () => {
    feedLut();
    if (store.params.watermark?.enabled) store.scheduleWmPreview();
  }
);
watch(
  () => store.showOriginal,
  (v) => renderer?.setCompareOriginal(v)
);
watch(
  () => store.mode,
  () => {
    if (isCrop.value) {
      // 固定比例下直接给居中最大框做实时预览；自由模式沿用当前裁剪几何
      const box = store.cropAspect
        ? centeredLargestBox()
        : {
            x: store.params.geometry.x,
            y: store.params.geometry.y,
            w: store.params.geometry.width,
            h: store.params.geometry.height,
          };
      Object.assign(cropDraft, box);
    }
    applyStages();
  }
);
// 已在裁剪中切换比例：立即刷新为该比例的居中最大框
watch(
  () => store.cropAspect,
  () => {
    if (isCrop.value) Object.assign(cropDraft, centeredLargestBox());
  }
);
</script>

<style scoped>
.canvas-viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.canvas-viewport.grabbing {
  cursor: grabbing;
}
.canvas-viewport.picking {
  cursor: crosshair;
}
.stage {
  position: absolute;
  transform-origin: center center;
  /* 不做补间：滚轮/拖拽需逐帧跟手，补间会产生黏滞和锚点漂移 */
  box-shadow: 0 12px 60px rgba(0, 0, 0, 0.6);
}
.gl-canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 2px;
}
.clip-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.crop-guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.crop-guides .gv {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.45);
}
.crop-guides .gh {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.45);
}
.crop-guides .golden {
  background: rgba(255, 214, 120, 0.6);
}
.split-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #fff;
  cursor: ew-resize;
  z-index: 5;
}
.split-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  color: #111;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
.overlay-layer {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}
.crop-box {
  position: absolute;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  cursor: move;
}
.crop-handle {
  position: absolute;
  width: 11px;
  height: 11px;
  background: #fff;
  border: 1.5px solid var(--accent);
  border-radius: 50%;
}
.crop-handle.nw { left: -6px; top: -6px; cursor: nwse-resize; }
.crop-handle.n { left: calc(50% - 6px); top: -6px; cursor: ns-resize; }
.crop-handle.ne { right: -6px; top: -6px; cursor: nesw-resize; }
.crop-handle.e { right: -6px; top: calc(50% - 6px); cursor: ew-resize; }
.crop-handle.se { right: -6px; bottom: -6px; cursor: nwse-resize; }
.crop-handle.s { left: calc(50% - 6px); bottom: -6px; cursor: ns-resize; }
.crop-handle.sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
.crop-handle.w { left: -6px; top: calc(50% - 6px); cursor: ew-resize; }

.wm-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  user-select: none;
  opacity: 1;
  transition: opacity 0.18s ease;
}
.wm-overlay.stale {
  opacity: 0;
}

.crop-toolbar {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
}
.crop-tip {
  color: var(--txt-1);
  font-size: 12px;
  margin-right: 4px;
}
.compare-badge {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  border: 1px solid var(--line);
  letter-spacing: 2px;
}
.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--txt-2);
  pointer-events: none;
}
.empty-logo {
  width: 76px;
  height: 76px;
  border-radius: 17px;
  margin-bottom: 14px;
  box-shadow: 0 10px 30px rgba(10, 132, 255, 0.35);
}
.empty-title {
  font-size: 14px;
  color: var(--txt-1);
}
.empty-sub {
  font-size: 12px;
}
</style>
