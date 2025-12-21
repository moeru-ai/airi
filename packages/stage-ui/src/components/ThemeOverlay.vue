<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  color?: string
}>()

const gradientStyle = computed(() => {
  if (!props.color)
    return {}

  // Create a gradient from the theme color to transparent
  // We use the passed color (which should be the sampled theme color)
  return {
    background: `linear-gradient(to bottom, ${props.color} 0%, transparent 100%)`,
  }
})
</script>

<template>
  <div
    class="theme-overlay pointer-events-none absolute inset-x-0 top-0 z-1 h-24 lg:h-32"
    :style="gradientStyle"
  />
</template>
