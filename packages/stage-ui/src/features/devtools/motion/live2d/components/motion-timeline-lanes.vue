<script setup lang="ts">
import type { TimelineView } from '@proj-airi/timeline-canvas'

import type {
  Live2DMotionEditableTrackId,
  Live2DMotionKeyframe,
  Live2DMotionOverlay,
  Live2DMotionProject,
} from '../composables/keyframes'
import type { MotionTimelineItem, MotionTrackRow } from '../composables/timeline-geometry'

import { timeToX, xToTime } from '@proj-airi/timeline-canvas'
import { injectTimelineRootContext, TimelineLanes } from '@proj-airi/ui-timeline/headless'
import { useRafFn } from '@vueuse/core'
import { curveLinear, curveStepAfter, line } from 'd3'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  createLive2DMotionId,
  getLive2DMotionCompositePoints,
  getLive2DMotionSourcePoints,
  isLive2DMotionViewTargetTrackId,
} from '../composables/keyframes'
import { fullMotionView, motionOverlayColor, motionValueScale, visibleMotionRange } from '../composables/timeline-geometry'

/**
 * The lanes of the motion timeline: one SVG with a row for each track.
 *
 * The lanes of `@proj-airi/ui-timeline` pan on a drag, zoom on the wheel, and move the playhead on a click. A press on
 * a keyframe or an overlay edge stops there, so it drags that target instead. A double click on the active track adds
 * a keyframe to the selected overlay. A double click on a keyframe removes it.
 */
const props = defineProps<{
  project: Live2DMotionProject
  rows: MotionTrackRow[]
  /** The height of all rows, in CSS pixels. */
  contentHeight: number
  activeTrack: Live2DMotionEditableTrackId
  selectedOverlayId?: string
  disabled?: boolean
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
const { t } = useI18n()
const svg = useTemplateRef<SVGSVGElement>('svg')

/** The view of the timeline root. The root moves its view without a render, so each frame copies it for the SVG. */
const view = shallowRef<TimelineView>(context.currentView())
/** The overlay that the active track edits: the selected overlay, when it belongs to the active track. */
const editedOverlay = computed(() => props.project.overlays.find(overlay => overlay.id === props.selectedOverlayId && overlay.trackId === props.activeTrack))

/** A reset waits for a frame, because the lanes width is known only after a render. */
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
  const current = context.currentView()
  if (current.start !== view.value.start || current.end !== view.value.end || current.width !== view.value.width)
    view.value = current
  const viewport = visibleMotionRange(current, context.labelWidth.value, props.project.durationMs)
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

function x(atMs: number) {
  return timeToX(view.value, atMs)
}

/** What each row draws. The paths follow the view, so they rebuild on each pan or zoom. */
const tracks = computed(() => props.rows.map((row) => {
  const y = motionValueScale(row)
  const viewTarget = isLive2DMotionViewTargetTrackId(row.trackId)
  // The source is a dense recording. Keyframe curves of a view-target track hold each key until the next one.
  const source = line<Live2DMotionKeyframe>().x(point => x(point.atMs)).y(point => y(point.value))
  const steps = line<Live2DMotionKeyframe>().x(point => x(point.atMs)).y(point => y(point.value)).curve(viewTarget ? curveStepAfter : curveLinear)
  return {
    row,
    y,
    viewTarget,
    zeroY: y.domain()[0]! < 0 ? y(0) : undefined,
    source: source(getLive2DMotionSourcePoints(props.project, row.trackId)) ?? '',
    composite: steps(getLive2DMotionCompositePoints(props.project, row.trackId)) ?? '',
    overlays: props.project.overlays
      .filter(overlay => overlay.trackId === row.trackId)
      .map(overlay => ({ overlay, color: motionOverlayColor(props.project, overlay.id), path: steps(overlay.points) ?? '' })),
  }
}))
const activeTrackView = computed(() => tracks.value.find(track => track.row.trackId === props.activeTrack))

/** The keyframe time and value under a pointer on the active track. The value clamps to the track range. */
function pointAt(event: MouseEvent): { atMs: number, value: number } | undefined {
  const rect = svg.value?.getBoundingClientRect()
  const track = activeTrackView.value
  if (!rect || !track)
    return undefined
  return {
    atMs: Math.round(xToTime(view.value, event.clientX - rect.left)),
    value: track.y.invert(event.clientY - rect.top - track.row.top),
  }
}

/** The drag of a keyframe or an overlay edge. Moves emit uncommitted changes. The release commits one history entry. */
let drag: { pointerId: number, overlayId: string, target: { pointId: string } | { edge: 'start' | 'end' }, moved: boolean } | undefined

function startDrag(event: PointerEvent, overlayId: string, target: { pointId: string } | { edge: 'start' | 'end' }) {
  if (props.disabled || event.button !== 0)
    return
  // The lanes must not see this press, or they pan the view and move the playhead on release.
  event.stopPropagation()
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  drag = { pointerId: event.pointerId, overlayId, target, moved: false }
}

function moveDrag(event: PointerEvent) {
  const overlay = drag && event.pointerId === drag.pointerId && props.project.overlays.find(item => item.id === drag!.overlayId)
  const point = overlay && pointAt(event)
  if (!drag || !overlay || !point)
    return
  drag.moved = true
  if ('pointId' in drag.target) {
    emit('movePoint', overlay.id, drag.target.pointId, Math.min(overlay.endMs, Math.max(overlay.startMs, point.atMs)), point.value, false)
    return
  }
  const atMs = Math.min(props.project.durationMs, Math.max(0, point.atMs))
  emit('updateOverlay', overlay.id, drag.target.edge === 'start' ? { startMs: Math.min(overlay.endMs - 1, atMs) } : { endMs: Math.max(overlay.startMs + 1, atMs) }, false)
}

function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId)
    return
  // The release ends the drag. The lanes must not read it as a click.
  event.stopPropagation()
  const done = drag
  drag = undefined
  const overlay = props.project.overlays.find(item => item.id === done.overlayId)
  if (!done.moved || !overlay)
    return
  if ('edge' in done.target) {
    emit('updateOverlay', overlay.id, {}, true)
    return
  }
  const point = overlay.points.find(item => item.id === (done.target as { pointId: string }).pointId)
  if (point)
    emit('movePoint', overlay.id, point.id, point.atMs, point.value, true)
}

function onDoubleClick(event: MouseEvent) {
  const overlay = editedOverlay.value
  const track = activeTrackView.value
  const point = pointAt(event)
  const rowY = event.clientY - (svg.value?.getBoundingClientRect().top ?? 0) - (track?.row.top ?? 0)
  if (props.disabled || !overlay || !track || !point || rowY < 0 || rowY > track.row.height)
    return
  if (point.atMs < overlay.startMs || point.atMs > overlay.endMs)
    return
  emit('addPoint', overlay.id, { id: createLive2DMotionId(), ...point })
}

/** The overlay under a click of the lanes. A click on an overlay curve selects the overlay instead of moving the playhead. */
function hitItem(event: PointerEvent): MotionTimelineItem | undefined {
  const overlayId = (event.target as Element | null)?.closest('[data-overlay-id]')?.getAttribute('data-overlay-id')
  const overlay = props.project.overlays.find(item => item.id === overlayId)
  return overlay ? { key: overlay.id, overlayId: overlay.id, trackId: overlay.trackId } : undefined
}

function keyframeLabel(point: Live2DMotionKeyframe) {
  return t('tamagotchi.settings.devtools.pages.live2d-motion.editor.keyframe-item', {
    time: `${(point.atMs / 1000).toFixed(2)}s`,
    value: point.value.toFixed(2),
  })
}
</script>

<template>
  <TimelineLanes :hit-test="hitItem" :class="['relative touch-none']" :style="{ height: `${contentHeight}px` }">
    <svg ref="svg" :class="['absolute inset-0 size-full overflow-hidden']" @dblclick="onDoubleClick">
      <line
        v-for="tick in context.ticks.value"
        :key="tick.time"
        :x1="x(tick.time)" :x2="x(tick.time)" y1="0" y2="100%"
        :class="['stroke-neutral-200/90 dark:stroke-neutral-800/60']"
      />

      <g
        v-for="track in tracks"
        :key="track.row.trackId"
        :transform="`translate(0 ${track.row.top})`"
        :class="[track.row.trackId === activeTrack ? 'cursor-crosshair' : 'cursor-pointer']"
        @pointerdown="track.row.trackId !== activeTrack && emit('activate', track.row.trackId)"
      >
        <rect
          width="100%" :height="track.row.height"
          :class="[track.row.trackId === activeTrack ? 'fill-black/4.5 dark:fill-white/5' : 'fill-black/2 dark:fill-neutral-900/40']"
        />
        <line x1="0" x2="100%" :y1="track.row.height - 0.5" :y2="track.row.height - 0.5" :class="['stroke-neutral-200/90 dark:stroke-neutral-800/35']" />
        <rect
          v-for="{ overlay, color } in track.overlays"
          :key="`span:${overlay.id}`"
          :x="x(overlay.startMs)" y="2" :width="Math.max(0, x(overlay.endMs) - x(overlay.startMs))" :height="track.row.height - 5" rx="6"
          :fill="color" fill-opacity="0.1"
          :stroke="overlay.id === selectedOverlayId ? color : 'none'" stroke-opacity="0.7"
        />
        <line v-if="track.zeroY !== undefined" x1="0" x2="100%" :y1="track.zeroY" :y2="track.zeroY" :class="['stroke-neutral-200 dark:stroke-neutral-800']" />
        <path :d="track.source" fill="none" stroke-width="2" :class="['stroke-neutral-400 dark:stroke-neutral-600']" />
        <path :d="track.composite" fill="none" stroke-width="2" :class="['stroke-neutral-900 dark:stroke-neutral-100']" />
        <path
          v-for="{ overlay, color, path } in track.overlays"
          :key="overlay.id"
          :d="path" fill="none" :stroke="color" :stroke-width="overlay.id === selectedOverlayId ? 3.5 : 2"
          :data-overlay-id="overlay.id"
          :class="['cursor-pointer']"
        />

        <template v-if="track.row.trackId === activeTrack && editedOverlay">
          <!-- A view-target overlay always spans the whole motion, so it has no edges to drag. -->
          <template v-if="!track.viewTarget">
            <rect
              v-for="edge in (['start', 'end'] as const)"
              :key="edge"
              :x="x(edge === 'start' ? editedOverlay.startMs : editedOverlay.endMs) - 6" y="0" width="12" :height="track.row.height"
              :fill="motionOverlayColor(project, editedOverlay.id)" fill-opacity="0.22"
              :class="['cursor-ew-resize']"
              @pointerdown="startDrag($event, editedOverlay.id, { edge })"
              @pointermove="moveDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
              @dblclick.stop
            />
          </template>
          <circle
            v-for="point in editedOverlay.points"
            :key="point.id"
            role="button"
            tabindex="0"
            :aria-label="keyframeLabel(point)"
            :cx="x(point.atMs)" :cy="track.y(point.value)" r="6"
            :fill="motionOverlayColor(project, editedOverlay.id)" stroke-width="2"
            :class="['stroke-white dark:stroke-neutral-950 cursor-grab active:cursor-grabbing outline-none']"
            @pointerdown="startDrag($event, editedOverlay.id, { pointId: point.id })"
            @pointermove="moveDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @dblclick.stop="!disabled && emit('removePoint', editedOverlay.id, point.id)"
            @keydown.delete.prevent="!disabled && emit('removePoint', editedOverlay.id, point.id)"
          />
        </template>
      </g>

      <line
        v-if="context.cursor.value !== undefined"
        :x1="x(context.cursor.value)" :x2="x(context.cursor.value)" y1="0" y2="100%"
        stroke-width="2" :class="['stroke-amber-500 dark:stroke-amber-400 pointer-events-none']"
      />
    </svg>
  </TimelineLanes>
</template>
