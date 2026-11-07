<script setup lang="ts">
import type { ListedItem, TimelineCanvasFrame } from '@proj-airi/ui-timeline/headless'

import type {
  Live2DMotionEditableTrackId,
  Live2DMotionKeyframe,
  Live2DMotionOverlay,
  Live2DMotionProject,
} from '../composables/keyframes'
import type { MotionTimelineItem, MotionTrackRow } from '../composables/timeline-geometry'

import { timeToX, xToTime } from '@proj-airi/timeline-canvas'
import { useTheme } from '@proj-airi/ui'
import { injectTimelineRootContext, TimelineCanvas, TimelineItemList, TimelineLanes } from '@proj-airi/ui-timeline/headless'
import { useRafFn } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  createLive2DMotionId,
  getLive2DMotionTrackRange,
  isLive2DMotionViewTargetTrackId,
  live2dMotionEditableTrackIds,
} from '../composables/keyframes'
import { createMotionTrackModel, drawMotionTrack, motionTimelinePalettes } from '../composables/timeline-draw'
import {
  fullMotionView,
  keyframeAt,
  keyframeFromPointer,
  motionGraphGeometry,
  motionTrackAt,
  overlayCurveAt,
  overlayEdgeAt,
  visibleMotionRange,
} from '../composables/timeline-geometry'

/**
 * The lanes of the motion timeline: one canvas that draws every visible track, the hidden item list, and the pointer
 * layer that edits the active track.
 *
 * The lanes of `@proj-airi/ui-timeline` pan on a drag and move the playhead on a click. The pointer layer takes a press
 * on a keyframe or on an overlay edge before the lanes see it, so that press drags the keyframe or the edge instead. A
 * double click adds a keyframe to the selected overlay, or removes the keyframe under the pointer.
 */
const props = defineProps<{
  project: Live2DMotionProject
  rows: MotionTrackRow[]
  /** The height of all rows, in CSS pixels. */
  contentHeight: number
  activeTrack: Live2DMotionEditableTrackId
  selectedOverlayId?: string
  disabled?: boolean
  trackLabel: (trackId: Live2DMotionEditableTrackId) => string
}>()
const emit = defineEmits<{
  activate: [trackId: Live2DMotionEditableTrackId]
  updateOverlay: [overlayId: string, patch: Partial<Live2DMotionOverlay>, commit: boolean]
  addPoint: [overlayId: string, point: Live2DMotionKeyframe]
  movePoint: [overlayId: string, pointId: string, atMs: number, value: number, commit: boolean]
  removePoint: [overlayId: string, pointId: string]
  /** The part of the motion that shows right of the label column. It changes on a zoom, a pan, or a reset. */
  viewport: [viewport: readonly [number, number]]
}>()

const context = injectTimelineRootContext<MotionTimelineItem>()
const { isDark } = useTheme()
const { t } = useI18n()
const layer = useTemplateRef<HTMLDivElement>('layer')

/** The canvas content of each track. It rebuilds only when the project changes, not when the active track changes. */
const models = computed(() => new Map(live2dMotionEditableTrackIds.map(trackId => [trackId, createMotionTrackModel(props.project, trackId)])))
const activeRow = computed(() => props.rows.find(row => row.trackId === props.activeTrack))
/** The overlay that the pointer layer edits: the selected overlay, when it belongs to the active track. */
const editedOverlay = computed(() => props.project.overlays.find(overlay => overlay.id === props.selectedOverlayId && overlay.trackId === props.activeTrack))

function draw(ctx: CanvasRenderingContext2D, frame: TimelineCanvasFrame) {
  const palette = motionTimelinePalettes[isDark.value ? 'dark' : 'light']
  const { view, width, height, scrollTop } = frame

  ctx.fillStyle = palette.grid
  for (const tick of context.ticks.value)
    ctx.fillRect(Math.round(timeToX(view, tick.time)), 0, 1, height)

  for (const row of props.rows) {
    const top = row.top - scrollTop
    if (top >= height)
      break
    const model = models.value.get(row.trackId)
    if (top + row.height <= 0 || !model)
      continue
    drawMotionTrack(ctx, model, {
      view,
      row: { top, height: row.height },
      graph: motionGraphGeometry(row, scrollTop),
      width,
      labelLeft: context.labelWidth.value,
    }, { active: row.trackId === props.activeTrack, selectedOverlayId: props.selectedOverlayId }, palette)
  }

  const cursor = context.cursor.value
  if (cursor !== undefined) {
    ctx.fillStyle = palette.playhead
    ctx.fillRect(Math.round(timeToX(view, cursor) - 1), 0, 2, height)
  }
}

/**
 * The view state that the frame loop owns. A reset waits for a frame, because the lanes width and the new duration
 * are known only after a render. The last viewport keeps the `viewport` event to real changes.
 */
let pendingReset = true
let lastViewport: readonly [number, number] | undefined

useRafFn(() => {
  const width = context.lanesWidth.value
  if (width <= 0)
    return
  if (pendingReset) {
    const next = fullMotionView(props.project.durationMs, width, context.labelWidth.value)
    context.setView(next.start, next.end)
    pendingReset = false
  }
  const viewport = visibleMotionRange(context.currentView(), context.labelWidth.value, props.project.durationMs)
  if (lastViewport?.[0] === viewport[0] && lastViewport[1] === viewport[1])
    return
  lastViewport = viewport
  emit('viewport', viewport)
})

/** Fits the whole motion right of the label column in the next frame. */
function resetView() {
  pendingReset = true
}

defineExpose({ resetView })

/** A pointer position on the canvas, and the track row under it. */
interface PointerHit {
  x: number
  y: number
  row: MotionTrackRow
}

function pointerPosition(event: MouseEvent): { x: number, y: number } | undefined {
  const rect = layer.value?.getBoundingClientRect()
  return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : undefined
}

function hitAt(event: MouseEvent): PointerHit | undefined {
  const position = pointerPosition(event)
  const row = position && motionTrackAt(props.rows, position.y + context.scrollTop.value)
  return position && row ? { ...position, row } : undefined
}

function graphOf(row: MotionTrackRow) {
  return {
    view: context.currentView(),
    geometry: motionGraphGeometry(row, context.scrollTop.value),
    range: getLive2DMotionTrackRange(row.trackId),
  }
}

/** What a press on the active track drags: a keyframe of the selected overlay, or one end of its span. */
type EditTarget = { kind: 'keyframe', pointId: string } | { kind: 'edge', edge: 'start' | 'end' }

/** The keyframe or the overlay edge under the pointer on the active track, the targets that a press drags. */
function editTargetAt(hit: PointerHit): EditTarget | undefined {
  const overlay = editedOverlay.value
  if (props.disabled || !overlay || hit.row.trackId !== props.activeTrack)
    return undefined
  const { view, geometry, range } = graphOf(hit.row)
  const pointId = keyframeAt(overlay.points, view, geometry, range, hit.x, hit.y)
  if (pointId !== undefined)
    return { kind: 'keyframe', pointId }
  // A view-target overlay always spans the whole motion, so it has no edges to drag.
  const edge = isLive2DMotionViewTargetTrackId(overlay.trackId) ? undefined : overlayEdgeAt(overlay, view, hit.x)
  return edge ? { kind: 'edge', edge } : undefined
}

/**
 * The drag in progress. It starts on a press on an edit target and ends on the release or cancel of the same
 * pointer. Moves emit uncommitted changes. The release commits one history entry, only when the pointer moved.
 */
let edit: { pointerId: number, overlayId: string, target: EditTarget, moved: boolean } | undefined

function setCursor(cursor: string) {
  if (layer.value)
    layer.value.style.cursor = cursor
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0)
    return
  const hit = hitAt(event)
  if (!hit)
    return
  if (hit.row.trackId !== props.activeTrack) {
    // The press still reaches the lanes, so a click on another track also moves the playhead.
    emit('activate', hit.row.trackId)
    return
  }
  const target = editTargetAt(hit)
  const overlay = editedOverlay.value
  if (!target || !overlay)
    return
  // The lanes must not see this press, or they pan the view and move the playhead on release.
  event.stopPropagation()
  layer.value?.setPointerCapture(event.pointerId)
  edit = { pointerId: event.pointerId, overlayId: overlay.id, target, moved: false }
  setCursor(target.kind === 'keyframe' ? 'grabbing' : 'ew-resize')
}

function onPointerMove(event: PointerEvent) {
  if (!edit || event.pointerId !== edit.pointerId) {
    if (event.buttons === 0)
      setCursor(hoverCursor(event))
    return
  }
  event.stopPropagation()
  const overlay = props.project.overlays.find(item => item.id === edit!.overlayId)
  const position = pointerPosition(event)
  const row = activeRow.value
  if (!overlay || !position || !row)
    return
  edit.moved = true
  const { view, geometry, range } = graphOf(row)
  if (edit.target.kind === 'keyframe') {
    const next = keyframeFromPointer(view, geometry, range, position.x, position.y)
    const atMs = Math.min(overlay.endMs, Math.max(overlay.startMs, next.atMs))
    emit('movePoint', overlay.id, edit.target.pointId, atMs, next.value, false)
    return
  }
  const atMs = Math.min(props.project.durationMs, Math.max(0, Math.round(xToTime(view, position.x))))
  const patch = edit.target.edge === 'start'
    ? { startMs: Math.min(overlay.endMs - 1, atMs) }
    : { endMs: Math.max(overlay.startMs + 1, atMs) }
  emit('updateOverlay', overlay.id, patch, false)
}

function onPointerUp(event: PointerEvent) {
  if (!edit || event.pointerId !== edit.pointerId)
    return
  event.stopPropagation()
  const done = edit
  edit = undefined
  setCursor(hoverCursor(event))
  const overlay = props.project.overlays.find(item => item.id === done.overlayId)
  if (!done.moved || !overlay)
    return
  if (done.target.kind === 'edge') {
    emit('updateOverlay', overlay.id, {}, true)
    return
  }
  const pointId = done.target.pointId
  const point = overlay.points.find(item => item.id === pointId)
  if (point)
    emit('movePoint', overlay.id, point.id, point.atMs, point.value, true)
}

function onDoubleClick(event: MouseEvent) {
  const hit = hitAt(event)
  const overlay = editedOverlay.value
  if (!hit || !overlay || props.disabled || hit.row.trackId !== props.activeTrack)
    return
  const target = editTargetAt(hit)
  if (target?.kind === 'keyframe') {
    emit('removePoint', overlay.id, target.pointId)
    return
  }
  // A double click on an edge handle is a press on the handle, not a new keyframe.
  if (target?.kind === 'edge')
    return
  const { view, geometry, range } = graphOf(hit.row)
  const point = keyframeFromPointer(view, geometry, range, hit.x, hit.y)
  if (point.atMs < overlay.startMs || point.atMs > overlay.endMs)
    return
  emit('addPoint', overlay.id, { id: createLive2DMotionId(), ...point })
}

/** The overlay whose curve is under the pointer, for a click that selects it. */
function overlayAt(hit: PointerHit) {
  const { view, geometry, range } = graphOf(hit.row)
  const overlays = props.project.overlays.filter(overlay => overlay.trackId === hit.row.trackId)
  return overlayCurveAt(overlays, view, geometry, range, hit.x, hit.y)
}

function hoverCursor(event: MouseEvent): string {
  const hit = hitAt(event)
  if (!hit)
    return 'default'
  if (hit.row.trackId !== props.activeTrack)
    return 'pointer'
  const target = editTargetAt(hit)
  if (target)
    return target.kind === 'keyframe' ? 'grab' : 'ew-resize'
  return overlayAt(hit) ? 'pointer' : 'crosshair'
}

/** The item under a click of the lanes. A click on an overlay curve selects the overlay instead of moving the playhead. */
function hitItem(event: PointerEvent): MotionTimelineItem | undefined {
  const hit = hitAt(event)
  const overlay = hit && overlayAt(hit)
  return overlay ? { key: overlay.id, kind: 'overlay', overlayId: overlay.id, trackId: overlay.trackId } : undefined
}

/** The overlays of every track and the keyframes of the selected overlay, for keyboards and screen readers. */
const listedItems = computed(() => {
  const items: ListedItem<MotionTimelineItem>[] = []
  props.rows.forEach((row, index) => {
    for (const overlay of props.project.overlays) {
      if (overlay.trackId !== row.trackId)
        continue
      const viewTarget = isLive2DMotionViewTargetTrackId(overlay.trackId)
      items.push({
        target: { key: overlay.id, kind: 'overlay', overlayId: overlay.id, trackId: overlay.trackId },
        label: viewTarget ? props.trackLabel(overlay.trackId) : `${overlay.name} · ${overlay.blendMode}`,
        row: index,
        start: overlay.startMs,
        end: overlay.endMs,
      })
      if (overlay.id !== editedOverlay.value?.id)
        continue
      for (const point of overlay.points) {
        items.push({
          target: { key: `${overlay.id}:${point.id}`, kind: 'keyframe', overlayId: overlay.id, trackId: overlay.trackId },
          label: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.keyframe-item', {
            time: `${(point.atMs / 1000).toFixed(2)}s`,
            value: point.value.toFixed(2),
          }),
          row: index,
          start: point.atMs,
          end: point.atMs,
        })
      }
    }
  })
  return items
})

function onItemFocus(item: ListedItem<MotionTimelineItem>) {
  const row = props.rows[item.row]
  if (row)
    context.reveal({ start: item.start, end: item.end, top: row.top, height: row.height })
}
</script>

<template>
  <TimelineLanes :hit-test="hitItem" :class="['relative touch-none']" :style="{ height: `${contentHeight}px` }">
    <!--
      One canvas over the visible part of the lanes. It moves with the scroll position, so it stays in view. The clip
      keeps it out of the scroll size, so it cannot grow the scroll area.
    -->
    <div :class="['absolute inset-0 overflow-hidden pointer-events-none']">
      <div
        ref="layer"
        :class="['absolute inset-x-0 pointer-events-auto cursor-crosshair']"
        :style="{ top: `${context.scrollTop.value}px`, height: `${context.viewportHeight.value}px` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="setCursor('default')"
        @dblclick="onDoubleClick"
      >
        <TimelineCanvas :draw="draw" :class="['block size-full']" />
        <TimelineItemList
          :items="listedItems"
          :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.timeline-items')"
          @focus="onItemFocus"
        />
      </div>
    </div>
  </TimelineLanes>
</template>
