<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type {
  Live2DMotionEditableTrackId,
  Live2DMotionKeyframe,
  Live2DMotionOverlay,
  Live2DMotionOverlayBlendMode,
  Live2DMotionProject,
} from '../../composables/live2d-motion-keyframes'
import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from '../../composables/live2d-motion-recording'

import { errorMessageFrom } from '@moeru/std'
import { BasicButton } from '@proj-airi/ui'
import { useManualRefHistory } from '@vueuse/core'
import { computed, nextTick, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionTimelineRuler from './live2d-motion-timeline-ruler.vue'
import Live2DMotionTrackRow from './live2d-motion-track-row.vue'

import {
  createDefaultLive2DMotionProject,
  createLive2DMotionOverlay,
  createLive2DMotionProject,
  createLive2DMotionRecordingFromProject,
  evaluateLive2DMotionProject,
  insertLive2DMotionKeyframe,
  live2dMotionEditableTrackIds,
  moveLive2DMotionKeyframe,
  parseLive2DMotionProject,
  stringifyLive2DMotionProject,
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

const project = shallowRef<Live2DMotionProject>(createDefaultLive2DMotionProject())
const activeTrack = shallowRef<Live2DMotionEditableTrackId>('headX')
const selectedOverlayId = shallowRef<string>()
const playheadMs = shallowRef(0)
const viewport = shallowRef<readonly [number, number]>([0, project.value.durationMs])
const rulerKey = shallowRef(0)
const playing = shallowRef(false)
const importError = shallowRef('')
const importFileInput = useTemplateRef<HTMLInputElement>('importFileInput')
const { canRedo, canUndo, clear, commit, redo, undo } = useManualRefHistory(project, {
  clone: structuredClone,
  capacity: 100,
})
let animationFrame: number | undefined
let playbackStartedAt = 0
let playbackStartMs = 0
let lastEmittedRecordingJson = ''

const currentTime = computed(() => `${(playheadMs.value / 1000).toFixed(2)}s`)
const duration = computed(() => `${(project.value.durationMs / 1000).toFixed(2)}s`)

function publish(atMs = playheadMs.value) {
  playheadMs.value = Math.min(project.value.durationMs, Math.max(0, atMs))
  emit('pose', evaluateLive2DMotionProject(project.value, playheadMs.value))
}

function emitBakedRecording() {
  const recording = createLive2DMotionRecordingFromProject(project.value)
  lastEmittedRecordingJson = JSON.stringify(recording)
  emit('recording', recording)
}

function replaceProject(nextProject: Live2DMotionProject, saveHistory: boolean) {
  project.value = nextProject
  publish()
  if (saveHistory) {
    commit()
    emitBakedRecording()
  }
}

function updateProject(change: (draft: Live2DMotionProject) => void, saveHistory = true) {
  const nextProject = structuredClone(project.value)
  change(nextProject)
  replaceProject(nextProject, saveHistory)
}

function addOverlay(trackId: Live2DMotionEditableTrackId, blendMode: Live2DMotionOverlayBlendMode) {
  const overlay = createLive2DMotionOverlay(trackId, project.value.durationMs, playheadMs.value, blendMode)
  updateProject(draft => draft.overlays.push(overlay))
  activeTrack.value = trackId
  selectedOverlayId.value = overlay.id
}

function selectTrack(trackId: Live2DMotionEditableTrackId) {
  activeTrack.value = trackId
  const selectedBelongsToTrack = project.value.overlays.some(overlay => overlay.id === selectedOverlayId.value && overlay.trackId === trackId)
  if (!selectedBelongsToTrack)
    selectedOverlayId.value = project.value.overlays.find(overlay => overlay.trackId === trackId)?.id
}

function removeOverlay(overlayId: string) {
  updateProject((draft) => {
    draft.overlays = draft.overlays.filter(overlay => overlay.id !== overlayId)
  })
  selectedOverlayId.value = project.value.overlays.find(overlay => overlay.trackId === activeTrack.value)?.id
}

function updateOverlay(overlayId: string, patch: Partial<Live2DMotionOverlay>, saveHistory: boolean) {
  updateProject((draft) => {
    const overlay = draft.overlays.find(item => item.id === overlayId)
    if (!overlay)
      return
    Object.assign(overlay, patch)
    overlay.points = overlay.points
      .map(point => ({
        ...point,
        atMs: Math.min(overlay.endMs, Math.max(overlay.startMs, point.atMs)),
      }))
      .sort((left, right) => left.atMs - right.atMs)
  }, saveHistory)
}

function addPoint(overlayId: string, point: Live2DMotionKeyframe) {
  updateProject((draft) => {
    const overlay = draft.overlays.find(item => item.id === overlayId)
    if (overlay)
      overlay.points = insertLive2DMotionKeyframe(overlay.points, point)
  })
}

function movePoint(overlayId: string, pointId: string, atMs: number, value: number, saveHistory: boolean) {
  updateProject((draft) => {
    const overlay = draft.overlays.find(item => item.id === overlayId)
    if (overlay)
      overlay.points = moveLive2DMotionKeyframe(overlay.points, pointId, atMs, value)
  }, saveHistory)
}

function removePoint(overlayId: string, pointId: string) {
  updateProject((draft) => {
    const overlay = draft.overlays.find(item => item.id === overlayId)
    if (overlay && overlay.points.length > 2)
      overlay.points = overlay.points.filter(point => point.id !== pointId)
  })
}

function stopPlayback() {
  if (!playing.value)
    return
  playing.value = false
  emit('playback', false)
  if (animationFrame !== undefined)
    cancelAnimationFrame(animationFrame)
  animationFrame = undefined
}

function playbackFrame(now: number) {
  const next = playbackStartMs + now - playbackStartedAt
  if (next >= project.value.durationMs) {
    stopPlayback()
    publish(project.value.durationMs)
    return
  }
  publish(next)
  animationFrame = requestAnimationFrame(playbackFrame)
}

function togglePlayback() {
  if (playing.value) {
    stopPlayback()
    return
  }
  playbackStartMs = playheadMs.value >= project.value.durationMs ? 0 : playheadMs.value
  playbackStartedAt = performance.now()
  playing.value = true
  emit('playback', true)
  animationFrame = requestAnimationFrame(playbackFrame)
}

function runHistoryAction(action: () => void) {
  action()
  nextTick(() => {
    publish()
    emitBakedRecording()
  })
}

function resetViewport() {
  viewport.value = [0, project.value.durationMs]
  rulerKey.value++
}

function exportProject() {
  const json = stringifyLive2DMotionProject(project.value)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `airi-live2d-motion-project-${Date.now()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function openImportPicker() {
  importFileInput.value?.click()
}

async function importProject(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file)
    return

  try {
    const nextProject = parseLive2DMotionProject(await file.text())
    project.value = nextProject
    playheadMs.value = 0
    selectedOverlayId.value = nextProject.overlays[0]?.id
    activeTrack.value = nextProject.overlays[0]?.trackId ?? 'headX'
    resetViewport()
    clear()
    commit()
    publish()
    emitBakedRecording()
    importError.value = ''
  }
  catch (error) {
    console.error('[Live2D motion editor] Failed to import project', errorMessageFrom(error))
    importError.value = t('tamagotchi.settings.devtools.pages.live2d-motion.editor.import-error')
  }
}

watch(() => props.recording, (recording) => {
  if (!recording)
    return
  if (JSON.stringify(recording) === lastEmittedRecordingJson) {
    lastEmittedRecordingJson = ''
    return
  }

  project.value = createLive2DMotionProject(recording)
  playheadMs.value = 0
  selectedOverlayId.value = undefined
  resetViewport()
  clear()
  commit()
}, { immediate: true })

onUnmounted(() => {
  stopPlayback()
  emit('playback', false)
})
</script>

<template>
  <section :class="['overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800/80']">
    <div :class="['flex flex-wrap items-start justify-between gap-3 p-4']">
      <div>
        <h3 :class="['font-medium text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.title') }}
        </h3>
        <p :class="['mt-1 max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.instructions') }}
        </p>
      </div>
      <div :class="['flex flex-wrap items-center gap-1']">
        <BasicButton :disabled="props.disabled" @click="togglePlayback">
          <span :class="playing ? 'i-solar:pause-bold' : 'i-solar:play-bold'" />
          {{ playing ? t('tamagotchi.settings.devtools.pages.live2d-motion.editor.pause') : t('tamagotchi.settings.devtools.pages.live2d-motion.editor.play') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="props.disabled || !canUndo" :title="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.undo')" @click="runHistoryAction(undo)">
          <span :class="['i-solar:undo-left-round-linear']" />
        </BasicButton>
        <BasicButton size="sm" :disabled="props.disabled || !canRedo" :title="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.redo')" @click="runHistoryAction(redo)">
          <span :class="['i-solar:undo-right-round-linear']" />
        </BasicButton>
        <BasicButton size="sm" :disabled="props.disabled" @click="resetViewport">
          <span :class="['i-solar:magnifer-zoom-out-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.reset-view') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="props.disabled" @click="exportProject">
          <span :class="['i-solar:download-minimalistic-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.export-project') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="props.disabled" @click="openImportPicker">
          <span :class="['i-solar:upload-minimalistic-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.import-project') }}
        </BasicButton>
      </div>
    </div>

    <div :class="['grid grid-cols-[7.5rem_minmax(0,1fr)] border-y border-neutral-200/80 dark:border-neutral-800/80']">
      <div :class="['flex items-center px-3 font-mono text-xs text-neutral-500']">
        {{ currentTime }} / {{ duration }}
      </div>
      <Live2DMotionTimelineRuler
        :key="rulerKey"
        :duration-ms="project.durationMs"
        :playhead-ms="playheadMs"
        :viewport="viewport"
        :disabled="props.disabled"
        @scrub="publish"
        @viewport="viewport = $event"
      />
    </div>

    <div :class="['max-h-[52rem] space-y-2 overflow-y-auto p-3']">
      <Live2DMotionTrackRow
        v-for="trackId in live2dMotionEditableTrackIds"
        :key="trackId"
        :project="project"
        :track-id="trackId"
        :label="t(`tamagotchi.settings.devtools.pages.live2d-motion.editor.tracks.${trackId}`)"
        :active="activeTrack === trackId"
        :selected-overlay-id="selectedOverlayId"
        :playhead-ms="playheadMs"
        :viewport="viewport"
        :disabled="props.disabled"
        @activate="selectTrack(trackId)"
        @add-overlay="addOverlay(trackId, $event)"
        @select-overlay="selectedOverlayId = $event"
        @remove-overlay="removeOverlay"
        @update-overlay="updateOverlay"
        @add-point="addPoint"
        @move-point="movePoint"
        @remove-point="removePoint"
        @scrub="publish"
      />
    </div>

    <div :class="['flex items-center justify-between gap-3 border-t border-neutral-200/80 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800/80']">
      <span>{{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.timeline-help') }}</span>
      <span>{{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.overlay-count', { count: project.overlays.length }) }}</span>
    </div>

    <input ref="importFileInput" type="file" accept=".json,application/json" :class="['hidden']" @change="importProject">
    <p v-if="importError" :class="['px-4 pb-3 text-sm text-red-500 dark:text-red-400']">
      {{ importError }}
    </p>
  </section>
</template>
