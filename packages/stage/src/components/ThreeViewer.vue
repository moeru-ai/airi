<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'
import { breakpointsTailwind, useBreakpoints, useElementBounding, useWindowSize } from '@vueuse/core'
import { computed, ref } from 'vue'

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

onMounted(async () => {
  if (!containerRef.value)
    return

  containerElementBounding.update()
})
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <TresCanvas :alpha="true" :antialias="true" :width="canvasWidth" :height="canvasHeight">
      <TresPerspectiveCamera />
      <TresMesh>
        <TresTorusGeometry :args="[1, 0.5, 16, 32]" />
        <TresMeshBasicMaterial color="orange" />
      </TresMesh>
      <OrbitControls />
      <TresAmbientLight :intensity="1" />
    </TresCanvas>
  </div>
</template>
