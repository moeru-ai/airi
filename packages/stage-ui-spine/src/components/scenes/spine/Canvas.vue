<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  height: number
  resolution?: number
}>(), {
  resolution: 1,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const isCanvasReady = ref(false)

function initCanvas(parent: HTMLDivElement) {
  componentState.value = 'loading'

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(props.width * props.resolution))
  canvas.height = Math.max(1, Math.floor(props.height * props.resolution))
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.objectFit = 'cover'
  canvas.style.display = 'block'

  parent.appendChild(canvas)
  canvasRef.value = canvas
  isCanvasReady.value = true
  componentState.value = 'mounted'
}

function handleResize() {
  if (!canvasRef.value)
    return

  canvasRef.value.width = Math.max(1, Math.floor(props.width * props.resolution))
  canvasRef.value.height = Math.max(1, Math.floor(props.height * props.resolution))
}

watch([() => props.width, () => props.height, () => props.resolution], handleResize)

onMounted(() => {
  if (containerRef.value)
    initCanvas(containerRef.value)
})

onUnmounted(() => {
  if (canvasRef.value && canvasRef.value.parentElement)
    canvasRef.value.parentElement.removeChild(canvasRef.value)
  canvasRef.value = undefined
  isCanvasReady.value = false
})

async function captureFrame() {
  return new Promise<Blob | null>((resolve) => {
    if (!canvasRef.value)
      return resolve(null)
    canvasRef.value.toBlob(resolve, 'image/png')
  })
}

function canvasElement() {
  return canvasRef.value
}

defineExpose({
  captureFrame,
  canvasElement,
})

import.meta.hot?.dispose(() => {
  console.warn('[Dev] Reload on HMR dispose is active for this component. Performing a full reload.')
  window.location.reload()
})
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <slot v-if="isCanvasReady" :canvas="canvasRef" />
  </div>
</template>
