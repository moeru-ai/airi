<script setup lang="ts">
import { Application } from '@pixi/app'
import { BatchRenderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { coverRect } from '@proj-airi/stage-shared'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  width: number
  height: number
  /**
   * Scene painted behind the model, inside this canvas rather than under it, so one
   * readback answers for the whole stage.
   */
  backgroundUrl?: string | null
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
  const current = app.value
  if (!current)
    return

  const url = props.backgroundUrl
  if (!url) {
    if (backgroundSprite.value) {
      current.stage.removeChild(backgroundSprite.value)
      backgroundSprite.value.destroy({ baseTexture: true, texture: true })
      backgroundSprite.value = undefined
      render()
    }
    return
  }

  // A scene that cannot decode leaves the stage as it is. Letting it throw would reach
  // the stage error surface and take a working model down with it.
  let texture: Texture
  try {
    texture = await Texture.fromURL(url)
  }
  catch {
    return
  }

  // A later scene wins, and so does a later app: both the source and the stage can be
  // replaced while the texture loads.
  if (props.backgroundUrl !== url || app.value !== current)
    return

  if (backgroundSprite.value) {
    const previous = backgroundSprite.value.texture
    backgroundSprite.value.texture = texture
    // A scene is a per-entry image that nothing else draws, so the one being replaced
    // leaves the GPU with its sprite instead of outliving it in pixi's texture cache.
    previous.destroy(true)
  }
  else {
    const sprite = new Sprite(texture)
    backgroundSprite.value = sprite
    // Index 0 keeps it under the model, wherever the model lands in the stage.
    current.stage.addChildAt(sprite, 0)
  }

  layoutBackground()
  render()
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
  layoutBackground()
  render()
}

function initialize(parent: HTMLDivElement) {
  componentState.value = 'loading'
  const resolution = logicalRenderScale()
  extensions.add(BatchRenderer)
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

  void syncBackground()
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
watch(() => props.backgroundUrl, () => void syncBackground())

onMounted(() => {
  if (containerRef.value)
    initialize(containerRef.value)
})

onUnmounted(() => {
  backgroundSprite.value?.destroy({ baseTexture: true, texture: true })
  backgroundSprite.value = undefined
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
