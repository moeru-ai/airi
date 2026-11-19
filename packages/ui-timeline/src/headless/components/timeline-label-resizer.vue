<script setup lang="ts">
import { injectTimelineRootContext } from '../composables/timeline-root-context'

/**
 * The resize edge of the label column, as a vertical separator. A drag or the arrow keys resize the column, and a
 * double click resets it. The column keeps its limits, and the lanes keep at least 40% of the root width.
 */
const props = withDefaults(defineProps<{
  /** The width that a double click sets. */
  defaultWidth?: number
  min?: number
  max?: number
  /** The change of one arrow key, in CSS pixels. */
  step?: number
}>(), { defaultWidth: 208, min: 140, max: 480, step: 16 })

const context = injectTimelineRootContext()

/** A label width inside the limits. */
function clampWidth(width: number): number {
  const max = Math.min(props.max, Math.max(props.min, (context.rootElement.value?.clientWidth ?? 0) * 0.6))
  return Math.round(Math.min(max, Math.max(props.min, width)))
}

let drag: { pointer: number, x: number, width: number } | undefined

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0)
    return
  drag = { pointer: event.pointerId, x: event.clientX, width: context.labelWidth.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (drag?.pointer === event.pointerId)
    context.labelWidth.value = clampWidth(drag.width + event.clientX - drag.x)
}

function onPointerUp(event: PointerEvent) {
  if (drag?.pointer === event.pointerId)
    drag = undefined
}

function onKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowLeft' ? -props.step : event.key === 'ArrowRight' ? props.step : 0
  if (step === 0)
    return
  event.preventDefault()
  context.labelWidth.value = clampWidth(context.labelWidth.value + step)
}
</script>

<template>
  <div
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-valuenow="context.labelWidth.value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="context.labelWidth.value = defaultWidth"
    @keydown="onKeydown"
  >
    <slot />
  </div>
</template>
