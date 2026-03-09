<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { onMounted, ref } from 'vue'

const containerRef = ref<HTMLDivElement>()
const canvasWidth = ref(0)
const canvasHeight = ref(0)

// Sync initial read — avoids the one-tick delay of watch/useElementBounding
onMounted(() => {
  if (!containerRef.value)
    return
  const rect = containerRef.value.getBoundingClientRect()
  canvasWidth.value = rect.width
  canvasHeight.value = rect.height
})

// Keep dimensions up to date on resize; ignore 0×0 intermediate layout states
useResizeObserver(containerRef, (entries) => {
  const { width, height } = entries[0].contentRect
  if (width > 0 && height > 0) {
    canvasWidth.value = width
    canvasHeight.value = height
  }
})
</script>

<template>
  <!-- Outer div: h-full/w-full CSS, responds to layout/resize → measurement target -->
  <!-- Inner div: explicit px style → gives TresCanvas a definite pixel parent,
       preventing height:100% chain collapse without pinning the outer div -->
  <div ref="containerRef" h-full w-full>
    <div
      :style="canvasWidth > 0 && canvasHeight > 0
        ? { width: `${canvasWidth}px`, height: `${canvasHeight}px` }
        : { width: '100%', height: '100%' }"
    >
      <slot :width="canvasWidth" :height="canvasHeight" />
    </div>
  </div>
</template>
