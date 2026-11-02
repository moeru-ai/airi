<script setup lang="ts">
import type { CapsuleContent, CapsuleState, TimelineRowKind, TimelineRowLayer } from '@proj-airi/timeline-canvas'

import { capsuleStyle, drawTimelineRow, IntervalColumn, LANE_LAYERS, laneCapsuleStyle, laneLayerOf, PointColumn, ROW_GEOMETRY, SeriesPyramid, StyleTable } from '@proj-airi/timeline-canvas'
import { useTheme } from '@proj-airi/ui'
import { useDevicePixelRatio, useElementSize, useRafFn } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'

/** One capsule: its time range and its state. An undefined end is open work that draws to `now`. */
export interface PreviewItem extends CapsuleState {
  start: number
  end?: number
  /** Only for a track that labels its items, for example with tool names. */
  label?: string
}

export interface PreviewSeries {
  times: number[]
  values: number[]
}

/** A series inside the capsules of the row. See `CapsuleContent` of timeline-canvas. */
export type PreviewContent
  = | { kind: 'waveform', level: PreviewSeries, intensity?: PreviewSeries }
    | { kind: 'chart', series: PreviewSeries, range?: [number, number], threshold?: number }

/**
 * One row of the timeline, from plain data, for stories and visual checks.
 *
 * It draws with `drawTimelineRow`, the function that `Timeline` draws its rows with, so a story shows what a timeline
 * draws. A `lane` row puts its items in the lane layers, with failures on top in red.
 * Open work redraws each frame, so its shimmer moves.
 */
const props = withDefaults(defineProps<{
  items?: PreviewItem[]
  /** Instants that belong to no item. */
  points?: { time: number, color: string }[]
  content?: PreviewContent
  /** @default 'detail' */
  kind?: TimelineRowKind
  /** The visible window in milliseconds. */
  view?: { start: number, end: number }
  now?: number
  /** @default the row height of `Timeline` for the kind and the content */
  height?: number
}>(), { items: () => [], points: () => [], kind: 'detail', view: () => ({ start: 0, end: 1000 }) })

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const { width } = useElementSize(canvas)
const { pixelRatio } = useDevicePixelRatio()
const { isDark } = useTheme()

const rowHeight = computed(() => props.height ?? (props.kind === 'lane' ? ROW_GEOMETRY.height.lane : props.content ? ROW_GEOMETRY.height.content : ROW_GEOMETRY.height.detail))

function pyramidOf(series: PreviewSeries): SeriesPyramid {
  const pyramid = new SeriesPyramid()
  pyramid.appendMany(series.times, series.values)
  return pyramid
}

const row = computed(() => {
  const table = new StyleTable()
  const labelled = props.items.some(item => item.label !== undefined)
  // A detail row has one layer. A lane row has the layers of an entity lane, so active work covers the others.
  const lane = props.kind === 'lane'
  const groups = lane ? LANE_LAYERS.map(layer => props.items.filter(item => laneLayerOf(item) === layer)) : [props.items]
  const layers: TimelineRowLayer[] = groups.map((items) => {
    const column = new IntervalColumn()
    const labels: (string | undefined)[] = []
    for (const item of [...items].sort((a, b) => a.start - b.start)) {
      const state = { ...item, open: item.open ?? item.end === undefined }
      const index = column.append(item.start, item.end, table.index(lane ? laneCapsuleStyle(state) : capsuleStyle(state)), String(labels.length))
      labels.splice(index, 0, item.label)
    }
    return { column, label: labelled ? (index: number) => labels[index] : undefined }
  })
  const points = new PointColumn()
  for (const point of props.points)
    points.append(point.time, table.index({ color: point.color }), String(point.time))

  const content: CapsuleContent | undefined = props.content?.kind === 'waveform'
    ? { kind: 'waveform', level: pyramidOf(props.content.level), intensity: props.content.intensity && pyramidOf(props.content.intensity) }
    : props.content?.kind === 'chart'
      ? { kind: 'chart', series: pyramidOf(props.content.series), range: props.content.range, threshold: props.content.threshold }
      : undefined
  return { styles: table.styles, layers, points, content }
})

function draw() {
  const element = canvas.value
  const ctx = element?.getContext('2d')
  if (!element || !ctx || width.value <= 0)
    return
  const ratio = pixelRatio.value
  element.width = Math.round(width.value * ratio)
  element.height = Math.round(rowHeight.value * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width.value, rowHeight.value)
  drawTimelineRow(ctx, row.value, {
    view: { ...props.view, width: width.value },
    kind: props.kind,
    top: 0,
    height: rowHeight.value,
    now: props.now,
    time: performance.now(),
    text: isDark.value ? '#e5e5e5' : '#404040',
  })
}

useRafFn(draw)
</script>

<template>
  <canvas ref="canvas" :class="['block w-full']" :style="{ height: `${rowHeight}px` }" />
</template>
