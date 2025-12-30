<script setup lang="ts">
const props = defineProps<{
  color?: string
}>()
</script>

<template>
  <div
    class="theme-overlay pointer-events-none absolute inset-x-0 top-0 z-1 h-24 lg:h-32"
    :style="{
      background: props.color ? `linear-gradient(to bottom, ${props.color} 0%, transparent 100%)` : undefined,
    }"
  />
</template>
