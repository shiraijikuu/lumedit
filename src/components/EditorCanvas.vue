<template>
  <div
    ref="vpRef"
    class="canvas-viewport checkerboard"
    :class="{ grabbing: panning, picking: store.pickerActive || store.qualifierPicker || !!store.paintBrushId }"
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
           只在水印确实启用且有预览图时存在，重建期间 stale 淡出露出底层实时画面。
           注意：必须用 wmShow（enabled && url），不能只看 url——撤销/重做/加载工程可能
           让水印关闭却残留旧 url，若仍渲染会以不透明整图永久盖住 GL，表现为“调任何参数都无效” -->
      <img
        v-else-if="wmShow"
        class="wm-overlay"
        :class="{ stale: store.wmPreviewStale }"
        :src="store.wmPreviewUrl ?? ''"
        alt=""
        draggable="false"
        @load="onWmPreviewLoad"
      />

      <!-- 局部渐变蒙版叠加（多蒙版）：PS 式箭头线，选中项可拖动位置/方向/范围 -->
      <svg
        v-if="gradOverlays.length && !isCrop"
        class="grad-overlay"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <g v-for="o in gradOverlays" :key="o.id" class="grad-group" :class="{ selected: o.selected }">
          <template v-if="!o.radial">
            <line
              :x1="o.x1" :y1="o.y1" :x2="o.x2" :y2="o.y2"
              class="grad-hit"
              @pointerdown.stop="gradMoveStart(o.id, $event)"
            />
            <line
              :x1="o.x1" :y1="o.y1" :x2="o.x2" :y2="o.y2"
              class="grad-line"
            />
            <polygon v-if="o.selected" :points="arrowOf(o)" class="grad-arrow" />
          </template>
          <ellipse
            v-else
            :cx="o.x1" :cy="o.y1" :rx="o.r" :ry="o.r"
            class="grad-ellipse"
            @pointerdown.stop="gradMoveStart(o.id, $event)"
          />
          <span
            v-if="o.selected"
            class="grad-handle"
            :style="{ left: o.x1 + '%', top: o.y1 + '%' }"
            @pointerdown.stop="gradEndStart(o.id, 'p1', $event)"
          ></span>
          <span
            v-if="o.selected"
            class="grad-handle"
            :style="{ left: o.x2 + '%', top: o.y2 + '%' }"
            @pointerdown.stop="gradEndStart(o.id, 'p2', $event)"
          ></span>
        </g>
      </svg>

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

    <!-- 取色限定器吸管提示 -->
    <div v-if="store.qualifierPicker && store.hasImage" class="compare-badge glass">{{ t('qualifier.pickerTip') }}</div>

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
import { loadLayerBitmap } from '@/core/blend/layerImages';
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
const blendStage = editBundle.blend;
// 已喂入纹理的叠加图层 id（参数层增删/换图时据此增量同步）
const fedBlendIds = new Set<string>();
const fedBlendPaths = new Map<string, string | null>();
// 每个图层的加载代次与正在加载的路径：参数抖动不会无意义地取消同一个图层加载，换图时旧结果会被丢弃
const blendLoadGeneration = new Map<string, number>();
const blendPendingPaths = new Map<string, string | null>();
// 上下文恢复纪元：避免丢失上下文时未完成的旧加载把纹理上传到失效 GL。
let blendEpoch = 0;
// 读取失败的图层 id -> 上次失败时间戳：不永久标记为“已喂”，允许 3s 后自愈重试
const blendFeedFailAt = new Map<string, number>();

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
  // 水印不在 WebGL 管线内：camera-watermark 整图在主线程离屏合成后以 overlay 叠加；
  // 多重叠加 blend 在 GL 管线内，按其 position 决定相对 LUT 的位置。
  if (isCrop.value) {
    renderer.setStages([passthrough]);
  } else {
    const pos = store.params.blend?.position ?? 'after-lut';
    renderer.setStages(editBundle.orderedFor(pos));
  }
  renderer.setParams(store.params);
  feedLut();
  void feedBlendLayers();
  refreshStageSize();
}

// 增量同步叠加图层位图到 BlendStage：新增/换图则读文件上传，删除则移除纹理
async function feedBlendLayers(): Promise<void> {
  const gl = renderer?.getGLContext();
  if (!gl) return;
  const epoch = blendEpoch;
  const layers = store.params.blend?.layers ?? [];
  const live = new Set(layers.map((l) => l.id));

  // 移除已删除图层，并用当前上下文释放纹理。
  for (const id of [...fedBlendIds]) {
    if (!live.has(id)) {
      blendStage.removeLayer(id, gl);
      fedBlendIds.delete(id);
      fedBlendPaths.delete(id);
      blendFeedFailAt.delete(id);
      blendPendingPaths.delete(id);
      blendLoadGeneration.delete(id);
    }
  }

  for (const layer of layers) {
    if (!layer.imagePath) {
      if (fedBlendIds.has(layer.id)) {
        blendStage.removeLayer(layer.id, gl);
        fedBlendIds.delete(layer.id);
        fedBlendPaths.delete(layer.id);
        blendPendingPaths.delete(layer.id);
        blendLoadGeneration.delete(layer.id);
      }
      continue;
    }
    // 同一 id 换图时先释放旧纹理，避免新图加载失败时预览继续显示旧图。
    if (fedBlendIds.has(layer.id) && fedBlendPaths.get(layer.id) !== layer.imagePath) {
      blendStage.removeLayer(layer.id, gl);
      fedBlendIds.delete(layer.id);
      fedBlendPaths.delete(layer.id);
    }
    if (fedBlendIds.has(layer.id) && fedBlendPaths.get(layer.id) === layer.imagePath) continue;
    if (blendPendingPaths.get(layer.id) === layer.imagePath) continue;

    // 失败节流：3s 内不重复读同一坏路径，避免每次参数变化都刷 IPC / 报错。
    const failAt = blendFeedFailAt.get(layer.id);
    if (failAt && Date.now() - failAt < 3000) continue;

    const generation = (blendLoadGeneration.get(layer.id) ?? 0) + 1;
    blendLoadGeneration.set(layer.id, generation);
    blendPendingPaths.set(layer.id, layer.imagePath);
    let bmp: ImageBitmap | null = null;
    try {
      bmp = await loadLayerBitmap(layer.imagePath);
      // 同一图层或 GL 上下文的旧加载结果：关闭位图并丢弃，不能让过期协程覆盖新图。
      if (epoch !== blendEpoch || blendLoadGeneration.get(layer.id) !== generation) {
        bmp.close();
        bmp = null;
        continue;
      }
      const still = store.params.blend?.layers.find((l) => l.id === layer.id);
      if (!still || still.imagePath !== layer.imagePath) {
        bmp.close();
        bmp = null;
        continue;
      }
      blendStage.setLayerBitmap(layer.id, gl, bmp);
      fedBlendIds.add(layer.id);
      fedBlendPaths.set(layer.id, layer.imagePath);
      blendFeedFailAt.delete(layer.id);
      bmp.close();
      bmp = null;
      renderer?.setParams(store.params);
    } catch (err) {
      if (bmp) {
        bmp.close();
        bmp = null;
      }
      // 失败绝不能标记为“已喂”；下次参数变化或 3s 后会重试。
      blendFeedFailAt.set(layer.id, Date.now());
      console.warn('[blend] 叠加图层加载失败，稍后自动重试:', layer.imagePath, err);
    } finally {
      if (blendPendingPaths.get(layer.id) === layer.imagePath) {
        blendPendingPaths.delete(layer.id);
      }
    }
  }
}

function feedLut(): void {
  const gl = renderer?.getGLContext();
  if (!gl) return;
  lutStage.setLut(gl, store.lutData);
  // 纹理替换本身不触发渲染，必须让管线带着新 3D 纹理重绘一次
  renderer?.setParams(store.params);
}

// ---------- 局部渐变蒙版叠加（多蒙版，PS 式箭头线） ----------
interface GradOverlay {
  id: string;
  x1: number; y1: number; x2: number; y2: number;
  radial: boolean; r: number; selected: boolean;
}
const gradOverlays = computed<GradOverlay[]>(() => {
  if (isCrop.value) return [];
  const items = store.params.gradations
    .filter((g) => g.enabled && (g.type === 'linear' || g.type === 'radial'))
    .map((g) => ({
      id: g.id,
      x1: g.x1 * 100,
      y1: g.y1 * 100,
      x2: g.x2 * 100,
      y2: g.y2 * 100,
      radial: g.type === 'radial',
      r: Math.hypot(g.x2 - g.x1, g.y2 - g.y1) * 100,
      selected: store.selectedGradId === g.id,
    }));
  // 选中项最后绘制，保证重叠蒙版时拖拽命中当前选中的蒙版。
  return items.sort((a, b) => Number(a.selected) - Number(b.selected));
});

function arrowOf(o: GradOverlay): string {
  if (o.radial) return '';
  const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
  const back = ang + Math.PI;
  const wing = 0.42;
  const len = 4.2;
  const p1 = `${o.x2 + Math.cos(back - wing) * len},${o.y2 + Math.sin(back - wing) * len}`;
  const p2 = `${o.x2 + Math.cos(back + wing) * len},${o.y2 + Math.sin(back + wing) * len}`;
  return `${o.x2},${o.y2} ${p1} ${p2}`;
}

/**
 * 拖动状态：记录被拖蒙版 id、模式、按下时指针比例坐标与两端点原值。
 * 端点拖拽 = 端点直接跟随指针（天然对称，向哪个方向都能拖到边界）。
 */
let gradDrag: {
  id: string;
  mode: 'move' | 'p1' | 'p2';
  fx: number;
  fy: number;
  ox1: number;
  oy1: number;
  ox2: number;
  oy2: number;
} | null = null;

function gradClamp(v: number): number {
  return Math.min(1.5, Math.max(-0.5, v));
}

function gradDragMove(e: PointerEvent): void {
  if (!gradDrag) return;
  const g = store.params.gradations.find((x) => x.id === gradDrag!.id);
  if (!g) return;
  const p = stageNorm(e);
  const dx = p.x - gradDrag.fx;
  const dy = p.y - gradDrag.fy;
  if (gradDrag.mode === 'move') {
    g.x1 = gradClamp(gradDrag.ox1 + dx);
    g.y1 = gradClamp(gradDrag.oy1 + dy);
    g.x2 = gradClamp(gradDrag.ox2 + dx);
    g.y2 = gradClamp(gradDrag.oy2 + dy);
  } else if (gradDrag.mode === 'p1') {
    g.x1 = gradClamp(p.x);
    g.y1 = gradClamp(p.y);
  } else {
    g.x2 = gradClamp(p.x);
    g.y2 = gradClamp(p.y);
  }
}

function gradDragUp(): void {
  if (!gradDrag) return;
  gradDrag = null;
  store.endScrub();
}

/** 拖动整条线：平移两端点（同时选中该蒙版） */
function gradMoveStart(id: string, e: PointerEvent): void {
  const g = store.params.gradations.find((x) => x.id === id);
  if (!g) return;
  store.selectGradation(id);
  const p = stageNorm(e);
  gradDrag = { id, mode: 'move', fx: p.x, fy: p.y, ox1: g.x1, oy1: g.y1, ox2: g.x2, oy2: g.y2 };
  store.mutate(() => {}, true);
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
}

/** 拖动端点：该端点直接跟随指针 */
function gradEndStart(id: string, which: 'p1' | 'p2', e: PointerEvent): void {
  const g = store.params.gradations.find((x) => x.id === id);
  if (!g) return;
  store.selectGradation(id);
  const p = stageNorm(e);
  gradDrag = { id, mode: which, fx: p.x, fy: p.y, ox1: g.x1, oy1: g.y1, ox2: g.x2, oy2: g.y2 };
  store.mutate(() => {}, true);
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
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
  // 画笔蒙版：在画布上按住拖动，按一次笔画进入撤销栈
  if (store.paintBrushId) {
    e.preventDefault();
    const id = store.paintBrushId;
    const p = stageNorm(e);
    store.brushBeginStroke(id, p.x, p.y);
    const move = (ev: PointerEvent) => {
      const q = stageNorm(ev);
      store.brushAddPoint(id, q.x, q.y);
    };
    const up = () => {
      store.brushEndStroke();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return;
  }
  // 吸管取样（白平衡 / 取色限定器）：点击取样，不触发平移
  if (store.pickerActive || store.qualifierPicker) {
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
      if (c) {
        if (store.pickerActive) store.applyWhiteBalance(c.r, c.g, c.b);
        else store.applyQualifierHue(c.r, c.g, c.b);
      }
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
  if ((store.pickerActive || store.qualifierPicker) && e.key === 'Escape') {
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
    // 上下文丢失时 BlendStage 已释放纹理；清空喂入缓存，恢复后必须重新上传全部图层。
    blendEpoch += 1;
    fedBlendIds.clear();
    fedBlendPaths.clear();
    blendLoadGeneration.clear();
    blendPendingPaths.clear();
    blendFeedFailAt.clear();
    applyStages();
  });
  // 供水印工作室 / 离屏合成获取「调色后无水印」底图
  store.registerEditedCapture(() => renderer?.captureEdited(2000) ?? '');
  // 自动优化分析当前预览纹理
  store.registerAnalyzeCapture(() => renderer?.analyzeImage() ?? Promise.reject(new Error('renderer not ready')));
  applyStages();
  feedLut();
  renderer.setParams(store.params);
  renderer.setCompareOriginal(store.showOriginal);
  return true;
}

onMounted(() => {
  window.addEventListener('pointermove', gradDragMove);
  window.addEventListener('pointerup', gradDragUp);
  window.addEventListener('pointercancel', gradDragUp);
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
  window.removeEventListener('pointermove', gradDragMove);
  window.removeEventListener('pointerup', gradDragUp);
  window.removeEventListener('pointercancel', gradDragUp);
  if (clipTimer !== null) window.clearInterval(clipTimer);
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKey);
  store.registerEditedCapture(null);
  store.registerAnalyzeCapture(null);
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
    // 新增叠加图层时增量喂入位图（内部按 id 去重，已喂入则空转）
    void feedBlendLayers();
    // 调色/几何/LUT 变化后，防抖让 camera-watermark 按新底图重建水印预览
    if (store.params.watermark?.enabled) store.scheduleWmPreview();
  },
  { deep: true }
);

// 叠加层相对 LUT 的位置变化：重组管线顺序
watch(
  () => store.params.blend?.position,
  () => {
    if (!isCrop.value) applyStages();
  }
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
.grad-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: move;
  pointer-events: none;
}
.grad-overlay .grad-hit {
  stroke: transparent;
  stroke-width: 18;
  vector-effect: non-scaling-stroke;
  pointer-events: stroke;
}
.grad-overlay .grad-line {
  pointer-events: none;
  stroke: var(--accent, #4da3ff);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.grad-overlay .grad-line-dim {
  opacity: 0.45;
  stroke-dasharray: 5 4;
}
.grad-overlay .grad-arrow {
  fill: var(--accent, #4da3ff);
}
.grad-overlay .grad-ellipse {
  fill: rgba(0, 0, 0, 0.001);
  stroke: var(--accent, #4da3ff);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 6 4;
  pointer-events: all;
}
.grad-overlay .grad-handle {
  position: absolute;
  pointer-events: auto;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent, #4da3ff);
  transform: translate(-50%, -50%);
  cursor: pointer;
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
