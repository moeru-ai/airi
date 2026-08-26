<script setup lang="ts">
import type { Live2DBreathControlOptions, Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionEditorFrame } from '../../composables/live2d-motion-keyframes'
import type {
  Live2DMotionOutputFilterFrame,
  Live2DMotionOutputFilterOptions,
} from '../../composables/live2d-motion-output-filter-prototype'

import { defaultLive2DBreathControlOptions, defaultLive2DMotionControlDynamics, neutralLive2DMotionControlPose, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d/stores'
import { useSystemAudioInputStore } from '@proj-airi/stage-ui/stores'
import { BasicButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import Live2DMotionArHmmPrototype from '../../components/devtools/live2d-motion-ar-hmm-prototype.vue'
import Live2DMotionBreathPrototype from '../../components/devtools/live2d-motion-breath-prototype.vue'
import Live2DMotionEyeViewPrototype from '../../components/devtools/live2d-motion-eye-view-prototype.vue'
import Live2DMotionJoystick from '../../components/devtools/live2d-motion-joystick.vue'
import Live2DMotionKeyframeEditor from '../../components/devtools/live2d-motion-keyframe-editor.vue'
import Live2DMotionOutputFilterPrototype from '../../components/devtools/live2d-motion-output-filter-prototype.vue'
import Live2DMotionPreview from '../../components/devtools/live2d-motion-preview.vue'
import Live2DMotionVarPrototype from '../../components/devtools/live2d-motion-var-prototype.vue'
import Live2DMotionWorkbench from '../../components/devtools/live2d-motion-workbench.vue'

import { defaultLive2DMotionRecording } from '../../composables/live2d-motion-default-recording'
import { applyLive2DEyeViewPrototype, defaultLive2DEyeViewPrototypeState } from '../../composables/live2d-motion-eye-view-prototype'
import { createLive2DMotionOutputFilter, defaultLive2DMotionOutputFilterOptions } from '../../composables/live2d-motion-output-filter-prototype'
import { useLive2DMotionRecording } from '../../composables/live2d-motion-recording'
import { useStandardGamepad } from '../../composables/use-standard-gamepad'

const { t } = useI18n()
const router = useRouter()
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
const varPlaying = shallowRef(false)
const arHmmPlaying = shallowRef(false)
const outputFilterOptions = shallowRef<Live2DMotionOutputFilterOptions>({ ...defaultLive2DMotionOutputFilterOptions })
const outputFilterFrame = shallowRef<Live2DMotionOutputFilterFrame>()
const outputFilter = createLive2DMotionOutputFilter(outputFilterOptions.value)
const breathEnabled = shallowRef(true)
const breathOptions = shallowRef<Live2DBreathControlOptions>({ ...defaultLive2DBreathControlOptions })
const breathStartedAtMs = shallowRef(Date.now())
const gamepad = useStandardGamepad()

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
  <main :class="['flex h-full min-h-0 w-full flex-col overflow-hidden', 'bg-neutral-50/80 dark:bg-neutral-950']">
    <header
      :class="[
        'drag-region flex shrink-0 items-center gap-3 border-b border-neutral-200/70 px-4 py-3',
        'bg-white/75 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/75',
      ]"
    >
      <BasicButton
        size="sm"
        :title="t('tamagotchi.settings.devtools.pages.live2d-motion.actions.back')"
        :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.actions.back')"
        :class="['[-webkit-app-region:no-drag]']"
        @click="router.back()"
      >
        <span :class="['i-solar:alt-arrow-left-linear size-4']" />
      </BasicButton>
      <div :class="['min-w-0']">
        <h1 :class="['truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.title') }}
        </h1>
        <p :class="['truncate text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.description') }}
        </p>
      </div>
    </header>

    <div :class="['min-h-0 flex-1 p-2']">
      <Live2DMotionWorkbench>
        <template #direct-control>
          <div :class="['flex flex-col gap-4']">
            <section
              :class="[
                'rounded-xl border p-3',
                'border-neutral-200/80 bg-white/70 dark:border-neutral-800 dark:bg-neutral-900/65',
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
                <label :class="['grid gap-1.5']">
                  <span :class="['flex items-center justify-between gap-3 text-neutral-600 dark:text-neutral-300']">
                    <span>{{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.input-volume-threshold') }}</span>
                    <span :class="['font-mono tabular-nums']">{{ systemAudioVolumeThreshold.toFixed(2) }}</span>
                  </span>
                  <input
                    v-model.number="systemAudioVolumeThreshold"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    :class="['w-full accent-primary-500']"
                  >
                </label>
                <label :class="['grid gap-1.5']">
                  <span :class="['flex items-center justify-between gap-3 text-neutral-600 dark:text-neutral-300']">
                    <span>{{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.random-close-delay') }}</span>
                    <span :class="['font-mono tabular-nums']">{{ systemAudioRandomCloseDelayMs }} ms</span>
                  </span>
                  <input
                    v-model.number="systemAudioRandomCloseDelayMs"
                    type="range"
                    min="100"
                    max="1000"
                    step="10"
                    :class="['w-full accent-primary-500']"
                  >
                </label>
                <label :class="['grid gap-1.5']">
                  <span :class="['flex items-center justify-between gap-3 text-neutral-600 dark:text-neutral-300']">
                    <span>{{ t('tamagotchi.settings.devtools.pages.live2d-motion.system-audio.random-close-probability') }}</span>
                    <span :class="['font-mono tabular-nums']">{{ Math.round(systemAudioRandomCloseProbability * 100) }}%</span>
                  </span>
                  <input
                    v-model.number="systemAudioRandomCloseProbability"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    :class="['w-full accent-primary-500']"
                  >
                </label>
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

            <Live2DMotionJoystick
              :pose="pose"
              :dynamics="dynamics"
              :active="active"
              :disabled="editorPlaying || varPlaying || arHmmPlaying"
              :gamepad="gamepad"
              @move="setPose"
              @release="release"
              @update-dynamics="setDynamics"
            />

            <Live2DMotionEyeViewPrototype
              :pose="pose"
              :view="eyeView"
              @update-view="updateEyeView"
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

        <template #preview>
          <Live2DMotionPreview :pose="pose" />
        </template>

        <template #timeline>
          <Live2DMotionKeyframeEditor
            :recording="recordingController.recording.value"
            :recording-active="recordingController.status.value.type === 'armed' || recordingController.status.value.type === 'recording'"
            :disabled="varPlaying || arHmmPlaying"
            :gamepad="gamepad"
            @frame="publishEditorFrame"
            @playback="editorPlaying = $event"
            @recording="recordingController.loadRecording"
            @restart-recording="restartRecording"
            @toggle-recording="toggleRecording"
          />
        </template>

        <template #inference>
          <div :class="['flex flex-col gap-4']">
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
          </div>
        </template>
      </Live2DMotionWorkbench>
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
  titleKey: tamagotchi.settings.devtools.pages.live2d-motion.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
