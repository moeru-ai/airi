<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionKeyframe, Live2DMotionKeyframeTracks, Live2DMotionTrackId } from '../../composables/live2d-motion-keyframes'
import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from '../../composables/live2d-motion-recording'

import { BasicButton } from '@proj-airi/ui'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  createDefaultLive2DMotionTracks,
  createLive2DMotionRecordingFromTracks,
  createLive2DMotionTracksFromRecording,
  evaluateLive2DMotionTracks,
  insertLive2DMotionKeyframe,
  live2dMotionEditableTrackIds,
  moveLive2DMotionKeyframe,
} from '../../composables/live2d-motion-keyframes'

const props = defineProps<{
  disabled?: boolean
  recording?: ReadonlyLive2DMotionRecording | null
}>()
const emit = defineEmits<{
  pose: [pose: Live2DMotionControlPose]
  playback: [playing: boolean]
  recording: [recording: Live2DMotionRecording]
}>()
const { t } = useI18n()

const durationMs = shallowRef(4000)
const tracks = shallowRef<Live2DMotionKeyframeTracks>(createDefaultLive2DMotionTracks(durationMs.value))
const selectedTrack = shallowRef<Live2DMotionTrackId>('headX')
const playheadMs = shallowRef(0)
const playing = shallowRef(false)
let animationFrame: number | undefined
let playbackStartedAt = 0
let playbackStartMs = 0
let lastEmittedRecording: Live2DMotionRecording | undefined

const unitValueTracks = new Set<Live2DMotionTrackId>(['eyeOpen', 'mouthOpen'])

const points = computed(() => tracks.value[selectedTrack.value])
const polyline = computed(() => points.value.map(point => `${timeToX(point.atMs)},${valueToY(point.value)}`).join(' '))

function timeToX(atMs: number) {
  if (durationMs.value === 0)
    return 0
  return (atMs / durationMs.value) * 1000
}
function valueToY(value: number) {
  if (unitValueTracks.has(selectedTrack.value))
    return (1 - value) * 560
  return (1 - value) * 280
}
const zeroY = computed(() => unitValueTracks.has(selectedTrack.value) ? 560 : 280)
function clientToPoint(event: MouseEvent | PointerEvent, target: SVGSVGElement) {
  const bounds = target.getBoundingClientRect()
  const verticalProgress = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
  return {
    atMs: Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * durationMs.value),
    value: unitValueTracks.has(selectedTrack.value) ? 1 - verticalProgress : 1 - verticalProgress * 2,
  }
}
function publish(atMs = playheadMs.value) {
  playheadMs.value = atMs
  emit('pose', evaluateLive2DMotionTracks(tracks.value, atMs))
}
function replaceTrack(next: Live2DMotionKeyframe[]) {
  tracks.value = { ...tracks.value, [selectedTrack.value]: next }
  publish()
  lastEmittedRecording = createLive2DMotionRecordingFromTracks(tracks.value, durationMs.value)
  emit('recording', lastEmittedRecording)
}
function addPoint(event: MouseEvent) {
  if (props.disabled)
    return
  const next = clientToPoint(event, event.currentTarget as SVGSVGElement)
  replaceTrack(insertLive2DMotionKeyframe(points.value, { id: crypto.randomUUID(), ...next }))
}
function deletePoint(id: string) {
  if (!props.disabled)
    replaceTrack(points.value.filter(point => point.id !== id))
}
function startDrag(event: PointerEvent, id: string) {
  if (props.disabled || event.button !== 0)
    return
  event.stopPropagation()
  const circle = event.currentTarget as SVGCircleElement
  const graph = circle.ownerSVGElement!
  circle.setPointerCapture(event.pointerId)
  const move = (moveEvent: PointerEvent) => {
    const next = clientToPoint(moveEvent, graph)
    replaceTrack(moveLive2DMotionKeyframe(points.value, id, next.atMs, next.value))
  }
  const stop = () => {
    circle.removeEventListener('pointermove', move)
    circle.removeEventListener('pointerup', stop)
    circle.removeEventListener('pointercancel', stop)
  }
  circle.addEventListener('pointermove', move)
  circle.addEventListener('pointerup', stop)
  circle.addEventListener('pointercancel', stop)
}
function scrub(event: PointerEvent) {
  if (props.disabled)
    return
  const graph = event.currentTarget as SVGSVGElement
  graph.setPointerCapture(event.pointerId)
  const update = (nextEvent: PointerEvent) => publish(clientToPoint(nextEvent, graph).atMs)
  update(event)
  const stop = () => {
    graph.removeEventListener('pointermove', update)
    graph.removeEventListener('pointerup', stop)
    graph.removeEventListener('pointercancel', stop)
  }
  graph.addEventListener('pointermove', update)
  graph.addEventListener('pointerup', stop)
  graph.addEventListener('pointercancel', stop)
}
function playbackFrame(now: number) {
  const elapsed = now - playbackStartedAt
  const next = playbackStartMs + elapsed
  if (next >= durationMs.value) {
    playing.value = false
    emit('playback', false)
    animationFrame = undefined
    publish(durationMs.value)
    return
  }
  publish(next)
  animationFrame = requestAnimationFrame(playbackFrame)
}
function togglePlayback() {
  if (playing.value) {
    playing.value = false
    emit('playback', false)
    if (animationFrame !== undefined)
      cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    return
  }
  playbackStartMs = playheadMs.value >= durationMs.value ? 0 : playheadMs.value
  playbackStartedAt = performance.now()
  playing.value = true
  emit('playback', true)
  animationFrame = requestAnimationFrame(playbackFrame)
}

watch(() => props.recording, (recording) => {
  if (!recording)
    return
  if (recording === lastEmittedRecording) {
    lastEmittedRecording = undefined
    return
  }

  durationMs.value = recording.durationMs
  tracks.value = createLive2DMotionTracksFromRecording(recording)
  playheadMs.value = 0
}, { immediate: true })

onUnmounted(() => {
  if (animationFrame !== undefined)
    cancelAnimationFrame(animationFrame)
  emit('playback', false)
})
</script>

<template>
  <section :class="['rounded-xl border border-neutral-200/80 p-4 dark:border-neutral-800/80']">
    <div :class="['mb-3 flex flex-wrap items-center justify-between gap-3']">
      <div>
        <h3 :class="['font-medium text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.title') }}
        </h3>
        <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.instructions') }}
        </p>
      </div>
      <BasicButton :disabled="props.disabled" @click="togglePlayback">
        <span :class="playing ? 'i-solar:pause-bold' : 'i-solar:play-bold'" />
        {{ playing ? t('tamagotchi.settings.devtools.pages.live2d-motion.editor.pause') : t('tamagotchi.settings.devtools.pages.live2d-motion.editor.play') }}
      </BasicButton>
    </div>
    <div :class="['mb-3 flex flex-wrap gap-1']">
      <BasicButton
        v-for="trackId in live2dMotionEditableTrackIds"
        :key="trackId"
        size="sm"
        :class="selectedTrack === trackId ? 'bg-primary-500! text-white!' : ''"
        @click="selectedTrack = trackId"
      >
        {{ t(`tamagotchi.settings.devtools.pages.live2d-motion.editor.tracks.${trackId}`) }}
      </BasicButton>
    </div>
    <svg
      viewBox="0 0 1000 560"
      preserveAspectRatio="none"
      :class="['h-52 w-full touch-none select-none rounded-lg bg-neutral-100 dark:bg-neutral-900']"
      @pointerdown="scrub"
      @dblclick="addPoint"
    >
      <line x1="0" :y1="zeroY" x2="1000" :y2="zeroY" stroke="currentColor" :class="['text-neutral-300 dark:text-neutral-700']" />
      <polyline :points="polyline" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke" :class="['text-primary-500']" />
      <line :x1="timeToX(playheadMs)" y1="0" :x2="timeToX(playheadMs)" y2="560" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" :class="['text-amber-500']" />
      <circle
        v-for="point in points"
        :key="point.id"
        :cx="timeToX(point.atMs)"
        :cy="valueToY(point.value)"
        r="14"
        fill="currentColor"
        vector-effect="non-scaling-stroke"
        :class="['cursor-grab text-primary-500 active:cursor-grabbing']"
        @pointerdown="startDrag($event, point.id)"
        @dblclick.stop="deletePoint(point.id)"
      />
    </svg>
    <div :class="['mt-2 text-right font-mono text-xs text-neutral-500']">
      {{ (playheadMs / 1000).toFixed(2) }}s / {{ (durationMs / 1000).toFixed(2) }}s
    </div>
  </section>
</template>
