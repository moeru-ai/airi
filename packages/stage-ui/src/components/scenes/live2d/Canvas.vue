<script setup lang="ts">
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  height: number
  resolution?: number
}>(), {
  resolution: 2,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const containerRef = ref<HTMLDivElement>()
const isPixiCanvasReady = ref(false)
const pixiApp = ref<Application>()
const pixiAppCanvas = ref<HTMLCanvasElement>()

async function initLive2DPixiStage(parent: HTMLDivElement) {
  componentState.value = 'loading'
  isPixiCanvasReady.value = false

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)
  // We handle the interactions (e.g., mouse-based focusing at) manually
  // extensions.add(InteractionManager)

  pixiApp.value = new Application({
    width: props.width * props.resolution,
    height: props.height * props.resolution,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
  })

  pixiAppCanvas.value = pixiApp.value.view

  // Set CSS styles to make canvas responsive to container
  pixiAppCanvas.value.style.width = '100%'
  pixiAppCanvas.value.style.height = '100%'
  pixiAppCanvas.value.style.objectFit = 'cover'
  pixiAppCanvas.value.style.display = 'block'

  parent.appendChild(pixiApp.value.view)

  isPixiCanvasReady.value = true
  componentState.value = 'mounted'
}

function handleResize() {
  if (pixiApp.value) {
    // Update the internal rendering resolution
    pixiApp.value.renderer.resize(props.width, props.height)
  }

  // The CSS styles handle the display size, so we don't need to manually set view dimensions
}

watch([() => props.width, () => props.height], () => handleResize())
watch(() => props.resolution, (newScale) => {
  if (pixiApp.value && newScale) {
    pixiApp.value.renderer.resolution = newScale
    handleResize() // Refresh the renderer
  }
})

onMounted(async () => containerRef.value && await initLive2DPixiStage(containerRef.value))
onUnmounted(() => pixiApp.value?.destroy())

async function captureFrame() {
  const frame = new Promise<Blob | null>((resolve) => {
    if (!pixiAppCanvas.value || !pixiApp.value)
      return resolve(null)

    pixiApp.value.render()
    pixiAppCanvas.value.toBlob(resolve)
  })

  return frame
}

function canvasElement() {
  return pixiAppCanvas.value
}

defineExpose({
  captureFrame,
  canvasElement,
})
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <slot v-if="isPixiCanvasReady" :app="pixiApp" />
  </div>
</template>
