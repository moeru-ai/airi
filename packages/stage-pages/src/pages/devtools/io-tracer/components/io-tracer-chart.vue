<script setup lang="ts">
import type { IOSpan, IOSubsystem, IOTurn } from '@proj-airi/stage-shared'

import { useElementSize } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import {
  GAP_WARN_THRESHOLD_MS,
  LABEL_COL_WIDTH,
  MINIMAP_HEIGHT,
  ROW_HEIGHT,
  ROW_PADDING,
  SUBSYSTEM_CONFIG_MAP,
  TIME_AXIS_HEIGHT,
} from '../io-tracer-types'

const props = defineProps<{
  turns: IOTurn[]
  selectedSpanId: string | null
  timeOrigin: number
  hiddenSubsystems: Set<IOSubsystem>
}>()

const emit = defineEmits<{
  selectSpan: [spanId: string | null]
}>()

const containerRef = ref<HTMLDivElement>()
const scrollAreaRef = ref<HTMLDivElement>()
const { width: containerWidth } = useElementSize(containerRef)
const hoveredSpan = ref<{ span: IOSpan, turn: IOTurn, x: number, y: number } | null>(null)

const turns = computed(() => {
  return props.turns.toSorted((a, b) => a.startTs - b.startTs)
})

const visibleSpans = computed(() => {
  const result: { span: IOSpan, turn: IOTurn }[] = []
  for (const turn of turns.value) {
    for (const span of turn.spans) {
      if (!props.hiddenSubsystems.has(span.subsystem))
        result.push({ span, turn })
    }
  }
  return result
})

const viewStart = ref(0)
const viewEnd = ref(1000)

const globalRange = computed(() => {
  if (visibleSpans.value.length === 0)
    return { min: props.timeOrigin, max: props.timeOrigin + 1000 }
  let min = Infinity
  let max = -Infinity
  for (const { span } of visibleSpans.value) {
    min = Math.min(min, span.startTs)
    max = Math.max(max, span.endTs ?? performance.now())
  }
  if (min === Infinity)
    return { min: props.timeOrigin, max: props.timeOrigin + 1000 }
  const pad = (max - min) * 0.05 || 50
  return { min: min - pad, max: max + pad }
})

const chartWidth = computed(() => Math.max(1, containerWidth.value - LABEL_COL_WIDTH))

const minViewDuration = computed(() => globalRange.value.max - globalRange.value.min)
const maxViewDuration = computed(() => Math.max(minViewDuration.value, 10))
const minZoomDuration = 1

function clampViewport(start: number, end: number): { start: number, end: number } {
  let dur = end - start

  if (dur > maxViewDuration.value)
    dur = maxViewDuration.value
  if (dur < minZoomDuration)
    dur = minZoomDuration

  const range = globalRange.value

  if (start < range.min) {
    start = range.min
    end = start + dur
  }
  if (end > range.max) {
    end = range.max
    start = end - dur
  }
  if (start < range.min)
    start = range.min

  return { start, end }
}

function setViewport(start: number, end: number) {
  const clamped = clampViewport(start, end)
  viewStart.value = clamped.start
  viewEnd.value = clamped.end
}

const hoveredTurnId = ref<string | null>(null)

interface TurnSeparator {
  type: 'turn-separator'
  y: number
}

interface SpanRow {
  type: 'span'
  span: IOSpan
  turn: IOTurn
  subsystem: IOSubsystem
  y: number
}

interface GapAnnotation {
  startTs: number
  endTs: number
  durationMs: number
  y: number
}

type LayoutRow = TurnSeparator | SpanRow

const layout = computed(() => {
  const rows: LayoutRow[] = []
  const gapAnnotations: GapAnnotation[] = []
  let y = 0

  const subsystemOrder: IOSubsystem[] = ['tts', 'playback']
  const ttsSubsystems = new Set<IOSubsystem>(['tts', 'playback'])
  let isFirstTurn = true

  for (const turn of turns.value) {
    const turnSpans = turn.spans.filter(s => !props.hiddenSubsystems.has(s.subsystem))
    if (turnSpans.length === 0)
      continue

    if (!isFirstTurn) {
      rows.push({ type: 'turn-separator', y })
      y += 1
    }
    isFirstTurn = false

    const llmSpans = turnSpans.filter(s => s.subsystem === 'llm').sort((a, b) => a.startTs - b.startTs)
    const ttsSpanList = turnSpans.filter(s => ttsSubsystems.has(s.subsystem))

    const segmentGroups = new Map<string, IOSpan[]>()
    for (const span of ttsSpanList) {
      const segId = span.ttsCorrelationId ?? span.id
      let group = segmentGroups.get(segId)
      if (!group) {
        group = []
        segmentGroups.set(segId, group)
      }
      group.push(span)
    }
    for (const group of segmentGroups.values())
      group.sort((a, b) => subsystemOrder.indexOf(a.subsystem) - subsystemOrder.indexOf(b.subsystem))

    const sortedSegments = [...segmentGroups.values()]
      .sort((a, b) => a[0].startTs - b[0].startTs)

    for (const span of llmSpans) {
      rows.push({ type: 'span', span, turn, subsystem: 'llm', y })
      y += ROW_HEIGHT
    }

    for (const group of sortedSegments) {
      for (const span of group) {
        rows.push({ type: 'span', span, turn, subsystem: span.subsystem, y })
        y += ROW_HEIGHT
      }
    }
  }

  return { rows, totalHeight: y, gapAnnotations }
})

function timeToX(ts: number): number {
  const duration = viewEnd.value - viewStart.value
  if (duration <= 0)
    return 0
  return ((ts - viewStart.value) / duration) * chartWidth.value
}

function xToTime(x: number): number {
  const duration = viewEnd.value - viewStart.value
  return viewStart.value + (x / chartWidth.value) * duration
}

function spanBarX(span: IOSpan): number {
  return timeToX(span.startTs)
}

function spanBarWidth(span: IOSpan): number {
  const end = span.endTs ?? performance.now()
  const x1 = timeToX(span.startTs)
  const x2 = timeToX(end)
  return Math.max(x2 - x1, 3)
}

function isClippedLeft(span: IOSpan): boolean {
  return timeToX(span.startTs) < 0 && spanBarX(span) + spanBarWidth(span) > 0
}

function isClippedRight(span: IOSpan): boolean {
  const end = span.endTs ?? performance.now()
  return timeToX(end) > chartWidth.value && timeToX(span.startTs) < chartWidth.value
}

interface EdgeIndicator {
  subsystem: IOSubsystem
  side: 'left' | 'right'
  y: number
  spanId: string
}

const edgeIndicators = computed(() => {
  const indicators: EdgeIndicator[] = []
  const vStart = viewStart.value
  const vEnd = viewEnd.value

  for (const row of layout.value.rows) {
    if (row.type !== 'span')
      continue
    const span = row.span
    const spanEnd = span.endTs ?? performance.now()

    if (spanEnd < vStart) {
      indicators.push({ subsystem: span.subsystem, side: 'left', y: row.y, spanId: span.id })
    }
    else if (span.startTs > vEnd) {
      indicators.push({ subsystem: span.subsystem, side: 'right', y: row.y, spanId: span.id })
    }
  }
  return indicators
})

const ticks = computed(() => {
  const width = chartWidth.value
  if (width <= 0)
    return []
  const vStart = viewStart.value
  const vEnd = viewEnd.value
  const duration = vEnd - vStart
  if (duration <= 0)
    return []

  const targetCount = Math.max(4, Math.floor(width / 120))
  let interval = duration / targetCount
  const mag = 10 ** Math.floor(Math.log10(interval))
  const norm = interval / mag
  if (norm < 1.5)
    interval = mag
  else if (norm < 3.5)
    interval = 2 * mag
  else if (norm < 7.5)
    interval = 5 * mag
  else interval = 10 * mag

  const result: { x: number, label: string }[] = []
  const start = Math.ceil(vStart / interval) * interval
  for (let ts = start; ts <= vEnd; ts += interval) {
    result.push({ x: timeToX(ts), label: fmtMs(ts - props.timeOrigin) })
  }
  return result
})

function minimapSpanX(span: IOSpan): number {
  const range = globalRange.value
  const dur = range.max - range.min
  if (dur <= 0)
    return 0
  return ((span.startTs - range.min) / dur) * chartWidth.value
}

function minimapSpanW(span: IOSpan): number {
  const range = globalRange.value
  const dur = range.max - range.min
  if (dur <= 0)
    return 0
  const end = span.endTs ?? performance.now()
  return Math.max(((end - span.startTs) / dur) * chartWidth.value, 1)
}

const minimapViewportX = computed(() => {
  const range = globalRange.value
  const dur = range.max - range.min
  if (dur <= 0)
    return 0
  return ((viewStart.value - range.min) / dur) * chartWidth.value
})

const minimapViewportW = computed(() => {
  const range = globalRange.value
  const dur = range.max - range.min
  if (dur <= 0)
    return chartWidth.value
  return ((viewEnd.value - viewStart.value) / dur) * chartWidth.value
})

const isDragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartScrollTop = 0
let dragViewStart = 0
let dragViewEnd = 0

function onChartMouseDown(e: MouseEvent) {
  hasUserInteracted = true
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartScrollTop = scrollAreaRef.value?.scrollTop ?? 0
  dragViewStart = viewStart.value
  dragViewEnd = viewEnd.value
  e.preventDefault()
}

function onChartMouseMove(e: MouseEvent) {
  if (!isDragging.value)
    return
  const dx = e.clientX - dragStartX
  const timeDelta = -(dx / chartWidth.value) * (dragViewEnd - dragViewStart)
  setViewport(dragViewStart + timeDelta, dragViewEnd + timeDelta)

  const dy = e.clientY - dragStartY
  if (scrollAreaRef.value)
    scrollAreaRef.value.scrollTop = dragStartScrollTop - dy
}

function onChartMouseUp() {
  isDragging.value = false
}

function onChartWheel(e: WheelEvent) {
  e.preventDefault()
  hasUserInteracted = true
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect)
    return

  const absDx = Math.abs(e.deltaX)
  const absDy = Math.abs(e.deltaY)

  if (absDx > absDy && absDx > 1) {
    const viewDur = viewEnd.value - viewStart.value
    const timeDelta = (e.deltaX / chartWidth.value) * viewDur
    setViewport(viewStart.value + timeDelta, viewEnd.value + timeDelta)
    return
  }

  if (absDy > 1) {
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
    const mouseX = e.clientX - rect.left - LABEL_COL_WIDTH
    const pivot = xToTime(mouseX)
    setViewport(
      pivot - (pivot - viewStart.value) * factor,
      pivot + (viewEnd.value - pivot) * factor,
    )
  }
}

type MinimapDragMode = 'left-handle' | 'right-handle' | 'area-select' | null
let minimapDragMode: MinimapDragMode = null
let minimapDragStartX = 0
let minimapDragStartViewStart = 0
let minimapDragStartViewEnd = 0

const HANDLE_HIT_WIDTH = 8

function minimapHitTest(offsetX: number): 'left-handle' | 'right-handle' | 'area-select' {
  const leftEdge = minimapViewportX.value
  const rightEdge = minimapViewportX.value + minimapViewportW.value
  if (Math.abs(offsetX - leftEdge) <= HANDLE_HIT_WIDTH)
    return 'left-handle'
  if (Math.abs(offsetX - rightEdge) <= HANDLE_HIT_WIDTH)
    return 'right-handle'
  return 'area-select'
}

function onMinimapMouseDown(e: MouseEvent) {
  minimapDragMode = minimapHitTest(e.offsetX)
  minimapDragStartX = e.offsetX
  minimapDragStartViewStart = viewStart.value
  minimapDragStartViewEnd = viewEnd.value

  if (minimapDragMode === 'area-select') {
    const range = globalRange.value
    const dur = range.max - range.min
    const t = range.min + (e.offsetX / chartWidth.value) * dur
    viewStart.value = t
    viewEnd.value = t
  }
  e.preventDefault()
}

function onMinimapMouseMove(e: MouseEvent) {
  if (!minimapDragMode)
    return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, chartWidth.value))
  const range = globalRange.value
  const dur = range.max - range.min
  const t = range.min + (x / chartWidth.value) * dur

  if (minimapDragMode === 'left-handle') {
    setViewport(Math.min(t, minimapDragStartViewEnd - minZoomDuration), minimapDragStartViewEnd)
  }
  else if (minimapDragMode === 'right-handle') {
    setViewport(minimapDragStartViewStart, Math.max(t, minimapDragStartViewStart + minZoomDuration))
  }
  else {
    const t1 = range.min + (minimapDragStartX / chartWidth.value) * dur
    setViewport(Math.min(t1, t), Math.max(t1, t))
  }
}

function onMinimapMouseUp() {
  if (minimapDragMode) {
    if (minimapDragMode === 'area-select' && viewEnd.value - viewStart.value < 1)
      autoFit()
    minimapDragMode = null
  }
}

const minimapCursor = ref<string>('crosshair')
function onMinimapHover(e: MouseEvent) {
  if (minimapDragMode)
    return
  const hit = minimapHitTest(e.offsetX)
  minimapCursor.value = hit === 'left-handle' || hit === 'right-handle' ? 'ew-resize' : 'crosshair'
}

const tooltipStyle = computed(() => {
  if (!hoveredSpan.value)
    return {}
  const { x, y } = hoveredSpan.value
  const maxX = (typeof globalThis.window !== 'undefined' ? globalThis.window.innerWidth : 1920) - 300
  const maxY = (typeof globalThis.window !== 'undefined' ? globalThis.window.innerHeight : 1080) - 120
  return {
    left: `${Math.min(x + 12, maxX)}px`,
    top: `${Math.min(y - 8, maxY)}px`,
  }
})

function onSpanHover(span: IOSpan, turn: IOTurn, e: MouseEvent) {
  hoveredSpan.value = { span, turn, x: e.clientX, y: e.clientY }
}

function onSpanLeave() {
  hoveredSpan.value = null
}

function onSpanClick(span: IOSpan) {
  emit('selectSpan', span.id === props.selectedSpanId ? null : span.id)
}

let hasUserInteracted = false

function autoFit() {
  const { min, max } = globalRange.value
  setViewport(min, max)
  hasUserInteracted = false
}

watch(() => visibleSpans.value.length, (count) => {
  if (count > 0 && !hasUserInteracted)
    autoFit()
})

defineExpose({ autoFit })

function fmtMs(ms: number): string {
  if (ms < 0.01)
    return '0ms'
  if (ms < 1)
    return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000)
    return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function spanDuration(span: IOSpan): string {
  if (!span.endTs)
    return 'live'
  return fmtMs(span.endTs - span.startTs)
}

function spanLabel(span: IOSpan): string {
  const subsystemLabel = SUBSYSTEM_CONFIG_MAP.get(span.subsystem)?.label ?? ''
  return `${subsystemLabel} / ${span.name}`
}
</script>

<template>
  <div
    ref="containerRef"
    :class="['flex-1 flex flex-col overflow-hidden', 'select-none']"
    @mousemove="onChartMouseMove"
    @mouseup="onChartMouseUp"
    @mouseleave="onChartMouseUp"
  >
    <!-- ═══ Minimap ═══ -->
    <div
      :class="[
        'relative flex-shrink-0',
        'border-b border-neutral-200 dark:border-neutral-700',
        'bg-neutral-50 dark:bg-neutral-900',
      ]"
      :style="{ height: `${MINIMAP_HEIGHT}px`, marginLeft: `${LABEL_COL_WIDTH}px`, cursor: minimapCursor }"
      @mousedown="onMinimapMouseDown"
      @mousemove="(e) => { onMinimapMouseMove(e); onMinimapHover(e) }"
      @mouseup="onMinimapMouseUp"
      @mouseleave="onMinimapMouseUp"
    >
      <div
        v-for="{ span } in visibleSpans"
        :key="`mm-${span.id}`"
        :class="['absolute rounded-sm pointer-events-none']"
        :style="{
          left: `${minimapSpanX(span)}px`,
          width: `${minimapSpanW(span)}px`,
          top: '4px',
          height: `${MINIMAP_HEIGHT - 8}px`,
          backgroundColor: SUBSYSTEM_CONFIG_MAP.get(span.subsystem)?.color ?? '#888',
          opacity: 0.6,
        }"
      />
      <!-- Viewport selection -->
      <div
        :class="['absolute top-0 bottom-0 bg-blue-400/10 pointer-events-none']"
        :style="{ left: `${minimapViewportX}px`, width: `${Math.max(minimapViewportW, 2)}px` }"
      />
      <!-- Left handle -->
      <div
        :class="['absolute top-0 bottom-0 w-1 bg-blue-400 pointer-events-none']"
        :style="{ left: `${minimapViewportX}px` }"
      >
        <div :class="['absolute top-1/2 -translate-y-1/2 -left-0.5 w-2 h-4 rounded-sm bg-blue-400']" />
      </div>
      <!-- Right handle -->
      <div
        :class="['absolute top-0 bottom-0 w-1 bg-blue-400 pointer-events-none']"
        :style="{ left: `${minimapViewportX + Math.max(minimapViewportW, 2)}px` }"
      >
        <div :class="['absolute top-1/2 -translate-y-1/2 -left-0.5 w-2 h-4 rounded-sm bg-blue-400']" />
      </div>
      <!-- Reset button -->
      <button
        v-if="viewStart !== globalRange.min || viewEnd !== globalRange.max"
        :class="[
          'absolute right-1 top-1 z-10 pointer-events-auto',
          'text-2.5 px-1.5 py-0.5 rounded',
          'bg-neutral-200 dark:bg-neutral-700',
          'hover:bg-neutral-300 dark:hover:bg-neutral-600',
          'text-neutral-600 dark:text-neutral-300',
        ]"
        @click.stop="autoFit()"
      >
        Reset zoom
      </button>
    </div>

    <!-- ═══ Time Axis ═══ -->
    <div
      :class="['relative flex-shrink-0 border-b border-neutral-200 dark:border-neutral-700']"
      :style="{ height: `${TIME_AXIS_HEIGHT}px`, marginLeft: `${LABEL_COL_WIDTH}px` }"
    >
      <div
        v-for="(tick, i) in ticks"
        :key="i"
        :class="['absolute top-0 bottom-0 flex items-end pb-1']"
        :style="{ left: `${tick.x}px` }"
      >
        <span :class="['text-2.5 text-neutral-400 whitespace-nowrap -translate-x-1/2']">{{ tick.label }}</span>
      </div>
    </div>

    <!-- ═══ Main Waterfall ═══ -->
    <div
      ref="scrollAreaRef"
      :class="['flex-1 overflow-y-auto relative', isDragging ? 'cursor-grabbing' : 'cursor-grab']"
      @mousedown="onChartMouseDown"
      @wheel="onChartWheel"
    >
      <div :style="{ height: `${layout.totalHeight}px`, position: 'relative' }">
        <template v-for="(row, ri) in layout.rows" :key="row.type === 'span' ? row.span.id : `row-${ri}`">
          <!-- ─── Turn Separator ─── -->
          <div
            v-if="row.type === 'turn-separator'"
            :class="['absolute left-0 right-0 bg-neutral-200 dark:bg-neutral-700']"
            :style="{ top: `${row.y}px`, height: '1px' }"
          />

          <!-- ─── Span Row ─── -->
          <div
            v-else-if="row.type === 'span'"
            :class="[
              'absolute left-0 right-0 flex items-center',
              'border-b border-neutral-50 dark:border-neutral-800/50',
              row.span.id === selectedSpanId
                ? 'bg-blue-50 dark:bg-blue-950/30'
                : hoveredTurnId === row.turn.id
                  ? 'bg-neutral-50/80 dark:bg-neutral-800/20'
                  : '',
            ]"
            :style="{ top: `${row.y}px`, height: `${ROW_HEIGHT}px` }"
            @mouseenter="hoveredTurnId = row.turn.id"
            @mouseleave="hoveredTurnId = null"
          >
            <!-- Row label -->
            <div
              :class="['flex-shrink-0 flex items-center gap-1 px-3 text-2.5 text-neutral-500 truncate']"
              :style="{ width: `${LABEL_COL_WIDTH}px` }"
            >
              <div
                :class="['w-1.5 h-1.5 rounded-sm flex-shrink-0']"
                :style="{ backgroundColor: SUBSYSTEM_CONFIG_MAP.get(row.subsystem)?.color }"
              />
              <span :class="['truncate']">{{ spanLabel(row.span) }}</span>
            </div>

            <!-- Span bar area -->
            <div :class="['flex-1 relative h-full overflow-hidden']">
              <!-- Grid lines -->
              <div
                v-for="(tick, ti) in ticks"
                :key="ti"
                :class="['absolute top-0 bottom-0 w-px bg-neutral-100 dark:bg-neutral-800/60']"
                :style="{ left: `${tick.x}px` }"
              />

              <!-- Span bar -->
              <div
                :class="[
                  'absolute rounded-sm cursor-pointer',
                  row.span.id === selectedSpanId ? 'ring-2 ring-white dark:ring-neutral-900 ring-offset-1' : '',
                ]"
                :style="{
                  left: `${spanBarX(row.span)}px`,
                  width: `${spanBarWidth(row.span)}px`,
                  top: `${ROW_PADDING}px`,
                  height: `${ROW_HEIGHT - ROW_PADDING * 2}px`,
                  backgroundColor: SUBSYSTEM_CONFIG_MAP.get(row.subsystem)?.color ?? '#888',
                  opacity: row.span.endTs ? 0.85 : 0.5,
                }"
                @mouseenter="onSpanHover(row.span, row.turn, $event)"
                @mouseleave="onSpanLeave"
                @click.stop="onSpanClick(row.span)"
              >
                <!-- TTFT marker -->
                <div
                  v-if="row.span.meta.firstTokenTs"
                  :class="['absolute top-0 bottom-0 w-0.5 bg-white/60']"
                  :style="{ left: `${timeToX(row.span.meta.firstTokenTs) - spanBarX(row.span)}px` }"
                />
                <!-- Duration inside bar -->
                <span
                  v-if="spanBarWidth(row.span) > 44"
                  :class="['absolute inset-0 flex items-center px-1.5 text-2.5 text-white font-medium truncate pointer-events-none']"
                >
                  {{ spanDuration(row.span) }}
                </span>
                <!-- Fade gradient on left edge when clipped -->
                <div
                  v-if="isClippedLeft(row.span)"
                  :class="['absolute left-0 top-0 bottom-0 w-4 pointer-events-none']"
                  :style="{ background: `linear-gradient(to right, ${SUBSYSTEM_CONFIG_MAP.get(row.subsystem)?.color ?? '#888'}, transparent)` }"
                />
                <!-- Fade gradient on right edge when clipped -->
                <div
                  v-if="isClippedRight(row.span)"
                  :class="['absolute right-0 top-0 bottom-0 w-4 pointer-events-none']"
                  :style="{ background: `linear-gradient(to left, ${SUBSYSTEM_CONFIG_MAP.get(row.subsystem)?.color ?? '#888'}, transparent)` }"
                />
              </div>

              <!-- Duration outside bar -->
              <span
                v-if="spanBarWidth(row.span) <= 44 && row.span.endTs"
                :class="['absolute text-2.5 whitespace-nowrap text-neutral-400 pointer-events-none']"
                :style="{
                  left: `${spanBarX(row.span) + spanBarWidth(row.span) + 4}px`,
                  top: `${ROW_PADDING}px`,
                  lineHeight: `${ROW_HEIGHT - ROW_PADDING * 2}px`,
                }"
              >
                {{ spanDuration(row.span) }}
              </span>

              <!-- In-flight pulse -->
              <div
                v-if="!row.span.endTs"
                :class="['absolute rounded-sm animate-pulse']"
                :style="{
                  left: `${spanBarX(row.span) + spanBarWidth(row.span) - 4}px`,
                  width: '8px',
                  top: `${ROW_PADDING}px`,
                  height: `${ROW_HEIGHT - ROW_PADDING * 2}px`,
                  backgroundColor: SUBSYSTEM_CONFIG_MAP.get(row.subsystem)?.color ?? '#888',
                  opacity: 0.3,
                }"
              />
            </div>
          </div>
        </template>

        <!-- ─── Edge Indicators ─── -->
        <template v-for="ind in edgeIndicators" :key="`edge-${ind.spanId}`">
          <!-- Left edge: span is off-screen to the left -->
          <div
            v-if="ind.side === 'left'"
            :class="['absolute pointer-events-none']"
            :style="{
              left: `${LABEL_COL_WIDTH}px`,
              top: `${ind.y + ROW_PADDING}px`,
              height: `${ROW_HEIGHT - ROW_PADDING * 2}px`,
            }"
          >
            <div
              :class="['w-0 h-0']"
              :style="{
                borderTop: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                borderBottom: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                borderRight: `6px solid ${SUBSYSTEM_CONFIG_MAP.get(ind.subsystem)?.color ?? '#888'}`,
                opacity: 0.5,
              }"
            />
          </div>
          <!-- Right edge: span is off-screen to the right -->
          <div
            v-if="ind.side === 'right'"
            :class="['absolute pointer-events-none']"
            :style="{
              right: '0px',
              top: `${ind.y + ROW_PADDING}px`,
              height: `${ROW_HEIGHT - ROW_PADDING * 2}px`,
            }"
          >
            <div
              :class="['w-0 h-0']"
              :style="{
                borderTop: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                borderBottom: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                borderLeft: `6px solid ${SUBSYSTEM_CONFIG_MAP.get(ind.subsystem)?.color ?? '#888'}`,
                opacity: 0.5,
              }"
            />
          </div>
        </template>

        <!-- ─── Gap Annotations ─── -->
        <div
          v-for="(gap, gi) in layout.gapAnnotations"
          :key="`gap-${gi}`"
          :class="['absolute pointer-events-none flex items-center']"
          :style="{
            left: `${LABEL_COL_WIDTH + timeToX(gap.startTs)}px`,
            width: `${Math.max(timeToX(gap.endTs) - timeToX(gap.startTs), 20)}px`,
            top: `${gap.y}px`,
            height: `${ROW_HEIGHT}px`,
          }"
        >
          <span
            :class="[
              'text-2.5 px-1 py-0.5 rounded whitespace-nowrap mx-auto',
              gap.durationMs > GAP_WARN_THRESHOLD_MS
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500',
            ]"
          >
            +{{ fmtMs(gap.durationMs) }}
          </span>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="visibleSpans.length === 0"
        :class="['absolute inset-0 flex flex-col items-center justify-center text-neutral-400 text-sm']"
      >
        <div class="i-solar:chart-2-bold-duotone mb-3 h-16 w-16 opacity-20" />
        <span :class="['font-medium']">No trace data</span>
        <span :class="['text-xs mt-1 text-neutral-400/70']">Start recording and trigger a voice conversation</span>
      </div>
    </div>

    <!-- ═══ Tooltip ═══ -->
    <Teleport to="body">
      <div
        v-if="hoveredSpan"
        :class="[
          'fixed z-[9999] pointer-events-none',
          'px-3 py-2 rounded-lg shadow-xl',
          'bg-neutral-800 dark:bg-neutral-950 text-white',
          'text-xs max-w-72 border border-neutral-700',
        ]"
        :style="tooltipStyle"
      >
        <div :class="['flex items-center gap-1.5 mb-1']">
          <div :class="['w-2 h-2 rounded-sm']" :style="{ backgroundColor: SUBSYSTEM_CONFIG_MAP.get(hoveredSpan.span.subsystem)?.color }" />
          <span :class="['font-medium']">{{ SUBSYSTEM_CONFIG_MAP.get(hoveredSpan.span.subsystem)?.label }}</span>
          <span :class="['text-neutral-400']">{{ hoveredSpan.span.name }}</span>
        </div>
        <div :class="['flex items-center gap-2 text-neutral-300']">
          <span v-if="hoveredSpan.span.endTs">{{ fmtMs(hoveredSpan.span.endTs - hoveredSpan.span.startTs) }}</span>
          <span v-else :class="['text-amber-400']">In progress...</span>
          <span v-if="hoveredSpan.span.meta.ttftMs" :class="['text-purple-300']">TTFT {{ fmtMs(hoveredSpan.span.meta.ttftMs) }}</span>
        </div>
        <div v-if="hoveredSpan.span.meta.text" :class="['text-neutral-400 mt-1 break-words']">
          {{ hoveredSpan.span.meta.text.length > 80 ? `${hoveredSpan.span.meta.text.slice(0, 80)}…` : hoveredSpan.span.meta.text }}
        </div>
        <div v-if="hoveredSpan.span.meta.chunk_reason" :class="['text-amber-300/80 mt-0.5']">
          chunk: {{ hoveredSpan.span.meta.chunk_reason }}
        </div>
      </div>
    </Teleport>
  </div>
</template>
