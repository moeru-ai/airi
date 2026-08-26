<script setup lang="ts">
import type { StandardGamepadSnapshot } from '@proj-airi/input-gamepad'

import type {
  Live2DMotionEditableTrackId,
  Live2DMotionEditorFrame,
  Live2DMotionKeyframe,
  Live2DMotionOverlay,
  Live2DMotionOverlayBlendMode,
  Live2DMotionProject,
} from '../../composables/live2d-motion-keyframes'
import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from '../../composables/live2d-motion-recording'

import { errorMessageFrom } from '@moeru/std'
import { getGamepadButtonLabel } from '@proj-airi/input-gamepad'
import { BasicButton } from '@proj-airi/ui'
import { useManualRefHistory } from '@vueuse/core'
import { computed, nextTick, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionInputHints from './live2d-motion-input-hints.vue'
import Live2DMotionPlaybackControls from './live2d-motion-playback-controls.vue'
import Live2DMotionTimelineRuler from './live2d-motion-timeline-ruler.vue'
import Live2DMotionTrackRow from './live2d-motion-track-row.vue'

import {
  createDefaultLive2DMotionProject,
  createLive2DMotionOverlay,
  createLive2DMotionProject,
  createLive2DMotionRecordingFromProject,
  cropLive2DMotionProject,
  evaluateLive2DMotionEditorFrame,
  insertLive2DMotionKeyframe,
  live2dMotionEditableTrackIds,
  moveLive2DMotionKeyframe,
  parseLive2DMotionProject,
  stringifyLive2DMotionProject,
} from '../../composables/live2d-motion-keyframes'
import { useLive2DMotionGamepadActions } from '../../composables/use-live2d-motion-gamepad-actions'

const props = defineProps<{
  disabled?: boolean
  gamepad?: StandardGamepadSnapshot
  recording?: ReadonlyLive2DMotionRecording | null
  recordingActive?: boolean
}>()
const emit = defineEmits<{
  frame: [frame: Live2DMotionEditorFrame]
  playback: [playing: boolean]
  recording: [recording: Live2DMotionRecording]
  restartRecording: []
  toggleRecording: []
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
const editingDisabled = computed(() => props.disabled || props.recordingActive)
const gamepadFamily = computed(() => props.gamepad?.family ?? 'unknown')
const timelineInputHints = computed(() => {
  const leftShoulder = getGamepadButtonLabel(gamepadFamily.value, 'leftShoulder')
  const rightShoulder = getGamepadButtonLabel(gamepadFamily.value, 'rightShoulder')
  return [
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.play'),
      controller: getGamepadButtonLabel(gamepadFamily.value, 'faceBottom'),
      keyboard: 'Shift+Space',
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.stop'),
      controller: getGamepadButtonLabel(gamepadFamily.value, 'faceRight'),
      keyboard: 'Shift+Space',
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.start'),
      controller: `${leftShoulder} + D-pad ←`,
      keyboard: 'Alt+A',
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.end'),
      controller: `${leftShoulder} + D-pad →`,
      keyboard: 'Alt+D',
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.step-backward'),
      controller: `${rightShoulder} + D-pad ←`,
      keyboard: 'Shift+A',
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.step-forward'),
      controller: `${rightShoulder} + D-pad →`,
      keyboard: 'Shift+D',
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.restart-recording'),
      controller: `${leftShoulder} + D-pad ↑`,
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.clear-timeline'),
      controller: `${leftShoulder} + D-pad ↓`,
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.previous-track'),
      controller: `${rightShoulder} + D-pad ↑`,
    },
    {
      action: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.input-actions.next-track'),
      controller: `${rightShoulder} + D-pad ↓`,
    },
  ]
})
const canCrop = computed(() => {
  const [startMs, endMs] = viewport.value
  return endMs - startMs >= 1 && (startMs > 0.5 || endMs < project.value.durationMs - 0.5)
})

function publish(atMs = playheadMs.value) {
  playheadMs.value = Math.min(project.value.durationMs, Math.max(0, atMs))
  emit('frame', evaluateLive2DMotionEditorFrame(project.value, playheadMs.value))
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

function startPlayback() {
  if (playing.value || editingDisabled.value)
    return

  playbackStartMs = playheadMs.value >= project.value.durationMs ? 0 : playheadMs.value
  playbackStartedAt = performance.now()
  playing.value = true
  emit('playback', true)
  animationFrame = requestAnimationFrame(playbackFrame)
}

function seekTo(atMs: number) {
  stopPlayback()
  publish(atMs)
}

function stepPlayback(direction: -1 | 1, steps = 1) {
  seekTo(playheadMs.value + direction * steps * 1000 / 30)
}

function restartRecording() {
  if (props.disabled || playing.value)
    return
  emit('restartRecording')
}

function clearTimeline() {
  if (editingDisabled.value)
    return

  stopPlayback()
  activeTrack.value = 'headX'
  selectedOverlayId.value = undefined
  playheadMs.value = 0
  replaceProject(createDefaultLive2DMotionProject(project.value.durationMs), true)
  resetViewport()
}

function selectTrackByOffset(offset: -1 | 1) {
  if (editingDisabled.value)
    return

  const currentIndex = live2dMotionEditableTrackIds.indexOf(activeTrack.value)
  const nextIndex = Math.min(
    live2dMotionEditableTrackIds.length - 1,
    Math.max(0, currentIndex + offset),
  )
  selectTrack(live2dMotionEditableTrackIds[nextIndex])
}

function runHistoryAction(action: () => void) {
  const previousDurationMs = project.value.durationMs
  action()
  nextTick(() => {
    if (project.value.durationMs !== previousDurationMs)
      resetViewport()
    publish()
    emitBakedRecording()
  })
}

function resetViewport() {
  viewport.value = [0, project.value.durationMs]
  rulerKey.value++
}

useLive2DMotionGamepadActions({
  clearTimeline,
  disabled: () => props.disabled ?? false,
  goToEnd: () => {
    if (!editingDisabled.value)
      seekTo(project.value.durationMs)
  },
  goToStart: () => {
    if (!editingDisabled.value)
      seekTo(0)
  },
  play: startPlayback,
  restartRecording,
  selectTrack: selectTrackByOffset,
  snapshot: () => props.gamepad,
  stepBackward: (steps) => {
    if (!editingDisabled.value)
      stepPlayback(-1, steps)
  },
  stepForward: (steps) => {
    if (!editingDisabled.value)
      stepPlayback(1, steps)
  },
  stop: stopPlayback,
})

function cropToViewport() {
  const [startMs, endMs] = viewport.value
  if (!canCrop.value)
    return

  project.value = cropLive2DMotionProject(project.value, startMs, endMs)
  playheadMs.value = Math.min(project.value.durationMs, Math.max(0, playheadMs.value - startMs))
  if (!project.value.overlays.some(overlay => overlay.id === selectedOverlayId.value))
    selectedOverlayId.value = project.value.overlays.find(overlay => overlay.trackId === activeTrack.value)?.id
  resetViewport()
  publish()
  commit()
  emitBakedRecording()
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
    commit()
    clear()
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
  playheadMs.value = props.recordingActive ? recording.durationMs : 0
  selectedOverlayId.value = undefined
  resetViewport()
  if (props.recordingActive)
    return

  commit()
  clear()
}, { immediate: true })

onUnmounted(() => {
  stopPlayback()
  emit('playback', false)
})
</script>

<template>
  <section :class="['overflow-hidden rounded-xl bg-white/55 dark:bg-neutral-950/35']">
    <div :class="['flex flex-wrap items-center justify-between gap-3 p-4']">
      <div :class="['min-w-64 flex-1']">
        <h3 :class="['font-medium text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.title') }}
        </h3>
        <p :class="['mt-1 max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.instructions') }}
        </p>
      </div>

      <Live2DMotionPlaybackControls
        :current-time-ms="playheadMs"
        :duration-ms="project.durationMs"
        :playing="playing"
        :disabled="editingDisabled"
        @start="seekTo(0)"
        @step-backward="stepPlayback(-1, $event)"
        @play="startPlayback"
        @pause="stopPlayback"
        @step-forward="stepPlayback(1, $event)"
        @end="seekTo(project.durationMs)"
      />

      <div :class="['flex min-w-64 flex-1 flex-wrap items-center justify-end gap-1']">
        <BasicButton
          :disabled="props.disabled || playing"
          @click="emit('toggleRecording')"
        >
          <span :class="props.recordingActive ? 'i-solar:stop-circle-bold' : 'i-solar:record-circle-bold'" />
          {{ props.recordingActive
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.stop-recording')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.record') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="editingDisabled || !canUndo" :title="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.undo')" @click="runHistoryAction(undo)">
          <span :class="['i-solar:undo-left-round-linear']" />
        </BasicButton>
        <BasicButton size="sm" :disabled="editingDisabled || !canRedo" :title="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.redo')" @click="runHistoryAction(redo)">
          <span :class="['i-solar:undo-right-round-linear']" />
        </BasicButton>
        <BasicButton size="sm" :disabled="editingDisabled || playing || !canCrop" @click="cropToViewport">
          <span :class="['i-solar:scissors-bold-duotone']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.crop-to-view') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="editingDisabled" @click="resetViewport">
          <span :class="['i-solar:magnifer-zoom-out-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.reset-view') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="editingDisabled" @click="exportProject">
          <span :class="['i-solar:download-minimalistic-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.export-project') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="editingDisabled" @click="openImportPicker">
          <span :class="['i-solar:upload-minimalistic-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.import-project') }}
        </BasicButton>
      </div>

      <Live2DMotionInputHints
        :hints="timelineInputHints"
        :keyboard-label="t('tamagotchi.settings.devtools.pages.live2d-motion.input.keyboard')"
        :controller-label="t('tamagotchi.settings.devtools.pages.live2d-motion.input.controller')"
        :class="['w-full grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]']"
      />
    </div>

    <div
      data-testid="motion-timeline-ruler-row"
      :class="[
        'grid grid-cols-[calc(12rem+0.75rem)_minmax(0,1fr)] pr-3',
        'border-y border-neutral-200/80 dark:border-neutral-800/80',
      ]"
    >
      <div :class="['flex items-center px-3 font-mono text-xs text-neutral-500']">
        {{ currentTime }} / {{ duration }}
      </div>
      <Live2DMotionTimelineRuler
        :key="rulerKey"
        :duration-ms="project.durationMs"
        :playhead-ms="playheadMs"
        :viewport="viewport"
        :disabled="editingDisabled"
        @scrub="publish"
        @viewport="viewport = $event"
      />
    </div>

    <div data-testid="motion-timeline-track-list" :class="['max-h-[52rem] space-y-2 overflow-y-auto p-3']">
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
        :disabled="editingDisabled"
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
