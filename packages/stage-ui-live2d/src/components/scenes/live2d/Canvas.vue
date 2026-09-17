<script setup lang="ts">
import { Application } from '@pixi/app'
import { BatchRenderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { coverRect } from '@proj-airi/stage-shared'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  height: number
  /**
   * Scene painted behind the model, inside this canvas rather than under it, so one
   * readback answers for the whole stage.
   */
  backgroundUrl?: string | null
  resolution?: number
  maxFps?: number
}>(), {
  resolution: 2,
  maxFps: 0,
})

const emit = defineEmits<{
  error: [error: Error]
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const containerRef = ref<HTMLDivElement>()
const isPixiCanvasReady = ref(false)
const pixiApp = shallowRef<Application>()
const pixiAppCanvas = ref<HTMLCanvasElement>()

function resolveMaxFps(limit?: number) {
  if (!limit || limit <= 0)
    return 0

  return Math.max(1, Math.round(limit))
}

function installRenderGuard(app: Application) {
  const guardedRender = () => {
    try {
      app.render()
    }
    catch (error) {
      console.error('[Live2D] Pixi render error.', error)
      app.ticker.stop()
      emit('error', error instanceof Error ? error : new Error(String(error)))
    }
  }

  app.ticker.remove(app.render, app)
  app.ticker.add(guardedRender)
  app.ticker.maxFPS = resolveMaxFps(props.maxFps)
}

async function initLive2DPixiStage(parent: HTMLDivElement) {
  componentState.value = 'loading'
  isPixiCanvasReady.value = false

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)
  // The Live2D model draws through its own pipeline, so nothing here needed the batch
  // renderer until the scene arrived as a sprite. Without it a sprite reaches a batch
  // system that was never installed.
  extensions.add(BatchRenderer)
  // We handle the interactions (e.g., mouse-based focusing at) manually
  // extensions.add(InteractionManager)

  pixiApp.value = new Application({
    width: props.width * props.resolution,
    height: props.height * props.resolution,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoDensity: false,
    resolution: 1,
  })

  installRenderGuard(pixiApp.value)
  pixiApp.value.stage.scale.set(props.resolution)

  pixiAppCanvas.value = pixiApp.value.view

  // Set CSS styles to make canvas responsive to container
  pixiAppCanvas.value.style.width = '100%'
  pixiAppCanvas.value.style.height = '100%'
  pixiAppCanvas.value.style.objectFit = 'cover'
  pixiAppCanvas.value.style.display = 'block'

  parent.appendChild(pixiApp.value.view)

  isPixiCanvasReady.value = true
  componentState.value = 'mounted'

  await syncBackground()
}

const backgroundSprite = shallowRef<Sprite>()

/** Fits the scene over the stage, matching the `cover` framing it had as a CSS layer. */
function layoutBackground() {
  const sprite = backgroundSprite.value
  if (!sprite || !props.width || !props.height)
    return

  const rect = coverRect({ width: props.width, height: props.height }, sprite.texture)
  sprite.x = rect.x
  sprite.y = rect.y
  sprite.width = rect.width
  sprite.height = rect.height
}

async function syncBackground() {
  const app = pixiApp.value
  if (!app)
    return

  const url = props.backgroundUrl
  if (!url) {
    if (backgroundSprite.value) {
      app.stage.removeChild(backgroundSprite.value)
      backgroundSprite.value.destroy()
      backgroundSprite.value = undefined
    }
    return
  }

  const texture = await Texture.fromURL(url)
  // A later scene wins: loading is async and the card can change mid-flight.
  if (props.backgroundUrl !== url || !pixiApp.value)
    return

  if (backgroundSprite.value) {
    backgroundSprite.value.texture = texture
  }
  else {
    const sprite = new Sprite(texture)
    backgroundSprite.value = sprite
    // Index 0 keeps it under the model, wherever the model lands in the stage.
    app.stage.addChildAt(sprite, 0)
  }

  layoutBackground()
}

function handleResize() {
  if (pixiApp.value) {
    // Update the internal rendering resolution
    pixiApp.value.renderer.resize(props.width * props.resolution, props.height * props.resolution)
    pixiApp.value.stage.scale.set(props.resolution)
  }

  layoutBackground()

  // The CSS styles handle the display size, so we don't need to manually set view dimensions
}

watch([() => props.width, () => props.height, () => props.resolution], handleResize)
watch(() => props.backgroundUrl, () => void syncBackground())
watch(() => props.maxFps, (limit) => {
  if (pixiApp.value)
    pixiApp.value.ticker.maxFPS = resolveMaxFps(limit)
})

onMounted(async () => {
  if (!containerRef.value)
    return

  try {
    await initLive2DPixiStage(containerRef.value)
  }
  catch (error) {
    console.error('[Live2D] Failed to initialize Pixi stage.', error)
    emit('error', error instanceof Error ? error : new Error(String(error)))
  }
})
onUnmounted(() => pixiApp.value?.destroy())

async function captureFrame() {
  const frame = new Promise<Blob | null>((resolve) => {
    if (!pixiAppCanvas.value || !pixiApp.value)
      return resolve(null)

    try {
      pixiApp.value.render()
    }
    catch (error) {
      console.error('[Live2D] Pixi render error during capture.', error)
      emit('error', error instanceof Error ? error : new Error(String(error)))
      return resolve(null)
    }

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

import.meta.hot?.dispose(() => {
  console.warn('[Dev] Reload on HMR dispose is active for this component. Performing a full reload.')
  window.location.reload()
})
</script>

<template>
  <div
    ref="containerRef"
    class="w-full"
    :style="{ height: `${props.height}px` }"
  >
    <slot v-if="isPixiCanvasReady" :app="pixiApp" />
  </div>
</template>
