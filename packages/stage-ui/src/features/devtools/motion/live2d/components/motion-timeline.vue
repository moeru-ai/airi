<script setup lang="ts">
import type {
  Live2DMotionEditableTrackId,
  Live2DMotionKeyframe,
  Live2DMotionOverlay,
  Live2DMotionOverlayBlendMode,
  Live2DMotionProject,
} from '../composables/keyframes'
import type { MotionTimelineItem } from '../composables/timeline-geometry'

import { TimelineAxis, TimelineLabelColumn, TimelineLabelResizer, TimelineRoot, TimelineScrollArea } from '@proj-airi/ui-timeline/headless'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import MotionTimelineLanes from './motion-timeline-lanes.vue'
import TrackHeader from './track-header.vue'

import { live2dMotionEditableTrackIds } from '../composables/keyframes'
import { layoutMotionTracks } from '../composables/timeline-geometry'

/**
 * The timeline of the motion editor, built on the headless parts of `@proj-airi/ui-timeline`.
 *
 * The root owns the view window, zoom, pan, and the cursor keys. The cursor is the playhead. The axis scrubs it, and a
 * click on empty lanes moves it. The label column over the left of the lanes holds one header for each track. The lanes
 * draw every track on one canvas and edit the active track.
 */
const props = defineProps<{
  project: Live2DMotionProject
  activeTrack: Live2DMotionEditableTrackId
  selectedOverlayId?: string
  playheadMs: number
  /** Blocks edits, scrubbing, zoom, and pan, for example while a recording runs. */
  disabled?: boolean
}>()
const emit = defineEmits<{
  activate: [trackId: Live2DMotionEditableTrackId]
  addOverlay: [trackId: Live2DMotionEditableTrackId, blendMode: Live2DMotionOverlayBlendMode]
  selectOverlay: [overlayId: string]
  removeOverlay: [overlayId: string]
  updateOverlay: [overlayId: string, patch: Partial<Live2DMotionOverlay>, commit: boolean]
  addPoint: [overlayId: string, point: Live2DMotionKeyframe]
  movePoint: [overlayId: string, pointId: string, atMs: number, value: number, commit: boolean]
  removePoint: [overlayId: string, pointId: string]
  scrub: [atMs: number]
  viewport: [viewport: readonly [number, number]]
}>()
const { t } = useI18n()

/** The default width of the label column. It holds the controls of the selected overlay, so it is wider than a name. */
const LABEL_WIDTH = 208
/** The height of the axis. The corner over the labels has the same height. */
const AXIS_HEIGHT = 24

const lanes = useTemplateRef<{ resetView: () => void }>('lanes')
const labelWidth = shallowRef(LABEL_WIDTH)
const layout = computed(() => layoutMotionTracks(live2dMotionEditableTrackIds, props.activeTrack))
const timecode = computed(() => `${formatSeconds(props.playheadMs)} / ${formatSeconds(props.project.durationMs)}`)

/** The playhead as the cursor of the timeline. The editor clamps it to the motion, so a press before 0 goes to 0. */
const cursor = computed<number | undefined>({
  get: () => props.playheadMs,
  set: (atMs) => {
    // Escape clears the cursor of the timeline. The editor always has a playhead, so it ignores a clear.
    if (atMs !== undefined && !props.disabled)
      emit('scrub', Math.round(atMs))
  },
})

/** The selected overlay as the selection of the timeline. A selected keyframe selects its overlay. */
const selection = computed<MotionTimelineItem | undefined>({
  get: (): MotionTimelineItem | undefined => {
    const overlay = props.project.overlays.find(item => item.id === props.selectedOverlayId)
    return overlay ? { key: overlay.id, kind: 'overlay', overlayId: overlay.id, trackId: overlay.trackId } : undefined
  },
  set: (item) => {
    // A click on empty lanes clears the selection of the timeline. The editor keeps its overlay, like a track header.
    if (!item)
      return
    if (item.trackId !== props.activeTrack)
      emit('activate', item.trackId)
    emit('selectOverlay', item.overlayId)
  },
})

function formatSeconds(atMs: number) {
  return `${(atMs / 1000).toFixed(2)}s`
}

function trackLabel(trackId: Live2DMotionEditableTrackId) {
  return t(`tamagotchi.settings.devtools.pages.live2d-motion.editor.tracks.${trackId}`)
}

/** Stops a press or a wheel event before the axis and the lanes see it, while the timeline is disabled. */
function blockWhenDisabled(event: Event) {
  if (props.disabled)
    event.stopPropagation()
}

/** Fits the whole motion in the view in the next frame. */
function resetView() {
  lanes.value?.resetView()
}

defineExpose({ resetView })
</script>

<template>
  <TimelineRoot
    v-model:cursor="cursor"
    v-model:selection="selection"
    v-model:label-width="labelWidth"
    :start="0"
    :end="project.durationMs"
    :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.timeline-label')"
    :class="[
      'relative flex flex-col overflow-hidden',
      'text-xs select-none',
      'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60',
    ]"
  >
    <TimelineScrollArea :class="['relative max-h-[52rem] overflow-y-auto overflow-x-hidden']">
      <div
        :class="['relative flex flex-col min-w-0']"
        @pointerdown.capture="blockWhenDisabled"
        @pointerup.capture="blockWhenDisabled"
        @wheel.capture="blockWhenDisabled"
      >
        <TimelineAxis
          v-slot="{ ticks, position }"
          :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playhead')"
          :aria-disabled="disabled"
          :class="[
            'sticky top-0 z-1 relative shrink-0 h-6 overflow-hidden touch-none',
            disabled ? 'cursor-default' : 'cursor-col-resize',
            'bg-neutral-50 dark:bg-neutral-900',
            'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/60',
          ]"
        >
          <div
            v-for="tick in ticks"
            :key="tick.time"
            :class="[
              'absolute top-0 h-full pl-1',
              'border-l border-neutral-200 dark:border-neutral-800',
              'text-2.5 leading-6 font-mono text-neutral-500 tabular-nums whitespace-nowrap',
            ]"
            :style="position(tick.time)"
          >
            {{ tick.label }}
          </div>
          <div
            :class="[
              'absolute bottom-0 -ml-1.25 size-0 border-x-5 border-t-6 border-x-transparent',
              'border-t-amber-500 dark:border-t-amber-400',
            ]"
            :style="position(playheadMs)"
          />
        </TimelineAxis>

        <MotionTimelineLanes
          ref="lanes"
          :project="project"
          :rows="layout.rows"
          :content-height="layout.height"
          :active-track="activeTrack"
          :selected-overlay-id="selectedOverlayId"
          :disabled="disabled"
          :track-label="trackLabel"
          @activate="emit('activate', $event)"
          @update-overlay="(overlayId, patch, commit) => emit('updateOverlay', overlayId, patch, commit)"
          @add-point="(overlayId, point) => emit('addPoint', overlayId, point)"
          @move-point="(overlayId, pointId, atMs, value, commit) => emit('movePoint', overlayId, pointId, atMs, value, commit)"
          @remove-point="(overlayId, pointId) => emit('removePoint', overlayId, pointId)"
          @viewport="emit('viewport', $event)"
        />
      </div>

      <!-- Labels: over the left of the lanes, with a blurred background, so the lanes keep the full width. -->
      <TimelineLabelColumn
        :class="[
          'absolute left-0 top-0 bottom-0 z-4',
          'bg-neutral-50/85 backdrop-blur-md dark:bg-neutral-950/65',
        ]"
        :style="{ minHeight: `${layout.height + AXIS_HEIGHT}px` }"
      >
        <TimelineLabelResizer
          :default-width="LABEL_WIDTH"
          :min="176"
          :max="360"
          :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.resize-labels')"
          :class="['group/edge absolute -right-1.5 top-0 bottom-0 z-5 w-3 cursor-col-resize touch-none outline-none']"
        >
          <div
            :class="[
              'mx-auto h-full w-0.5 transition-colors',
              'bg-neutral-200/70 dark:bg-neutral-800/70',
              'group-hover/edge:bg-primary-400/60 group-focus-visible/edge:bg-primary-400',
            ]"
          />
        </TimelineLabelResizer>
        <div
          :class="[
            'sticky top-0 z-1 flex items-center px-3',
            'bg-neutral-50/90 backdrop-blur-md dark:bg-neutral-950/70',
            'font-mono text-xs text-neutral-500 tabular-nums',
          ]"
          :style="{ height: `${AXIS_HEIGHT}px` }"
        >
          {{ timecode }}
        </div>
        <TrackHeader
          v-for="row in layout.rows"
          :key="row.trackId"
          :style="{ height: `${row.height}px` }"
          :project="project"
          :track-id="row.trackId"
          :label="trackLabel(row.trackId)"
          :active="row.trackId === activeTrack"
          :selected-overlay-id="selectedOverlayId"
          :disabled="disabled"
          @activate="emit('activate', row.trackId)"
          @add-overlay="emit('addOverlay', row.trackId, $event)"
          @select-overlay="emit('selectOverlay', $event)"
          @remove-overlay="emit('removeOverlay', $event)"
          @update-overlay="(overlayId, patch, commit) => emit('updateOverlay', overlayId, patch, commit)"
        />
      </TimelineLabelColumn>
    </TimelineScrollArea>
  </TimelineRoot>
</template>
