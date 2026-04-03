<script setup lang="ts">
import { computed } from 'vue'

import { Appearance, Dock, MenuBar } from './ui'

const props = withDefaults(defineProps<{
  aspectRatio?: string | number
  dockSize?: number
}>(), {
  aspectRatio: '16:9',
  dockSize: 1.5,
})

const aspectRatio = computed(() => {
  if (!props.aspectRatio) {
    return 16 / 9
  }
  if (typeof props.aspectRatio === 'number') {
    return props.aspectRatio
  }

  return props.aspectRatio.split(':').map(Number).reduce((a, b) => a / b)
})
</script>

<template>
  <div
    :class="[
      'relative overflow-hidden',
      'font-macos',
    ]"
    :style="{
      aspectRatio,
    }"
  >
    <div
      :class="[
        'relative z-999',
        'w-full h-full',
      ]"
    >
      <slot name="windows" />
    </div>
    <Appearance />
    <MenuBar />
    <Dock :size="props.dockSize" />
  </div>
</template>

<style scoped>
.font-macos {
  font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
}
</style>
