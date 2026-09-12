<template>
  <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
    <div class="exif-modal glass">
      <div class="exif-head">
        <span class="exif-title">{{ t('exif.title') }}</span>
        <button class="ghost mini" @click="$emit('close')">{{ t('common.close') }}</button>
      </div>
      <div class="exif-body">
        <div v-if="!rows.length" class="exif-empty">{{ t('exif.empty') }}</div>
        <div v-for="r in rows" :key="r.k" class="exif-row">
          <span class="k">{{ r.k }}</span>
          <span class="v">{{ r.v }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { readFullExif, type ParsedExif } from '@/core/image/imageLoader';
import { t } from '@/i18n';

const props = defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const store = useEditorStore();
const exif = ref<ParsedExif | null>(null);

watch(
  () => props.open,
  async (v) => {
    exif.value = null;
    if (v && store.sourceBuffer) {
      try {
        exif.value = await readFullExif(store.sourceBuffer.slice(0));
      } catch {
        exif.value = null;
      }
    }
  }
);

function fmtShutter(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1 ? `${n.toFixed(1)}s` : `1/${Math.round(1 / n)}s`;
}
function fmtGps(ex: ParsedExif): string | null {
  const lat = ex['GPSLatitude'];
  const lon = ex['GPSLongitude'];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

const rows = computed<Array<{ k: string; v: string }>>(() => {
  const ex = exif.value;
  const out: Array<{ k: string; v: string }> = [];
  const meta = store.meta;
  if (meta) {
    out.push({ k: t('exif.dimensions'), v: `${meta.origWidth} × ${meta.origHeight}` });
    if (meta.colorSpace !== 'unknown') {
      out.push({ k: t('exif.colorSpace'), v: meta.colorSpace === 'srgb' ? 'sRGB' : 'Adobe RGB' });
    }
  }
  if (ex) {
    const camera = [ex.Make, ex.Model].filter(Boolean).join(' ').trim();
    if (camera) out.push({ k: t('exif.camera'), v: camera });
    if (ex.LensModel) out.push({ k: t('exif.lens'), v: String(ex.LensModel) });
    if (Number.isFinite(Number(ex.FNumber)) && ex.FNumber) {
      out.push({ k: t('exif.aperture'), v: `ƒ/${ex.FNumber}` });
    }
    const shutter = fmtShutter(ex.ExposureTime);
    if (shutter) out.push({ k: t('exif.shutter'), v: shutter });
    if (ex.ISO) out.push({ k: t('exif.iso'), v: String(ex.ISO) });
    if (Number.isFinite(Number(ex.FocalLength)) && ex.FocalLength) {
      out.push({ k: t('exif.focal'), v: `${Math.round(Number(ex.FocalLength))}mm` });
    }
    if (ex.DateTimeOriginal) {
      const d = ex.DateTimeOriginal instanceof Date ? ex.DateTimeOriginal : new Date(String(ex.DateTimeOriginal));
      if (!Number.isNaN(d.getTime())) {
        out.push({ k: t('exif.time'), v: d.toLocaleString() });
      }
    }
    const gps = fmtGps(ex);
    if (gps) out.push({ k: t('exif.gps'), v: gps });
  }
  if (!out.length && meta) {
    out.push({ k: t('exif.dimensions'), v: `${meta.origWidth} × ${meta.origHeight}` });
  }
  return out;
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 900;
}
.exif-modal {
  width: 460px;
  max-width: calc(100vw - 48px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: #1d2026;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.exif-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.exif-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--txt-1);
}
.exif-body {
  padding: 8px 16px 14px;
  overflow-y: auto;
}
.exif-empty {
  color: var(--txt-2);
  font-size: 12px;
  padding: 18px 0;
  text-align: center;
}
.exif-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
  font-size: 12.5px;
}
.exif-row:last-child {
  border-bottom: none;
}
.exif-row .k {
  color: var(--txt-2);
  flex: none;
}
.exif-row .v {
  color: var(--txt-1);
  text-align: right;
  word-break: break-all;
}
</style>
