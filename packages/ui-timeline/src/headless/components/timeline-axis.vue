<script setup lang="ts">
import type { StyleValue } from 'vue'

import type { TimelineTick } from '../composables/timeline-root-context'

import { computed } from 'vue'

import { elementRef, injectTimelineRootContext } from '../composables/timeline-root-context'
import { formatOffset } from '../utils/time-format'

/**
 * The time axis. A press moves the cursor to the pressed time, and a drag moves it on. The root subtracts the height
 * of the axis from the visible height of the lanes, so make the axis sticky at the top of the scroll area.
 *
 * The axis is the slider of the cursor for assistive technology. It takes the focus, and it takes the cursor keys of
 * the root. Its values are milliseconds from the origin, and its value text is that offset as text. A press can put
 * the cursor out of the data, so the limits grow to hold it. Give the axis an accessible name with `aria-label`.
 */
defineSlots<{
  /**
   * Slot props: the ticks over the render range, the cursor, and `position`, which gives the inline style that puts
   * an element at a time.
   */
  default: (props: { ticks: TimelineTick[], cursor?: number, position: (time: number) => StyleValue }) => unknown
}>()

const context = injectTimelineRootContext()
const bindElement = elementRef(context.axisElement, HTMLElement)

/** The pointer that drags the cursor. The axis captures it, so a drag outside the axis still moves the cursor. */
let scrubPointer: number | undefined

/** The cursor in milliseconds from the origin, or undefined without a cursor. */
const value = computed(() => {
  const cursor = context.cursor.value
  return cursor === undefined ? undefined : Math.round(cursor - context.origin.value)
})

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0)
    return
  scrubPointer = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  context.cursor.value = context.timeAt(event.clientX)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId === scrubPointer)
    context.cursor.value = context.timeAt(event.clientX)
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId === scrubPointer)
    scrubPointer = undefined
}
</script>

<template>
  <div
    :ref="bindElement"
    role="slider"
    tabindex="0"
    aria-orientation="horizontal"
    :aria-valuemin="Math.min(0, value ?? 0)"
    :aria-valuemax="Math.max(Math.round(context.span.value), value ?? 0)"
    :aria-valuenow="value"
    :aria-valuetext="context.cursor.value === undefined ? undefined : formatOffset(context.cursor.value - context.origin.value)"
    aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End"
    @keydown="context.moveCursor($event)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <slot :ticks="context.ticks.value" :cursor="context.cursor.value" :position="context.position" />
  </div>
</template>
