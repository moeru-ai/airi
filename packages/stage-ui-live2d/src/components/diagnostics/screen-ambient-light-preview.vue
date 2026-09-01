<script setup lang="ts">
import type {
  AmbientLightEnvironment,
  AmbientLightFilterOptions,
  ScreenAmbientLightMode,
} from '@proj-airi/stage-shared/screen-ambient-light'

import { errorMessageFrom } from '@moeru/std'
import { Application } from '@pixi/app'
import { BatchRenderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

import { ScreenAmbientLightFilter } from '../../filters/screen-ambient-light'
import { ambientLightTestCard, drawAmbientLightTestCard } from '../../utils/ambient-light-test-card'

const props = defineProps<{
  environment: AmbientLightEnvironment
  options: AmbientLightFilterOptions
  mode: ScreenAmbientLightMode
  strength: number
}>()

const emit = defineEmits<{
  /**
   * The renderer could not start, so the canvas stays blank for the rest of
   * the lifetime of this component. The caller decides what to show instead.
   */
  failed: [message: string]
}>()

// The preview owns a Pixi application of its own, next to the one the stage
// window runs. Both need the batch renderer to draw a sprite and the ticker
// plugin to satisfy the Application constructor. `extensions.add` skips a
// plugin it already holds, so a second registration changes nothing.
extensions.add(BatchRenderer, TickerPlugin)

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const application = shallowRef<Application>()
const filter = shallowRef<ScreenAmbientLightFilter>()

onMounted(() => {
  // Only one application may exist here at a time. A second one would open a
  // second WebGL context and leave the first with no owner to destroy it, which
  // is what a hot reload that runs this hook twice would produce.
  if (application.value || !canvas.value)
    return

  try {
    startPreview(canvas.value)
    renderPreview()
  }
  catch (error) {
    disposePreview()
    emit('failed', errorMessageFrom(error) ?? 'Unknown error')
  }
})

onUnmounted(disposePreview)

// The devtool must not hold the GPU while it sits open, so nothing drives a
// frame loop. One render follows each change of an input the shader reads.
watch(
  [() => props.environment, () => props.options, () => props.mode, () => props.strength],
  renderPreview,
)

/**
 * Starts the Pixi application that runs the real filter on the test card.
 *
 * The constructor throws when the browser cannot give a WebGL context, and the
 * caller turns that into the message it emits.
 */
function startPreview(view: HTMLCanvasElement) {
  const app = new Application({
    view,
    width: ambientLightTestCard.width,
    height: ambientLightTestCard.height,
    backgroundAlpha: 0,
    // Nothing may start a frame loop, and the drawing buffer has to survive
    // between two on-demand renders that can be minutes apart.
    autoStart: false,
    preserveDrawingBuffer: true,
  })

  const sprite = new Sprite(Texture.from(drawAmbientLightTestCard()))
  const previewFilter = new ScreenAmbientLightFilter()
  sprite.filters = [previewFilter]
  app.stage.addChild(sprite)

  application.value = app
  filter.value = previewFilter
}

/** Writes the current props into the filter and draws one frame. */
function renderPreview() {
  const app = application.value
  const previewFilter = filter.value
  if (!app || !previewFilter)
    return

  previewFilter.update({
    environment: props.environment,
    mode: props.mode,
    strength: props.strength,
    options: props.options,
  })
  app.render()
}

function disposePreview() {
  // A filter is not a child of the stage, so destroying the application does
  // not reach it. The application destroy releases the WebGL context, and the
  // filter destroy releases the two light-map textures and the blur pass.
  application.value?.destroy(true, { children: true, texture: true, baseTexture: true })
  filter.value?.destroy()
  application.value = undefined
  filter.value = undefined
}
</script>

<template>
  <!--
    The drawing buffer holds the card at its own size, and the element scales
    to the width the caller gives it.
  -->
  <canvas ref="canvas" :class="['block h-auto w-full']" />
</template>
