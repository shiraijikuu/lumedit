<template>
  <svg
    class="app-logo"
    :width="size"
    :height="size"
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="applogo-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0A84FF" />
        <stop offset="0.55" stop-color="#5E5CE6" />
        <stop offset="1" stop-color="#BF5AF2" />
      </linearGradient>
      <linearGradient id="applogo-lut" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#34C8FF" />
        <stop offset="0.2" stop-color="#0A84FF" />
        <stop offset="0.42" stop-color="#5E5CE6" />
        <stop offset="0.62" stop-color="#FF375F" />
        <stop offset="0.82" stop-color="#FF9F0A" />
        <stop offset="1" stop-color="#FFD60A" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="1024" height="1024" rx="230" fill="url(#applogo-bg)" />
    <text
      x="512"
      y="508"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="Segoe UI, system-ui, -apple-system, Arial, sans-serif"
      font-size="452"
      font-weight="800"
      letter-spacing="-18"
      fill="#ffffff"
    >LE</text>
    <rect x="266" y="716" width="492" height="42" rx="21" fill="url(#applogo-lut)" opacity="0.96" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 40 });
</script>

<style scoped>
.app-logo {
  display: block;
  border-radius: 22%;
}
</style>
