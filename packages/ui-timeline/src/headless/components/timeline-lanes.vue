<script setup lang="ts" generic="Item extends TimelineItemRef">
import type { TimelineItemRef } from '../types'

import { pixelsPerMs } from '@proj-airi/timeline-canvas'
import { nextTick } from 'vue'

import { elementRef, injectTimelineRootContext } from '../composables/timeline-root-context'

/**
 * The lanes under the axis. A drag pans the view, and the wheel zooms around the pointer. Shift with the wheel, or a
 * horizontal wheel, pans. A click selects the item that `hitTest` finds. A click elsewhere moves the cursor and clears
 * the selection.
 */
const props = defineProps<{
  /** The item under a pointer event, or undefined. */
  hitTest?: (event: PointerEvent) => Item | undefined
}>()

/** A move under this distance in CSS pixels is still a click. */
const DRAG_THRESHOLD_PX = 3
/** Zoom speed: the window grows by e^(deltaY * this factor) for one wheel event. */
const WHEEL_ZOOM_RATE = 0.0015

const context = injectTimelineRootContext<Item>()
const bindElement = elementRef(context.lanesElement, HTMLElement)

function onWheel(event: WheelEvent) {
  context.stopFollow()
  const { start, end } = context.view
  const length = end - start
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    const shift = ((event.shiftKey ? event.deltaY : event.deltaX) / Math.max(1, context.lanesWidth.value)) * length
    context.setView(start + shift, end + shift)
    return
  }
  context.zoomAt(context.timeAt(event.clientX), Math.exp(event.deltaY * WHEEL_ZOOM_RATE))
}

let drag: { x: number, start: number, end: number, moved: boolean } | undefined

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0)
    return
  drag = { x: event.clientX, start: context.view.start, end: context.view.end, moved: false }
}

function onPointerMove(event: PointerEvent) {
  if (!drag)
    return
  const dx = event.clientX - drag.x
  if (!drag.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) {
    drag.moved = true
    // Capture only once a drag starts. A capture at pointer down sends the click of an item to the lanes instead.
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  if (!drag.moved)
    return
  context.stopFollow()
  const shift = -dx / pixelsPerMs(context.currentView())
  context.setView(drag.start + shift, drag.end + shift)
}

function onPointerUp(event: PointerEvent) {
  const wasDrag = drag?.moved
  drag = undefined
  if (wasDrag)
    return
  const target = props.hitTest?.(event)
  context.selection.value = target
  if (!target) {
    context.cursor.value = context.timeAt(event.clientX)
    return
  }
  // The clicked item takes the focus, so arrow keys go on from it.
  void nextTick(() => context.focusItem(target.key, { quiet: true }))
}
</script>

<template>
  <div
    :ref="bindElement"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <slot />
  </div>
</template>
