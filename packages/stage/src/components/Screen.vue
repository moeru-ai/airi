<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints, useElementBounding, useWindowSize } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'

const containerRef = ref<HTMLDivElement>()

const breakpoints = useBreakpoints(breakpointsTailwind)
const { width, height } = useWindowSize()
const containerElementBounding = useElementBounding(containerRef, { immediate: true, windowResize: true, reset: true })

const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const isTablet = computed(() => breakpoints.between('md', 'lg').value)
const isDesktop = computed(() => breakpoints.greaterOrEqual('lg').value)

const canvasWidth = computed(() => {
  if (isDesktop.value)
    return containerElementBounding.width.value
  else if (isMobile.value)
    return (width.value - 16) // padding
  else if (isTablet.value)
    return (width.value - 16) // padding
  else
    return containerElementBounding.width.value
})

const canvasHeight = ref(0)

watch([width, height, containerRef], () => {
  const bounding = containerRef.value?.parentElement?.getBoundingClientRect()

  if (isDesktop.value) {
    canvasHeight.value = bounding?.height || 0
  }
  else if (isMobile.value) {
    canvasHeight.value = bounding?.height || 0
  }
  else if (isTablet.value) {
    canvasHeight.value = bounding?.height || 0
  }
  else {
    canvasHeight.value = 600
  }
})

watch([containerElementBounding.width, containerElementBounding.height], () => {
  if (isDesktop.value) {
    canvasHeight.value = containerElementBounding.height.value
  }
  else if (isMobile.value) {
    canvasHeight.value = containerElementBounding.height.value
  }
  else if (isTablet.value) {
    canvasHeight.value = containerElementBounding.height.value
  }
  else {
    canvasHeight.value = 600
  }
})

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
