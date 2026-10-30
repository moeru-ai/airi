<script setup lang="ts">
import type { TimelineCanvasFrame } from '../composables/timeline-root-context'

import { useDevicePixelRatio, useRafFn } from '@vueuse/core'

import { elementRef, injectTimelineRootContext } from '../composables/timeline-root-context'

/**
 * A canvas over the visible part of the lanes. In each animation frame it sizes its backing store to the width of the
 * lanes, the visible height, and the device pixel ratio, clears itself, and calls `draw` in CSS pixels.
 *
 * The consumer places it over the visible part of the lanes, for example with the scroll position as its top.
 */
const props = defineProps<{
  draw: (ctx: CanvasRenderingContext2D, frame: TimelineCanvasFrame) => void
}>()

const context = injectTimelineRootContext()
const bindElement = elementRef(context.canvasElement, HTMLCanvasElement)
const { pixelRatio } = useDevicePixelRatio()

useRafFn(() => {
  const element = context.canvasElement.value
  const ctx = element?.getContext('2d')
  const width = context.lanesWidth.value
  const height = context.viewportHeight.value
  if (!element || !ctx || width <= 0 || height <= 0)
    return
  const ratio = pixelRatio.value
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (element.width !== pixelWidth || element.height !== pixelHeight) {
    element.width = pixelWidth
    element.height = pixelHeight
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  props.draw(ctx, { view: context.currentView(), width, height, scrollTop: context.scrollTop.value, now: context.now() })
})
</script>

<template>
  <canvas :ref="bindElement" />
</template>
