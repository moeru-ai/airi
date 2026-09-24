<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { ref } from 'vue'

const containerRef = ref<HTMLDivElement>()

// The slot content fills this box, so its size is the only measurement. The
// parent or the window gives a second answer whenever the box differs from
// them, as it does under a minimum height.
const { width, height } = useElementSize(containerRef)

defineExpose({
  containerRef,
})
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <slot :width="width" :height="height" />
  </div>
</template>
