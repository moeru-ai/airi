<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionKeyframe, Live2DMotionKeyframeTracks, Live2DMotionTrackId } from '../../composables/live2d-motion-keyframes'

import { BasicButton } from '@proj-airi/ui'
import { computed, onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  createDefaultLive2DMotionTracks,
  evaluateLive2DMotionTracks,
  insertLive2DMotionKeyframe,
  live2dMotionTrackIds,
  moveLive2DMotionKeyframe,
} from '../../composables/live2d-motion-keyframes'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{
  pose: [pose: Live2DMotionControlPose]
  playback: [playing: boolean]
}>()
const { t } = useI18n()

const durationMs = 4000
const tracks = shallowRef<Live2DMotionKeyframeTracks>(createDefaultLive2DMotionTracks(durationMs))
const selectedTrack = shallowRef<Live2DMotionTrackId>('headX')
const playheadMs = shallowRef(0)
const playing = shallowRef(false)
let animationFrame: number | undefined
let playbackStartedAt = 0
let playbackStartMs = 0

const points = computed(() => tracks.value[selectedTrack.value])
const polyline = computed(() => points.value.map(point => `${timeToX(point.atMs)},${valueToY(point.value)}`).join(' '))

function timeToX(atMs: number) {
  return (atMs / durationMs) * 1000
}
function valueToY(value: number) {
  return (1 - value) * 280
}
function clientToPoint(event: MouseEvent | PointerEvent, target: SVGSVGElement) {
  const bounds = target.getBoundingClientRect()
  return {
    atMs: Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * durationMs),
    value: Math.min(1, Math.max(-1, 1 - ((event.clientY - bounds.top) / bounds.height) * 2)),
  }
}
function publish(atMs = playheadMs.value) {
  playheadMs.value = atMs
  emit('pose', evaluateLive2DMotionTracks(tracks.value, atMs))
}
function replaceTrack(next: Live2DMotionKeyframe[]) {
  tracks.value = { ...tracks.value, [selectedTrack.value]: next }
  publish()
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
  if (next >= durationMs) {
    playing.value = false
    emit('playback', false)
    animationFrame = undefined
    publish(durationMs)
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
  playbackStartMs = playheadMs.value >= durationMs ? 0 : playheadMs.value
  playbackStartedAt = performance.now()
  playing.value = true
  emit('playback', true)
  animationFrame = requestAnimationFrame(playbackFrame)
}
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
        v-for="trackId in live2dMotionTrackIds"
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
      <line x1="0" y1="280" x2="1000" y2="280" stroke="currentColor" :class="['text-neutral-300 dark:text-neutral-700']" />
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
      {{ (playheadMs / 1000).toFixed(2) }}s / 4.00s
    </div>
  </section>
</template>
