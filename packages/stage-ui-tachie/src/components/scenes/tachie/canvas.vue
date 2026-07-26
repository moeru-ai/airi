<script setup lang="ts">
import { Application } from '@pixi/app'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  height: number
  resolution?: number
}>(), {
  resolution: 2,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const containerRef = useTemplateRef<HTMLDivElement>('container')
const app = shallowRef<Application>()
const canvas = shallowRef<HTMLCanvasElement>()

function logicalRenderScale() {
  return Math.max(0.5, Math.min(2, props.resolution))
}

function render() {
  if (!app.value)
    return

  try {
    app.value.render()
  }
  catch (error) {
    console.error('[Tachie] Pixi render error.', error)
  }
}

function resize() {
  if (!app.value)
    return

  const resolution = logicalRenderScale()
  app.value.renderer.resize(
    Math.max(1, Math.floor(props.width * resolution)),
    Math.max(1, Math.floor(props.height * resolution)),
  )
  // Model transforms use logical CSS pixels. Scaling the root stage maps those
  // coordinates onto the higher-resolution backing canvas.
  app.value.stage.scale.set(resolution)
  render()
}

function initialize(parent: HTMLDivElement) {
  componentState.value = 'loading'
  const resolution = logicalRenderScale()
  const nextApp = new Application({
    width: Math.max(1, Math.floor(props.width * resolution)),
    height: Math.max(1, Math.floor(props.height * resolution)),
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoDensity: false,
    resolution: 1,
  })
  nextApp.stage.scale.set(resolution)

  const nextCanvas = nextApp.view
  nextCanvas.style.width = '100%'
  nextCanvas.style.height = '100%'
  nextCanvas.style.objectFit = 'cover'
  nextCanvas.style.display = 'block'
  parent.appendChild(nextCanvas)

  app.value = nextApp
  canvas.value = nextCanvas
  componentState.value = 'mounted'
  render()
}

async function captureFrame() {
  return new Promise<Blob | null>((resolve) => {
    if (!canvas.value)
      return resolve(null)

    render()
    canvas.value.toBlob(resolve, 'image/png')
  })
}

watch([() => props.width, () => props.height, () => props.resolution], resize)

onMounted(() => {
  if (containerRef.value)
    initialize(containerRef.value)
})

onUnmounted(() => {
  app.value?.destroy(true)
  app.value = undefined
  canvas.value = undefined
})

defineExpose({
  canvasElement: () => canvas.value,
  captureFrame,
  render,
})
</script>

<template>
  <div
    ref="container"
    :class="[
      'h-full w-full',
    ]"
  >
    <slot v-if="app" :app="app" :render="render" />
  </div>
</template>
