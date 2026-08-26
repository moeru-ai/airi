<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionArHmmGenerator, Live2DMotionArHmmModel } from '../../composables/live2d-motion-ar-hmm-prototype'
import type { ReadonlyLive2DMotionRecording } from '../../composables/live2d-motion-recording'

import { errorMessageFrom } from '@moeru/std'
import { BasicButton, FieldRange } from '@proj-airi/ui'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { createLive2DMotionArHmmGenerator, fitLive2DMotionArHmm } from '../../composables/live2d-motion-ar-hmm-prototype'

const props = defineProps<{
  recording?: ReadonlyLive2DMotionRecording | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  pose: [pose: Live2DMotionControlPose]
  release: []
  playback: [playing: boolean]
}>()

const { t } = useI18n()
const defaultStateCount = 5
const defaultOrder = 12
const defaultResidualStrength = 0.8
const stateCount = shallowRef(defaultStateCount)
const order = shallowRef(defaultOrder)
const residualStrength = shallowRef(defaultResidualStrength)
const seed = shallowRef(1)
const model = shallowRef<Live2DMotionArHmmModel>()
const fitDurationMs = shallowRef(0)
const fitError = shallowRef('')
const playing = shallowRef(false)
const generatedFrameCount = shallowRef(0)
const currentState = shallowRef<number>()

let generator: Live2DMotionArHmmGenerator | undefined
let animationFrame: number | undefined
let lastFrameAt = 0
let accumulatedMs = 0

// Generation owns the shared motion target from start until stop. The fixed-rate
// model can advance more than once per display frame, but only its newest pose is published.

const recordingSummary = computed(() => {
  if (!props.recording)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.status.no-source')
  return t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.status.source-ready', {
    count: props.recording.samples.length,
    duration: (props.recording.durationMs / 1000).toFixed(1),
  })
})

const generatedDuration = computed(() => {
  if (!model.value)
    return '0.0s'
  return `${(generatedFrameCount.value / model.value.options.sampleRate).toFixed(1)}s`
})

const stateSummary = computed(() => {
  if (!model.value)
    return '—'
  return model.value.stateOccupancy.map(value => `${Math.round(value * 100)}%`).join(' / ')
})

const diagnostics = computed(() => [
  {
    id: 'source',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.diagnostics.source'),
    value: recordingSummary.value,
  },
  {
    id: 'model',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.diagnostics.model'),
    value: model.value
      ? t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.model', {
          states: model.value.options.stateCount,
          channels: model.value.sourceModel.channelCount,
          features: model.value.sourceModel.featureCount,
        })
      : '—',
  },
  {
    id: 'fit',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.diagnostics.fit'),
    value: model.value
      ? t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.fit', {
          likelihood: (model.value.logLikelihoods.at(-1)! / model.value.posteriorProbabilities.length).toFixed(2),
          duration: fitDurationMs.value.toFixed(0),
        })
      : '—',
  },
  {
    id: 'states',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.diagnostics.states'),
    value: model.value
      ? t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.states', {
          occupancy: stateSummary.value,
          dwell: (model.value.meanDwellFrames / model.value.options.sampleRate).toFixed(1),
        })
      : '—',
  },
  {
    id: 'run',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.diagnostics.run'),
    value: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.run', {
      state: currentState.value === undefined ? '—' : currentState.value + 1,
      seed: seed.value,
      duration: generatedDuration.value,
    }),
  },
])

function formatCount(value: number): string {
  return t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.count', { count: value })
}

function formatOrder(value: number): string {
  return t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.frames', { count: value })
}

function formatStrength(value: number): string {
  return `${Math.round(value * 100)}%`
}

function stopGeneration() {
  if (!playing.value)
    return

  if (animationFrame !== undefined)
    cancelAnimationFrame(animationFrame)
  animationFrame = undefined
  generator = undefined
  playing.value = false
  currentState.value = undefined
  emit('playback', false)
  emit('release')
}

function invalidateModel() {
  stopGeneration()
  model.value = undefined
  fitDurationMs.value = 0
  fitError.value = ''
  generatedFrameCount.value = 0
  currentState.value = undefined
}

function fitRecording() {
  if (!props.recording)
    return

  stopGeneration()
  const startedAt = performance.now()
  try {
    model.value = fitLive2DMotionArHmm(props.recording, {
      stateCount: stateCount.value,
      order: order.value,
      sampleRate: 30,
      ridge: 0.003,
      iterations: 6,
    })
    fitDurationMs.value = performance.now() - startedAt
    fitError.value = ''
    generatedFrameCount.value = 0
    currentState.value = undefined
  }
  catch (error) {
    console.error('[Live2D AR-HMM prototype] Failed to fit motion', errorMessageFrom(error))
    model.value = undefined
    fitDurationMs.value = 0
    fitError.value = errorMessageFrom(error) ?? t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.status.fit-failed')
  }
}

function publishNextPose(): Live2DMotionControlPose | undefined {
  if (!generator)
    return

  const frame = generator.nextFrame(residualStrength.value)
  generatedFrameCount.value++
  currentState.value = frame.state
  return frame.pose
}

function generationFrame(now: number) {
  if (!playing.value || !model.value)
    return

  const frameIntervalMs = 1000 / model.value.options.sampleRate
  accumulatedMs += Math.min(250, Math.max(0, now - lastFrameAt))
  lastFrameAt = now

  let nextPose: Live2DMotionControlPose | undefined
  while (accumulatedMs >= frameIntervalMs) {
    nextPose = publishNextPose()
    accumulatedMs -= frameIntervalMs
  }
  if (nextPose)
    emit('pose', nextPose)

  animationFrame = requestAnimationFrame(generationFrame)
}

function startGeneration() {
  if (!model.value || playing.value)
    return

  generator = createLive2DMotionArHmmGenerator(model.value, seed.value)
  generatedFrameCount.value = 0
  accumulatedMs = 0
  lastFrameAt = performance.now()
  playing.value = true
  emit('playback', true)
  const firstPose = publishNextPose()
  if (firstPose)
    emit('pose', firstPose)
  animationFrame = requestAnimationFrame(generationFrame)
}

function useNewSeed() {
  seed.value = crypto.getRandomValues(new Uint32Array(1))[0]
  if (!playing.value || !model.value)
    return

  generator = createLive2DMotionArHmmGenerator(model.value, seed.value)
  generatedFrameCount.value = 0
  accumulatedMs = 0
  lastFrameAt = performance.now()
  currentState.value = undefined
}

watch(() => props.recording, invalidateModel)
watch([stateCount, order], invalidateModel)
watch(() => props.disabled, (disabled) => {
  if (disabled)
    stopGeneration()
})

onUnmounted(stopGeneration)
</script>

<template>
  <section :class="['rounded-xl bg-violet-50/55 p-4 dark:bg-violet-950/20']">
    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div>
        <div :class="['mb-1 flex items-center gap-2']">
          <span :class="['rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700', 'dark:bg-violet-900/50 dark:text-violet-200']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.prototype') }}
          </span>
          <h3 :class="['font-medium text-neutral-900 dark:text-neutral-100']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.title') }}
          </h3>
        </div>
        <p :class="['max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.question') }}
        </p>
      </div>
      <div :class="['ar-hmm-actions-grid grid gap-1']">
        <BasicButton :disabled="props.disabled || !props.recording || playing" :class="['w-full justify-center']" @click="fitRecording">
          <span :class="['i-solar:graph-new-up-bold-duotone']" />
          {{ model
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.actions.refit')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.actions.fit') }}
        </BasicButton>
        <BasicButton v-if="!playing" :disabled="props.disabled || !model" :class="['w-full justify-center']" @click="startGeneration">
          <span :class="['i-solar:play-bold']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.actions.generate') }}
        </BasicButton>
        <BasicButton v-else :class="['w-full justify-center']" @click="stopGeneration">
          <span :class="['i-solar:stop-circle-bold']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.actions.stop') }}
        </BasicButton>
        <BasicButton :disabled="props.disabled" :class="['w-full justify-center']" @click="useNewSeed">
          <span :class="['i-solar:shuffle-bold-duotone']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.actions.new-seed') }}
        </BasicButton>
      </div>
    </div>

    <div :class="['ar-hmm-controls-grid mt-4 grid gap-4']">
      <FieldRange
        v-model="stateCount"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.states.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.states.description')"
        :min="2"
        :max="8"
        :step="1"
        :default-value="defaultStateCount"
        :format-value="formatCount"
        as="div"
        :class="['rounded-lg bg-white/65 p-3 dark:bg-neutral-950/30']"
      />
      <FieldRange
        v-model="order"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.order.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.order.description')"
        :min="1"
        :max="18"
        :step="1"
        :default-value="defaultOrder"
        :format-value="formatOrder"
        as="div"
        :class="['rounded-lg bg-white/65 p-3 dark:bg-neutral-950/30']"
      />
      <FieldRange
        v-model="residualStrength"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.residual.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.residual.description')"
        :min="0"
        :max="3"
        :step="0.025"
        :default-value="defaultResidualStrength"
        :format-value="formatStrength"
        as="div"
        :class="['rounded-lg bg-white/65 p-3 dark:bg-neutral-950/30']"
      />
    </div>

    <dl :class="['mt-4 divide-y divide-violet-100/80 overflow-hidden rounded-lg bg-white/65 text-xs dark:divide-violet-900/60 dark:bg-neutral-950/30']">
      <div
        v-for="item in diagnostics"
        :key="item.id"
        :class="['ar-hmm-diagnostic-row grid items-start gap-2 px-3 py-2.5']"
      >
        <dt :class="['text-neutral-400 dark:text-neutral-500']">
          {{ item.label }}
        </dt>
        <dd :class="['break-words text-right font-mono text-neutral-700 dark:text-neutral-200']">
          {{ item.value }}
        </dd>
      </div>
    </dl>

    <p v-if="fitError" :class="['mt-3 text-sm text-red-500 dark:text-red-400']">
      {{ fitError }}
    </p>
  </section>
</template>

<style scoped>
.ar-hmm-actions-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
}

.ar-hmm-controls-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
}

.ar-hmm-diagnostic-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
}
</style>
