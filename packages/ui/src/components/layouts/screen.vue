<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints, useElementBounding, useWindowSize } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

const containerRef = ref<HTMLDivElement>()

const breakpoints = useBreakpoints(breakpointsTailwind)
const { width, height } = useWindowSize()
const containerElementBounding = useElementBounding(containerRef, { immediate: true, windowResize: true, reset: true })

const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const isTablet = computed(() => breakpoints.between('md', 'lg').value)

const canvasWidth = computed(() => {
  if (isMobile.value || isTablet.value)
    return (width.value - 16) // padding
  return containerElementBounding.width.value
})

const canvasHeight = computed(() => containerElementBounding.height.value || 0)

onMounted(async () => {
  if (!containerRef.value)
    return

  containerElementBounding.update()
})
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <slot :width="canvasWidth" :height="canvasHeight" />
  </div>
</template>
