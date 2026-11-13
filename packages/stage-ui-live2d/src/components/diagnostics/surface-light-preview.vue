<script setup lang="ts">
import type { SurfaceLightPreviewOptions } from '../../filters/surface-light-preview'

import { errorMessageFrom } from '@moeru/std'
import { Application } from '@pixi/app'
import { BatchRenderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'

import { SurfaceLightPreviewFilter } from '../../filters/surface-light-preview'

const props = defineProps<{ options: SurfaceLightPreviewOptions }>()
const emit = defineEmits<{ failed: [message: string] }>()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
extensions.add(BatchRenderer, TickerPlugin)

// This component owns one context with no ticker loop. Diagnostics snapshots
// and local controls request frames; unmount releases the context and filter.
let application: Application | undefined
let filter: SurfaceLightPreviewFilter | undefined
let sprite: Sprite | undefined

function render() {
  if (!application || !filter || !sprite)
    return
  const width = Math.round(400 * Math.min(props.options.aspect, 1))
  const height = Math.round(width / props.options.aspect)
  if (application.screen.width !== width || application.screen.height !== height) {
    application.renderer.resize(width, height)
    sprite.width = width
    sprite.height = height
  }
  filter.update(props.options)
  application.render()
}

function dispose() {
  application?.destroy(true, { children: true })
  filter?.destroy()
  application = undefined
  filter = undefined
  sprite = undefined
}

onMounted(() => {
  if (!canvas.value)
    return
  try {
    application = new Application({ view: canvas.value, width: 1, height: 1, backgroundAlpha: 0, autoStart: false, preserveDrawingBuffer: true })
    sprite = new Sprite(Texture.WHITE)
    filter = new SurfaceLightPreviewFilter()
    sprite.filters = [filter]
    application.stage.addChild(sprite)
    render()
  }
  catch (error) {
    dispose()
    emit('failed', errorMessageFrom(error) ?? 'Unknown error')
  }
})
watch(() => props.options, render)
onUnmounted(dispose)
</script>

<template>
  <canvas ref="canvas" :class="['mx-auto block h-auto max-h-120 max-w-full']" />
</template>
