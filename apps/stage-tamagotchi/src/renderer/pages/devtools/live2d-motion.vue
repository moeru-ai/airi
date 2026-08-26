<script setup lang="ts">
import type { Live2DBreathControlOptions, Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionEditorFrame } from '../../composables/live2d-motion-keyframes'
import type {
  Live2DMotionOutputFilterFrame,
  Live2DMotionOutputFilterOptions,
} from '../../composables/live2d-motion-output-filter-prototype'

import { defaultLive2DBreathControlOptions, defaultLive2DMotionControlDynamics, neutralLive2DMotionControlPose, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d/stores'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionArHmmPrototype from '../../components/devtools/live2d-motion-ar-hmm-prototype.vue'
import Live2DMotionBreathPrototype from '../../components/devtools/live2d-motion-breath-prototype.vue'
import Live2DMotionEyeViewPrototype from '../../components/devtools/live2d-motion-eye-view-prototype.vue'
import Live2DMotionJoystick from '../../components/devtools/live2d-motion-joystick.vue'
import Live2DMotionKeyframeEditor from '../../components/devtools/live2d-motion-keyframe-editor.vue'
import Live2DMotionOutputFilterPrototype from '../../components/devtools/live2d-motion-output-filter-prototype.vue'
import Live2DMotionVarPrototype from '../../components/devtools/live2d-motion-var-prototype.vue'

import { applyLive2DEyeViewPrototype, defaultLive2DEyeViewPrototypeState } from '../../composables/live2d-motion-eye-view-prototype'
import { createLive2DMotionOutputFilter, defaultLive2DMotionOutputFilterOptions } from '../../composables/live2d-motion-output-filter-prototype'
import { useLive2DMotionRecording } from '../../composables/live2d-motion-recording'

const { t } = useI18n()
const motionControl = useLive2DMotionControl()
const ownerId = crypto.randomUUID()
const neutralPose = neutralLive2DMotionControlPose
const sourcePose = shallowRef<Live2DMotionControlPose>(neutralPose)
const pose = shallowRef<Live2DMotionControlPose>(neutralPose)
const dynamics = shallowRef<Live2DMotionControlDynamics>(defaultLive2DMotionControlDynamics)
const eyeView = shallowRef(defaultLive2DEyeViewPrototypeState)
const sourceActive = shallowRef(false)
const active = shallowRef(false)
const editorPlaying = shallowRef(false)
const varPlaying = shallowRef(false)
const arHmmPlaying = shallowRef(false)
const outputFilterOptions = shallowRef<Live2DMotionOutputFilterOptions>({ ...defaultLive2DMotionOutputFilterOptions })
const outputFilterFrame = shallowRef<Live2DMotionOutputFilterFrame>()
const outputFilter = createLive2DMotionOutputFilter(outputFilterOptions.value)
const breathEnabled = shallowRef(true)
const breathOptions = shallowRef<Live2DBreathControlOptions>({ ...defaultLive2DBreathControlOptions })
const breathStartedAtMs = shallowRef(Date.now())

function publishComposedPose(nextPose: Live2DMotionControlPose, nextEyeView = eyeView.value) {
  sourcePose.value = nextPose
  sourceActive.value = true
  pose.value = applyLive2DEyeViewPrototype(nextPose, nextEyeView)
  active.value = true
  motionControl.setPose(ownerId, pose.value, dynamics.value)
}

function publishPose(nextPose: Live2DMotionControlPose) {
  publishComposedPose(nextPose)
}

function publishGeneratedPose(nextPose: Live2DMotionControlPose) {
  const frame = outputFilter.process(nextPose)
  outputFilterFrame.value = frame
  publishPose(frame.pose)
}

function setDynamics(nextDynamics: Live2DMotionControlDynamics) {
  dynamics.value = nextDynamics
  if (active.value)
    motionControl.setPose(ownerId, pose.value, nextDynamics)
}

function publishRelease() {
  sourcePose.value = neutralPose
  sourceActive.value = false

  if (eyeView.value.enabled) {
    pose.value = applyLive2DEyeViewPrototype(neutralPose, eyeView.value)
    active.value = true
    motionControl.setPose(ownerId, pose.value, dynamics.value)
    return
  }

  pose.value = neutralPose
  active.value = false
  motionControl.release(ownerId)
}

function clearOutputFilter() {
  outputFilter.reset()
  outputFilterFrame.value = undefined
}

function publishGeneratedRelease() {
  clearOutputFilter()
  publishRelease()
}

function updateOutputFilterOptions(nextOptions: Live2DMotionOutputFilterOptions) {
  outputFilterOptions.value = nextOptions
  outputFilter.setOptions(nextOptions)
}

function resetOutputFilter() {
  const inputPose = outputFilterFrame.value?.inputPose
  clearOutputFilter()
  if (inputPose && (varPlaying.value || arHmmPlaying.value))
    publishGeneratedPose(inputPose)
}

function updateBreathEnabled(enabled: boolean) {
  breathEnabled.value = enabled
  if (!enabled) {
    motionControl.releaseBreath(ownerId)
    return
  }

  breathStartedAtMs.value = Date.now()
  motionControl.setBreath(ownerId, breathOptions.value, breathStartedAtMs.value)
}

function updateBreathOptions(nextOptions: Live2DBreathControlOptions) {
  const options = { ...nextOptions }
  if (options.minimum > options.maximum)
    options.maximum = options.minimum

  breathOptions.value = options
  if (breathEnabled.value)
    motionControl.setBreath(ownerId, options, breathStartedAtMs.value)
}

function resetBreath() {
  breathStartedAtMs.value = Date.now()
  if (breathEnabled.value)
    motionControl.setBreath(ownerId, breathOptions.value, breathStartedAtMs.value)
}

function updateVarPlayback(playing: boolean) {
  varPlaying.value = playing
  if (playing)
    clearOutputFilter()
}

function updateArHmmPlayback(playing: boolean) {
  arHmmPlaying.value = playing
  if (playing)
    clearOutputFilter()
}

function updateEyeView(nextView: typeof eyeView.value) {
  eyeView.value = nextView

  if (!sourceActive.value && !nextView.enabled) {
    pose.value = neutralPose
    active.value = false
    motionControl.release(ownerId)
    return
  }

  pose.value = applyLive2DEyeViewPrototype(sourcePose.value, nextView)
  active.value = true
  motionControl.setPose(ownerId, pose.value, dynamics.value)
}

const recordingController = useLive2DMotionRecording({
  applyPose: publishPose,
  releasePose: publishRelease,
})

function setPose(nextPose: Live2DMotionControlPose) {
  publishPose(nextPose)
  recordingController.recordPose(nextPose)
}

function publishEditorFrame(frame: Live2DMotionEditorFrame) {
  const frameEyeView = frame.eyeView
    ? { ...eyeView.value, ...frame.eyeView }
    : eyeView.value
  publishComposedPose(frame.pose, frameEyeView)
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

onMounted(() => {
  motionControl.setBreath(ownerId, breathOptions.value, breathStartedAtMs.value)
})

onUnmounted(() => {
  recordingController.dispose()
  motionControl.releaseBreath(ownerId)
  motionControl.release(ownerId)
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

    <Live2DMotionEyeViewPrototype
      :pose="pose"
      :view="eyeView"
      @update-view="updateEyeView"
    />

    <Live2DMotionJoystick
      :pose="pose"
      :dynamics="dynamics"
      :active="active"
      :disabled="editorPlaying || varPlaying || arHmmPlaying"
      @move="setPose"
      @release="release"
      @update-dynamics="setDynamics"
    />

    <Live2DMotionKeyframeEditor
      :recording="recordingController.recording.value"
      :recording-active="recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
      :disabled="varPlaying || arHmmPlaying"
      @frame="publishEditorFrame"
      @playback="editorPlaying = $event"
      @recording="recordingController.loadRecording"
      @toggle-recording="toggleRecording"
    />

    <Live2DMotionVarPrototype
      :recording="recordingController.recording.value"
      :disabled="arHmmPlaying || editorPlaying || recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
      @pose="publishGeneratedPose"
      @release="publishGeneratedRelease"
      @playback="updateVarPlayback"
    />

    <Live2DMotionArHmmPrototype
      :recording="recordingController.recording.value"
      :disabled="varPlaying || editorPlaying || recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
      @pose="publishGeneratedPose"
      @release="publishGeneratedRelease"
      @playback="updateArHmmPlayback"
    />

    <Live2DMotionOutputFilterPrototype
      :options="outputFilterOptions"
      :frame="outputFilterFrame"
      :generator-active="varPlaying || arHmmPlaying"
      @update-options="updateOutputFilterOptions"
      @reset="resetOutputFilter"
    />

    <Live2DMotionBreathPrototype
      :enabled="breathEnabled"
      :options="breathOptions"
      :started-at-ms="breathStartedAtMs"
      @update-enabled="updateBreathEnabled"
      @update-options="updateBreathOptions"
      @reset="resetBreath"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.live2d-motion.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
