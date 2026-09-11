<template>
  <div class="switch" :class="{ on: modelValue }" @click="$emit('update:modelValue', !modelValue)"></div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean }>();
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>
