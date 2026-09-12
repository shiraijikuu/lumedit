<template>
  <div class="collapse-section" :class="{ open }">
    <button type="button" class="collapse-head" @click="open = !open">
      <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="collapse-title"><slot name="title">{{ title }}</slot></span>
      <span class="collapse-actions" @pointerdown.stop @click.stop>
        <slot name="actions" />
      </span>
    </button>
    <div v-show="open" class="collapse-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ title?: string; defaultOpen?: boolean }>();
const open = ref(props.defaultOpen ?? true);
</script>

<style scoped>
.collapse-section {
  border-bottom: 1px solid var(--line);
}
.collapse-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: 0;
  text-align: left;
  box-shadow: none;
}
.collapse-head:hover {
  background: rgba(255, 255, 255, 0.03);
}
.collapse-head:active {
  transform: none;
}
.chevron {
  width: 11px;
  height: 11px;
  color: var(--txt-2);
  transition: transform 0.18s var(--ease);
  flex: none;
}
.collapse-section:not(.open) .chevron {
  transform: rotate(-90deg);
}
.collapse-title {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--txt-2);
}
.collapse-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.collapse-body {
  padding: 2px 16px 14px;
}
</style>
