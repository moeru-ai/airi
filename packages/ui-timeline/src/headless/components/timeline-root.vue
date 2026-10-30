<script setup lang="ts" generic="Item extends TimelineItemRef">
import type { TimelineView } from '@proj-airi/timeline-canvas'

import type { TimelineRevealTarget, TimelineRootContext, TimelineTick } from '../composables/timeline-root-context'
import type { TimelineItemRef, TimelineRange } from '../types'

import { pixelsPerMs, xToTime } from '@proj-airi/timeline-canvas'
import { useElementSize, useRafFn, useScroll } from '@vueuse/core'
import { computed, ref, shallowRef } from 'vue'

import { provideTimelineRootContext } from '../composables/timeline-root-context'
import { FOLLOW_LEAD_MS, followWindowMs, formatTick, tickIntervalMs } from '../utils/time-format'

/**
 * The root of a timeline. It owns the view window, follow mode, zoom, pan, `fit`, `reveal`, and the cursor keys, and
 * shares them with the other parts through `injectTimelineRootContext`.
 *
 * It renders one focusable element. Arrow keys move the cursor by 1% of the visible window, or 10% with Shift. Home,
 * End, and Ctrl or Cmd with Shift and an arrow go to the start and the end. Escape clears the selection, then the
 * cursor. Holding a key repeats it.
 */
const props = withDefaults(defineProps<{
  /** The first time of the data. Not finite while there is no data. */
  start: number
  /** The last time of the data. */
  end: number
  /** The clock now, or undefined while it is not known. Follow mode, `fit`, and the End key read it. */
  now?: () => number | undefined
  /** Work still runs, so `fit` also holds now. */
  running?: boolean
  /** Changes when the data changes in place. The ticks recompute on it. */
  version?: number
}>(), { now: () => undefined, running: false, version: 0 })

defineSlots<{
  /** Slot props: the origin of the tick labels, and the cursor. Other state is in the context. */
  default: (props: { origin: number, cursor?: number }) => unknown
}>()
/** The scrub cursor on the clock of the timeline. */
const cursor = defineModel<number | undefined>('cursor')
/** The selected item. A click on an item, a click on empty lanes, the item list, and Escape change it. */
const selection = defineModel<Item | undefined>('selection')
/** The view follows `now`. A pan, a zoom, `fit`, or a moving `reveal` turns it off. */
const follow = defineModel<boolean>('follow', { default: false })
/** Width of the label column that covers the left of the lanes. `fit`, `reveal`, and the keys keep times right of it. */
const labelWidth = defineModel<number>('labelWidth', { default: 0 })

/** Weight of the target window in each frame. Lower values grow the axis more smoothly. */
const FOLLOW_SMOOTHING = 0.12
const MIN_WINDOW_MS = 50
/** The most ticks that the axis renders, so a tiny window over a wide render range stays cheap. */
const MAX_TICKS = 400

const rootElement = shallowRef<HTMLElement>()
const scrollElement = shallowRef<HTMLElement>()
const axisElement = shallowRef<HTMLElement>()
const lanesElement = shallowRef<HTMLElement>()
const canvasElement = shallowRef<HTMLCanvasElement>()
const itemListElement = shallowRef<HTMLElement>()

const { width: lanesWidth } = useElementSize(lanesElement)
const { y: scrollTop } = useScroll(scrollElement)
/**
 * The visible height of the lanes, below the sticky axis, in whole pixels.
 *
 * The frame loop reads it from the scroll area. A ResizeObserver on the scroll area, whose result sizes the canvas
 * inside it, reported "ResizeObserver loop completed with undelivered notifications" on every layout.
 */
const viewportHeight = ref(0)

/** The visible window on the clock. The frame loop writes it to CSS variables, not to Vue state. */
const view = { start: 0, end: 10_000 }
const renderRange = shallowRef<TimelineRange>({ from: 0, to: 10_000 })
let smoothedWindowMs = 10_000

const origin = computed(() => {
  void props.version
  return Number.isFinite(props.start) ? props.start : 0
})

/** The span of the data from the origin, in milliseconds. It is 0 without data. */
const span = computed(() => {
  void props.version
  return Number.isFinite(props.start) ? Math.max(0, props.end - props.start) : 0
})

function currentView(): TimelineView {
  return { start: view.start, end: view.end, width: Math.max(1, lanesWidth.value) }
}

/** Writes the view to CSS variables for `position`, and moves the render range once the view leaves it. */
function writeView() {
  const element = rootElement.value
  if (!element)
    return
  element.style.setProperty('--view-start', String(view.start))
  element.style.setProperty('--ppm', String(pixelsPerMs(currentView())))

  const range = renderRange.value
  const length = view.end - view.start
  if (view.start < range.from || view.end > range.to || range.to - range.from > length * 6)
    renderRange.value = { from: view.start - length, to: view.end + length }
}

useRafFn(() => {
  const height = Math.max(0, Math.floor(scrollElement.value?.clientHeight ?? 0) - (axisElement.value?.offsetHeight ?? 0))
  if (height !== viewportHeight.value)
    viewportHeight.value = height
  const now = props.now()
  if (follow.value && now !== undefined) {
    const target = followWindowMs(origin.value, now)
    smoothedWindowMs += (target - smoothedWindowMs) * FOLLOW_SMOOTHING
    view.end = now + FOLLOW_LEAD_MS
    view.start = view.end - smoothedWindowMs
  }
  writeView()
})

/**
 * Turns follow mode off when the user moves or zooms the view. A view that the user chose stays until they turn
 * follow on again.
 */
function stopFollow() {
  if (follow.value)
    follow.value = false
}

function timeAt(clientX: number): number {
  const rect = lanesElement.value?.getBoundingClientRect()
  const x = rect ? clientX - rect.left : 0
  return xToTime(currentView(), x)
}

function setView(start: number, end: number) {
  view.start = start
  view.end = end
}

function zoomAt(anchor: number, factor: number) {
  const length = view.end - view.start
  const next = Math.max(MIN_WINDOW_MS, length * factor)
  // The anchor keeps its place, so the time under the pointer stays under it.
  view.start = anchor - (anchor - view.start) * (next / length)
  view.end = view.start + next
  smoothedWindowMs = next
}

function visibleStart(): number {
  return xToTime(currentView(), labelWidth.value)
}

/**
 * Moves the view so a time range shows right of the label column, and scrolls so a row shows. A range that already
 * shows does not move the view. A moved view puts the range start at a third of the visible part.
 */
function reveal(target: TimelineRevealTarget) {
  const from = visibleStart()
  const visibleLength = view.end - from
  const end = target.end ?? target.start
  const hidden = target.start < from || target.start > view.end || (end > view.end && end - target.start <= visibleLength)
  if (hidden) {
    const shift = target.start - visibleLength / 3 - from
    view.start += shift
    view.end += shift
    stopFollow()
    writeView()
  }
  const element = scrollElement.value
  if (element && target.top !== undefined && target.height !== undefined) {
    if (target.top < element.scrollTop)
      element.scrollTop = target.top
    else if (target.top + target.height > element.scrollTop + viewportHeight.value)
      element.scrollTop = target.top + target.height - viewportHeight.value
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (selection.value)
      selection.value = undefined
    else if (cursor.value !== undefined)
      cursor.value = undefined
    else
      return
    event.preventDefault()
    rootElement.value?.focus({ preventScroll: true })
    return
  }
  // The item list and other controls inside the root handle their own keys.
  if (event.target === rootElement.value)
    moveCursor(event)
}

/**
 * Moves the cursor for an arrow key, Home, or End, and brings it into view. It returns true when it handled the key.
 * The root and the axis call it.
 */
function moveCursor(event: KeyboardEvent): boolean {
  if (event.altKey || !Number.isFinite(props.start))
    return false
  const start = props.start
  const end = Math.max(props.end, props.now() ?? props.end)
  const jump = (event.ctrlKey || event.metaKey) && event.shiftKey
  if (!jump && (event.ctrlKey || event.metaKey))
    return false
  const step = ((view.end - visibleStart()) / 100) * (event.shiftKey ? 10 : 1)
  const from = cursor.value ?? (visibleStart() + view.end) / 2
  let time: number
  if (event.key === 'ArrowLeft')
    time = jump ? start : from - step
  else if (event.key === 'ArrowRight')
    time = jump ? end : from + step
  else if (event.key === 'Home')
    time = start
  else if (event.key === 'End')
    time = end
  else
    return false
  event.preventDefault()
  time = Math.min(end, Math.max(start, time))
  cursor.value = time
  reveal({ start: time })
  return true
}

/**
 * Fits the view to the data, right of the label column. While work runs, the view also holds now, so the open work
 * shows whole.
 */
function fit() {
  if (!Number.isFinite(props.start))
    return
  const end = props.running ? Math.max(props.end, props.now() ?? props.end) : props.end
  const padding = Math.max(200, (end - props.start) * 0.03)
  // The label column covers the left of the lanes, so the data fits in the part right of it.
  const width = Math.max(1, lanesWidth.value)
  const visible = Math.max(1, width - labelWidth.value)
  const scale = visible / (end - props.start + padding * 2)
  view.start = props.start - padding - labelWidth.value / scale
  view.end = view.start + width / scale
  smoothedWindowMs = view.end - view.start
  stopFollow()
}

const ticks = computed(() => {
  void props.version
  const range = renderRange.value
  const length = view.end - view.start
  const interval = tickIntervalMs(length, lanesWidth.value)
  const first = Math.ceil((range.from - origin.value) / interval) * interval + origin.value
  const result: TimelineTick[] = []
  for (let time = first; time <= range.to && result.length < MAX_TICKS; time += interval)
    result.push({ time, label: formatTick(time - origin.value, interval) })
  return result
})

function position(time: number) {
  return { left: `calc((${time} - var(--view-start)) * var(--ppm) * 1px)` }
}

/** The key of the item that the next focus makes quiet, set by a quiet `focusItem`. */
let quietKey: string | undefined
const focusedKey = shallowRef<string>()

function focusItem(key: string, options: { quiet?: boolean } = {}) {
  const button = itemListElement.value?.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(key)}"]`)
  if (!button)
    return
  quietKey = options.quiet ? key : undefined
  button.focus({ preventScroll: true })
}

function takeQuietFocus(key: string): boolean {
  if (quietKey !== key)
    return false
  quietKey = undefined
  return true
}

const context: TimelineRootContext<Item> = {
  view,
  currentView,
  now: () => props.now(),
  cursor,
  selection,
  labelWidth,
  lanesWidth,
  scrollTop,
  viewportHeight,
  renderRange,
  ticks,
  origin,
  span,
  focusedKey,
  rootElement,
  scrollElement,
  axisElement,
  lanesElement,
  canvasElement,
  itemListElement,
  timeAt,
  visibleStart,
  setView,
  zoomAt,
  stopFollow,
  reveal,
  fit,
  moveCursor,
  position,
  focusItem,
  takeQuietFocus,
}
provideTimelineRootContext(context)

defineExpose({ fit, reveal })
</script>

<template>
  <div
    ref="rootElement"
    tabindex="0"
    role="group"
    aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End Escape"
    @keydown="onKeydown"
  >
    <slot :origin="origin" :cursor="cursor" />
  </div>
</template>
