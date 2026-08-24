<script setup lang="ts">
import type { Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { errorMessageFrom } from '@moeru/std'
import { defaultLive2DMotionControlDynamics, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d/stores'
import { computed, onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionJoystick from '../../components/devtools/live2d-motion-joystick.vue'
import Live2DMotionRecordingControls from '../../components/devtools/live2d-motion-recording-controls.vue'

import {
  parseLive2DMotionRecording,
  stringifyLive2DMotionRecording,
  useLive2DMotionRecording,
} from '../../composables/live2d-motion-recording'

const { t } = useI18n()
const motionControl = useLive2DMotionControl()
const ownerId = crypto.randomUUID()
const neutralPose: Live2DMotionControlPose = Object.freeze({ x: 0, y: 0, headZ: 0, bodyZ: 0 })
const pose = shallowRef<Live2DMotionControlPose>(neutralPose)
const dynamics = shallowRef<Live2DMotionControlDynamics>(defaultLive2DMotionControlDynamics)
const active = shallowRef(false)
const importError = shallowRef('')

function publishPose(nextPose: Live2DMotionControlPose) {
  pose.value = nextPose
  active.value = true
  motionControl.setPose(ownerId, nextPose, dynamics.value)
}

function setDynamics(nextDynamics: Live2DMotionControlDynamics) {
  dynamics.value = nextDynamics
  if (active.value)
    motionControl.setPose(ownerId, pose.value, nextDynamics)
}

function publishRelease() {
  pose.value = neutralPose
  active.value = false
  motionControl.release(ownerId)
}

const recordingController = useLive2DMotionRecording({
  applyPose: publishPose,
  releasePose: publishRelease,
})
const isPlaying = computed(() => recordingController.status.value.type === 'playing')

function setPose(nextPose: Live2DMotionControlPose) {
  publishPose(nextPose)
  recordingController.recordPose(nextPose)
}

function release() {
  publishRelease()
  recordingController.recordPose(neutralPose)
}

function toggleRecording() {
  importError.value = ''
  if (recordingController.status.value.type === 'recording') {
    recordingController.stopRecording()
    return
  }

  recordingController.startRecording(pose.value)
}

function togglePlayback() {
  importError.value = ''
  if (recordingController.status.value.type === 'playing') {
    recordingController.stopPlayback()
    return
  }

  recordingController.startPlayback()
}

function exportRecording() {
  if (!recordingController.recording.value)
    return

  const json = stringifyLive2DMotionRecording(recordingController.recording.value)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `airi-live2d-motion-${Date.now()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function importRecording(file: File) {
  try {
    const recording = parseLive2DMotionRecording(await file.text())
    recordingController.loadRecording(recording)
    importError.value = ''
  }
  catch (error) {
    console.error('[Live2D motion control] Failed to import recording', errorMessageFrom(error))
    importError.value = t('tamagotchi.settings.devtools.pages.live2d-motion.recording.import-error')
  }
}

onUnmounted(() => {
  recordingController.dispose()
  publishRelease()
})
</script>

<template>
  <div :class="['flex flex-col gap-5 pb-8']">
    <div>
      <h2 :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-100']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.title') }}
      </h2>
      <p :class="['mt-1 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.description') }}
      </p>
    </div>

    <Live2DMotionRecordingControls
      :status="recordingController.status.value"
      :recording="recordingController.recording.value"
      :import-error="importError"
      @toggle-recording="toggleRecording"
      @toggle-playback="togglePlayback"
      @export-recording="exportRecording"
      @import-recording="importRecording"
    />

    <Live2DMotionJoystick
      :pose="pose"
      :dynamics="dynamics"
      :active="active"
      :disabled="isPlaying"
      @move="setPose"
      @release="release"
      @update-dynamics="setDynamics"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.live2d-motion.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
