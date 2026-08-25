<script setup lang="ts">
import type { Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { defaultLive2DMotionControlDynamics, neutralLive2DMotionControlPose, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d/stores'
import { onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionJoystick from '../../components/devtools/live2d-motion-joystick.vue'
import Live2DMotionKeyframeEditor from '../../components/devtools/live2d-motion-keyframe-editor.vue'

import { useLive2DMotionRecording } from '../../composables/live2d-motion-recording'

const { t } = useI18n()
const motionControl = useLive2DMotionControl()
const ownerId = crypto.randomUUID()
const neutralPose = neutralLive2DMotionControlPose
const pose = shallowRef<Live2DMotionControlPose>(neutralPose)
const dynamics = shallowRef<Live2DMotionControlDynamics>(defaultLive2DMotionControlDynamics)
const active = shallowRef(false)
const editorPlaying = shallowRef(false)

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

function setPose(nextPose: Live2DMotionControlPose) {
  publishPose(nextPose)
  recordingController.recordPose(nextPose)
}

function release() {
  publishRelease()
  recordingController.recordPose(neutralPose)
}

function toggleRecording() {
  if (recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording') {
    recordingController.stopRecording()
    return
  }

  recordingController.startRecording()
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

    <Live2DMotionJoystick
      :pose="pose"
      :dynamics="dynamics"
      :active="active"
      :disabled="editorPlaying"
      @move="setPose"
      @release="release"
      @update-dynamics="setDynamics"
    />

    <Live2DMotionKeyframeEditor
      :recording="recordingController.recording.value"
      :recording-active="recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
      @pose="setPose"
      @playback="editorPlaying = $event"
      @recording="recordingController.loadRecording"
      @toggle-recording="toggleRecording"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.live2d-motion.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
