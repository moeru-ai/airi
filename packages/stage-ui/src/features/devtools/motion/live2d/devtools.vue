<script setup lang="ts">
import type { StandardGamepadSnapshot } from '@proj-airi/input-gamepad'
import type { Live2DBreathControlOptions, Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionEditorFrame } from './composables/keyframes'
import type {
  Live2DMotionOutputFilterFrame,
  Live2DMotionOutputFilterOptions,
} from './composables/output-filter'

import { defaultLive2DBreathControlOptions, defaultLive2DMotionControlDynamics, neutralLive2DMotionControlPose, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d/stores'
import { BasicButton, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BreathControl from './components/breath-control.vue'
import EyeViewControl from './components/eye-view-control.vue'
import Joystick from './components/joystick.vue'
import KeyframeEditor from './components/keyframe-editor.vue'
import OutputFilter from './components/output-filter.vue'
import Preview from './components/preview.vue'
import ProceduralMotion from './components/procedural-motion.vue'
import Workbench from './components/workbench.vue'

import { useSystemAudioInputStore } from '../../../../stores/system-audio'
import { defaultLive2DMotionRecording } from './composables/default-recording'
import { applyLive2DEyeViewPrototype, defaultLive2DEyeViewPrototypeState } from './composables/eye-view'
import { createLive2DMotionOutputFilter, defaultLive2DMotionOutputFilterOptions } from './composables/output-filter'
import { useLive2DMotionRecording } from './composables/recording'

interface Props {
  gamepad?: StandardGamepadSnapshot
}

const props = defineProps<Props>()

const { t } = useI18n()
const motionControl = useLive2DMotionControl()
const systemAudio = useSystemAudioInputStore()
const {
  isRequested: systemAudioRequested,
  isStarting: systemAudioStarting,
  error: systemAudioError,
  inputLevel: systemAudioLevel,
  inputVolumeThreshold: systemAudioVolumeThreshold,
  mouthOpen: systemAudioMouthOpen,
  randomCloseDelayMs: systemAudioRandomCloseDelayMs,
  randomCloseProbability: systemAudioRandomCloseProbability,
} = storeToRefs(systemAudio)
const ownerId = crypto.randomUUID()
const neutralPose = neutralLive2DMotionControlPose
const sourcePose = shallowRef<Live2DMotionControlPose>(neutralPose)
const pose = shallowRef<Live2DMotionControlPose>(neutralPose)
const dynamics = shallowRef<Live2DMotionControlDynamics>(defaultLive2DMotionControlDynamics)
const eyeView = shallowRef(defaultLive2DEyeViewPrototypeState)
const sourceActive = shallowRef(false)
const active = shallowRef(false)
const editorPlaying = shallowRef(false)
const proceduralMotionPlaying = shallowRef(false)
const outputFilterOptions = shallowRef<Live2DMotionOutputFilterOptions>({ ...defaultLive2DMotionOutputFilterOptions })
const outputFilterFrame = shallowRef<Live2DMotionOutputFilterFrame>()
const outputFilter = createLive2DMotionOutputFilter(outputFilterOptions.value)
const breathEnabled = shallowRef(true)
const breathOptions = shallowRef<Live2DBreathControlOptions>({ ...defaultLive2DBreathControlOptions })
const breathStartedAtMs = shallowRef(Date.now())

function publishComposedPose(nextPose: Live2DMotionControlPose, nextEyeView = eyeView.value) {
  const resolvedPose = systemAudioRequested.value
    ? { ...nextPose, mouthOpen: systemAudioMouthOpen.value }
    : nextPose
  sourcePose.value = resolvedPose
  sourceActive.value = true
  pose.value = applyLive2DEyeViewPrototype(resolvedPose, nextEyeView)
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

function publishSystemAudioMouth(mouthOpen: number) {
  const nextPose = { ...sourcePose.value, mouthOpen }
  pose.value = applyLive2DEyeViewPrototype(nextPose, eyeView.value)
  active.value = true
  motionControl.setPose(ownerId, pose.value, dynamics.value)
}

async function startSystemAudioLipSync() {
  await systemAudio.start()
}

function stopSystemAudioLipSync() {
  systemAudio.stop()
  publishRelease()
}

function formatSystemAudioThreshold(value: number): string {
  return value.toFixed(2)
}

function formatSystemAudioDelay(value: number): string {
  return `${value} ms`
}

function formatSystemAudioProbability(value: number): string {
  return `${Math.round(value * 100)}%`
}

async function toggleSystemAudioLipSync() {
  if (systemAudioRequested.value) {
    stopSystemAudioLipSync()
    return
  }

  await startSystemAudioLipSync()
}

watch(systemAudioMouthOpen, (value) => {
  if (systemAudioRequested.value)
    publishSystemAudioMouth(value)
})

watch(
  [systemAudioVolumeThreshold, systemAudioRandomCloseDelayMs, systemAudioRandomCloseProbability],
  () => void systemAudio.updateLipSyncOptions(),
  { immediate: true },
)

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
  if (inputPose && proceduralMotionPlaying.value)
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

function updateProceduralMotionPlayback(playing: boolean) {
  proceduralMotionPlaying.value = playing
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
  initialRecording: defaultLive2DMotionRecording,
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

function restartRecording() {
  if (recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording')
    recordingController.stopRecording()
  recordingController.startRecording()
}

onUnmounted(() => {
  stopSystemAudioLipSync()
  recordingController.dispose()
  motionControl.releaseBreath(ownerId)
  motionControl.release(ownerId)
})
</script>

<template>
  <div :class="['min-h-0 flex-1 p-2']">
    <Workbench>
      <template #direct-control>
        <div :class="['flex flex-col gap-4']">
          <section
            :class="[
              'rounded-xl bg-neutral-100/70 p-3',
              'dark:bg-neutral-900/55',
            ]"
          >
            <div :class="['flex items-start justify-between gap-3']">
              <div :class="['min-w-0']">
                <div :class="['text-xs font-semibold text-neutral-900 dark:text-neutral-100']">
                  {{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.title') }}
                </div>
                <p :class="['mt-1 text-xs text-neutral-500 dark:text-neutral-400']">
                  {{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.description') }}
                </p>
              </div>
              <BasicButton
                size="sm"
                :disabled="systemAudioStarting"
                @click="toggleSystemAudioLipSync"
              >
                {{ systemAudioRequested
                  ? t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.actions.stop')
                  : t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.actions.start') }}
              </BasicButton>
            </div>

            <div :class="['mt-3 grid gap-3 rounded-lg bg-neutral-100/80 p-3 text-xs dark:bg-neutral-800/70']">
              <FieldRange
                v-model="systemAudioVolumeThreshold"
                :label="t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.input-volume-threshold')"
                :min="0"
                :max="1"
                :step="0.01"
                :format-value="formatSystemAudioThreshold"
              />
              <FieldRange
                v-model="systemAudioRandomCloseDelayMs"
                :label="t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.random-close-delay')"
                :min="100"
                :max="1000"
                :step="10"
                :format-value="formatSystemAudioDelay"
              />
              <FieldRange
                v-model="systemAudioRandomCloseProbability"
                :label="t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.random-close-probability')"
                :min="0"
                :max="1"
                :step="0.01"
                :format-value="formatSystemAudioProbability"
              />
            </div>

            <div :class="['mt-3 grid grid-cols-2 gap-2 text-xs']">
              <div :class="['rounded-lg bg-neutral-100/80 p-2 dark:bg-neutral-800/70']">
                <div :class="['text-neutral-500 dark:text-neutral-400']">
                  {{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.signal') }}
                </div>
                <div :class="['mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700']">
                  <div
                    :class="['h-full rounded-full bg-primary-500 transition-[width] duration-75']"
                    :style="{ width: `${systemAudioLevel * 100}%` }"
                  />
                </div>
                <div :class="['mt-1 font-mono text-neutral-700 tabular-nums dark:text-neutral-200']">
                  {{ systemAudioLevel.toFixed(3) }}
                </div>
              </div>
              <div :class="['rounded-lg bg-neutral-100/80 p-2 dark:bg-neutral-800/70']">
                <div :class="['text-neutral-500 dark:text-neutral-400']">
                  {{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.mouth-open') }}
                </div>
                <div :class="['mt-2 font-mono text-neutral-700 tabular-nums dark:text-neutral-200']">
                  {{ systemAudioMouthOpen.toFixed(3) }}
                </div>
              </div>
            </div>

            <p v-if="systemAudioError" :class="['mt-2 text-xs text-red-600 dark:text-red-400']">
              {{ systemAudioError }}
            </p>
          </section>

          <Joystick
            :pose="pose"
            :dynamics="dynamics"
            :disabled="editorPlaying || proceduralMotionPlaying"
            :gamepad="props.gamepad"
            @move="setPose"
            @release="release"
            @update-dynamics="setDynamics"
          />

          <EyeViewControl
            :pose="pose"
            :view="eyeView"
            @update-view="updateEyeView"
          />

          <BreathControl
            :enabled="breathEnabled"
            :options="breathOptions"
            :started-at-ms="breathStartedAtMs"
            @update-enabled="updateBreathEnabled"
            @update-options="updateBreathOptions"
            @reset="resetBreath"
          />
        </div>
      </template>

      <template #preview>
        <Preview :pose="pose" />
      </template>

      <template #timeline>
        <KeyframeEditor
          :recording="recordingController.recording.value"
          :recording-active="recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
          :disabled="proceduralMotionPlaying"
          :gamepad="props.gamepad"
          @frame="publishEditorFrame"
          @playback="editorPlaying = $event"
          @recording="recordingController.loadRecording"
          @restart-recording="restartRecording"
          @toggle-recording="toggleRecording"
        />
      </template>

      <template #inference>
        <div :class="['flex flex-col gap-4']">
          <ProceduralMotion
            :recording="recordingController.recording.value"
            :disabled="editorPlaying || recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
            @pose="publishGeneratedPose"
            @release="publishGeneratedRelease"
            @playback="updateProceduralMotionPlayback"
          />

          <OutputFilter
            :options="outputFilterOptions"
            :frame="outputFilterFrame"
            :generator-active="proceduralMotionPlaying"
            @update-options="updateOutputFilterOptions"
            @reset="resetOutputFilter"
          />
        </div>
      </template>
    </Workbench>
  </div>
</template>
