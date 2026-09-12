<template>
  <div class="toaster" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="item in toasts.list"
        :key="item.id"
        class="toast glass"
        :class="item.kind"
        @click="dismissToast(item.id)"
      >
        <span class="dot"></span>
        <span class="text">{{ item.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useToasts, dismissToast } from '@/stores/toast';

const toasts = useToasts();
</script>

<style scoped>
.toaster {
  position: fixed;
  left: 50%;
  bottom: 44px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 480px;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.5;
  cursor: pointer;
  white-space: pre-line;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #23262d;
}
.toast .dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.toast.info .dot { background: #7db8ff; }
.toast.success .dot { background: #59c98a; }
.toast.error .dot { background: #ff7a76; }
.toast.error { border-color: rgba(255, 122, 118, 0.35); }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.24s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
