<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { ReadonlyLive2DMotionRecording } from '../../composables/live2d-motion-recording'
import type { Live2DMotionVarGenerator, Live2DMotionVarModel } from '../../composables/live2d-motion-var-prototype'

import { errorMessageFrom } from '@moeru/std'
import { BasicButton, FieldRange } from '@proj-airi/ui'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { createLive2DMotionVarGenerator, fitLive2DMotionVar } from '../../composables/live2d-motion-var-prototype'

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
const defaultOrder = 20
const defaultResidualStrength = 1.15
const order = shallowRef(defaultOrder)
const residualStrength = shallowRef(defaultResidualStrength)
const seed = shallowRef(1)
const model = shallowRef<Live2DMotionVarModel>()
const fitDurationMs = shallowRef(0)
const fitError = shallowRef('')
const playing = shallowRef(false)
const generatedFrameCount = shallowRef(0)

let generator: Live2DMotionVarGenerator | undefined
let animationFrame: number | undefined
let lastFrameAt = 0
let accumulatedMs = 0

// Generation owns the shared motion target from start until stop. The fixed-rate
// model can advance more than once per display frame, but only its newest pose is published.

const recordingSummary = computed(() => {
  if (!props.recording)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.var.status.no-source')
  return t('tamagotchi.settings.devtools.pages.live2d-motion.var.status.source-ready', {
    count: props.recording.samples.length,
    duration: (props.recording.durationMs / 1000).toFixed(1),
  })
})

const generatedDuration = computed(() => {
  if (!model.value)
    return '0.0s'
  return `${(generatedFrameCount.value / model.value.options.sampleRate).toFixed(1)}s`
})

function formatOrder(value: number): string {
  return t('tamagotchi.settings.devtools.pages.live2d-motion.var.values.frames', { count: value })
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
  emit('playback', false)
  emit('release')
}

function invalidateModel() {
  stopGeneration()
  model.value = undefined
  fitDurationMs.value = 0
  fitError.value = ''
  generatedFrameCount.value = 0
}

function fitRecording() {
  if (!props.recording)
    return

  stopGeneration()
  const startedAt = performance.now()
  try {
    model.value = fitLive2DMotionVar(props.recording, {
      order: order.value,
      sampleRate: 30,
      ridge: 0.001,
    })
    fitDurationMs.value = performance.now() - startedAt
    fitError.value = ''
    generatedFrameCount.value = 0
  }
  catch (error) {
    console.error('[Live2D VAR prototype] Failed to fit motion', errorMessageFrom(error))
    model.value = undefined
    fitDurationMs.value = 0
    fitError.value = errorMessageFrom(error) ?? t('tamagotchi.settings.devtools.pages.live2d-motion.var.status.fit-failed')
  }
}

function publishNextPose(): Live2DMotionControlPose | undefined {
  if (!generator)
    return

  generatedFrameCount.value++
  return generator.nextPose(residualStrength.value)
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

  generator = createLive2DMotionVarGenerator(model.value, seed.value)
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

  generator = createLive2DMotionVarGenerator(model.value, seed.value)
  generatedFrameCount.value = 0
  accumulatedMs = 0
  lastFrameAt = performance.now()
}

watch(() => props.recording, invalidateModel)
watch(order, invalidateModel)
watch(() => props.disabled, (disabled) => {
  if (disabled)
    stopGeneration()
})

onUnmounted(stopGeneration)
</script>

<template>
  <section :class="['rounded-xl bg-primary-50/55 p-4 dark:bg-primary-950/20']">
    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div>
        <div :class="['mb-1 flex items-center gap-2']">
          <span :class="['rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700', 'dark:bg-primary-900/50 dark:text-primary-200']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.prototype') }}
          </span>
          <h3 :class="['font-medium text-neutral-900 dark:text-neutral-100']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.title') }}
          </h3>
        </div>
        <p :class="['max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.question') }}
        </p>
      </div>
      <div :class="['flex flex-wrap items-center gap-1']">
        <BasicButton :disabled="props.disabled || !props.recording || playing" @click="fitRecording">
          <span :class="['i-solar:graph-new-up-bold-duotone']" />
          {{ model
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.var.actions.refit')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.var.actions.fit') }}
        </BasicButton>
        <BasicButton v-if="!playing" :disabled="props.disabled || !model" @click="startGeneration">
          <span :class="['i-solar:play-bold']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.actions.generate') }}
        </BasicButton>
        <BasicButton v-else @click="stopGeneration">
          <span :class="['i-solar:stop-circle-bold']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.actions.stop') }}
        </BasicButton>
        <BasicButton :disabled="props.disabled" @click="useNewSeed">
          <span :class="['i-solar:shuffle-bold-duotone']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.actions.new-seed') }}
        </BasicButton>
      </div>
    </div>

    <div :class="['var-controls-grid mt-4 grid gap-4']">
      <FieldRange
        v-model="order"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.var.order.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.var.order.description')"
        :min="1"
        :max="48"
        :step="1"
        :default-value="defaultOrder"
        :format-value="formatOrder"
        as="div"
      />
      <FieldRange
        v-model="residualStrength"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.var.residual.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.var.residual.description')"
        :min="0"
        :max="3"
        :step="0.025"
        :default-value="defaultResidualStrength"
        :format-value="formatStrength"
        as="div"
      />
    </div>

    <div :class="['var-diagnostics-grid mt-4 grid gap-2 text-xs']">
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.diagnostics.source') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ recordingSummary }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.diagnostics.model') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ model
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.var.values.model', { channels: model.channelCount, features: model.featureCount })
            : '—' }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.diagnostics.fit') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ model
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.var.values.fit', {
              frames: model.sourceFrameCount,
              error: model.residualRootMeanSquare.toFixed(3),
              duration: fitDurationMs.toFixed(0),
            })
            : '—' }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.diagnostics.run') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.var.values.run', { seed, duration: generatedDuration }) }}
        </div>
      </div>
    </div>

    <p v-if="fitError" :class="['mt-3 text-sm text-red-500 dark:text-red-400']">
      {{ fitError }}
    </p>
  </section>
</template>

<style scoped>
.var-controls-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}

.var-diagnostics-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
}
</style>
