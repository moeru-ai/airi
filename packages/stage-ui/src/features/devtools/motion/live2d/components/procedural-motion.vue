<script setup lang="ts">
import type { Pose } from '@proj-airi/model-driver-magic-live2d'
import type { SelectTabOption } from '@proj-airi/ui'

import type { Live2DMotionMagicMethod } from '../../../../motions/live2d'
import type { ReadonlyLive2DMotionRecording } from '../composables/recording'

import { BasicButton, FieldRange, SelectTab } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import OutputFilter from './output-filter.vue'

import { useLive2DMotionMagic } from '../../../../motions/live2d'

const props = defineProps<{
  recording?: ReadonlyLive2DMotionRecording | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  pose: [pose: Pose]
  release: []
  playback: [playing: boolean]
}>()

const { t } = useI18n()
const motion = useLive2DMotionMagic({
  dataset: () => props.recording,
  disabled: () => props.disabled ?? false,
  forceViewTarget: false,
  publishPose: pose => emit('pose', pose),
  releasePose: () => emit('release'),
  setPlaying: playing => emit('playback', playing),
})

const modelOptions = computed<SelectTabOption<Live2DMotionMagicMethod>[]>(() => [
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.var.title'),
    value: 'var',
    icon: 'i-mingcute:chart-line-fill',
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.title'),
    value: 'ar-hmm',
    icon: 'i-mingcute:git-branch-fill',
  },
])

const translationPrefix = computed(() => motion.method.value === 'var'
  ? 'tamagotchi.settings.devtools.pages.live2d-motion.var'
  : 'tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm')

const recordingSummary = computed(() => {
  if (!props.recording)
    return t(`${translationPrefix.value}.status.no-source`)
  return t(`${translationPrefix.value}.status.source-ready`, {
    count: props.recording.samples.length,
    duration: (props.recording.durationMs / 1000).toFixed(1),
  })
})

const diagnostics = computed(() => {
  const model = motion.model.value
  const items = [
    {
      id: 'source',
      label: t(`${translationPrefix.value}.diagnostics.source`),
      value: recordingSummary.value,
    },
  ]

  if (model?.method === 'var') {
    items.push(
      {
        id: 'model',
        label: t(`${translationPrefix.value}.diagnostics.model`),
        value: t(`${translationPrefix.value}.values.model`, {
          channels: model.diagnostics.channelCount,
          features: model.diagnostics.featureCount,
        }),
      },
      {
        id: 'fit',
        label: t(`${translationPrefix.value}.diagnostics.fit`),
        value: t(`${translationPrefix.value}.values.fit`, {
          frames: model.diagnostics.sourceFrameCount,
          error: model.diagnostics.residualRootMeanSquare.toFixed(3),
          duration: motion.fitDurationMs.value.toFixed(0),
        }),
      },
    )
  }
  else if (model?.method === 'ar-hmm') {
    const occupancy = model.diagnostics.stateOccupancy
      .map(value => `${Math.round(value * 100)}%`)
      .join(' / ')
    items.push(
      {
        id: 'model',
        label: t(`${translationPrefix.value}.diagnostics.model`),
        value: t(`${translationPrefix.value}.values.model`, {
          states: model.diagnostics.stateCount,
          channels: model.diagnostics.channelCount,
          features: model.diagnostics.featureCount,
        }),
      },
      {
        id: 'fit',
        label: t(`${translationPrefix.value}.diagnostics.fit`),
        value: t(`${translationPrefix.value}.values.fit`, {
          likelihood: model.diagnostics.meanLogLikelihoodPerFrame.toFixed(2),
          duration: motion.fitDurationMs.value.toFixed(0),
        }),
      },
      {
        id: 'states',
        label: t(`${translationPrefix.value}.diagnostics.states`),
        value: t(`${translationPrefix.value}.values.states`, {
          occupancy,
          dwell: model.diagnostics.meanDwellSeconds.toFixed(1),
        }),
      },
    )
  }
  else {
    items.push(
      {
        id: 'model',
        label: t(`${translationPrefix.value}.diagnostics.model`),
        value: '—',
      },
      {
        id: 'fit',
        label: t(`${translationPrefix.value}.diagnostics.fit`),
        value: '—',
      },
    )
  }

  items.push({
    id: 'run',
    label: t(`${translationPrefix.value}.diagnostics.run`),
    value: motion.method.value === 'var'
      ? t(`${translationPrefix.value}.values.run`, {
          seed: motion.seed.value,
          duration: `${motion.generatedDurationSeconds.value.toFixed(1)}s`,
        })
      : t(`${translationPrefix.value}.values.run`, {
          state: motion.currentState.value === undefined ? '—' : motion.currentState.value + 1,
          seed: motion.seed.value,
          duration: `${motion.generatedDurationSeconds.value.toFixed(1)}s`,
        }),
  })
  return items
})

function formatOrder(value: number): string {
  return t(`${translationPrefix.value}.values.frames`, { count: value })
}

function formatStateCount(value: number): string {
  return t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.values.count', { count: value })
}

function formatStrength(value: number): string {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <section
    :class="[
      'rounded-xl bg-primary-50/65 p-4',
      'dark:bg-primary-950/25',
    ]"
  >
    <SelectTab
      v-model="motion.method.value"
      :options="modelOptions"
      :disabled="motion.playing.value || motion.status.value === 'initializing'"
      size="sm"
      :class="['mb-4 w-full']"
    />

    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div :class="['min-w-0 flex-1']">
        <h3 :class="['mb-1 font-medium text-neutral-900 dark:text-neutral-100']">
          {{ t(`${translationPrefix}.title`) }}
        </h3>
        <p :class="['max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t(`${translationPrefix}.description`) }}
        </p>
      </div>

      <div :class="['flex flex-wrap items-center gap-1']">
        <BasicButton
          :disabled="props.disabled || !props.recording || motion.playing.value || motion.status.value === 'initializing'"
          :loading="motion.status.value === 'initializing'"
          @click="motion.initialize()"
        >
          <span :class="['i-mingcute:chart-line-line']" />
          {{ motion.model.value
            ? t(`${translationPrefix}.actions.refit`)
            : t(`${translationPrefix}.actions.fit`) }}
        </BasicButton>
        <BasicButton
          v-if="!motion.playing.value"
          :disabled="props.disabled || !motion.model.value"
          @click="motion.start"
        >
          <span :class="['i-mingcute:play-line']" />
          {{ t(`${translationPrefix}.actions.generate`) }}
        </BasicButton>
        <BasicButton v-else @click="motion.stop">
          <span :class="['i-mingcute:stop-circle-line']" />
          {{ t(`${translationPrefix}.actions.stop`) }}
        </BasicButton>
        <BasicButton :disabled="props.disabled" @click="motion.randomizeSeed">
          <span :class="['i-mingcute:shuffle-line']" />
          {{ t(`${translationPrefix}.actions.new-seed`) }}
        </BasicButton>
      </div>
    </div>

    <div :class="['procedural-motion-fields mt-4 grid gap-4']">
      <FieldRange
        v-if="motion.method.value === 'ar-hmm'"
        v-model="motion.arHmmSettings.stateCount"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.states.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.states.description')"
        :min="2"
        :max="8"
        :step="1"
        :default-value="5"
        :format-value="formatStateCount"
        as="div"
      />
      <FieldRange
        v-if="motion.method.value === 'var'"
        v-model="motion.varSettings.order"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.var.order.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.var.order.description')"
        :min="1"
        :max="48"
        :step="1"
        :default-value="20"
        :format-value="formatOrder"
        as="div"
      />
      <FieldRange
        v-else
        v-model="motion.arHmmSettings.order"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.order.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.order.description')"
        :min="1"
        :max="18"
        :step="1"
        :default-value="12"
        :format-value="formatOrder"
        as="div"
      />
      <FieldRange
        v-if="motion.method.value === 'var'"
        v-model="motion.varSettings.noiseScale"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.var.residual.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.var.residual.description')"
        :min="0"
        :max="3"
        :step="0.025"
        :default-value="1.15"
        :format-value="formatStrength"
        as="div"
      />
      <FieldRange
        v-else
        v-model="motion.arHmmSettings.noiseScale"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.residual.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.ar-hmm.residual.description')"
        :min="0"
        :max="3"
        :step="0.025"
        :default-value="0.8"
        :format-value="formatStrength"
        as="div"
      />
    </div>

    <dl :class="['procedural-motion-diagnostics mt-4 grid gap-2 text-xs']">
      <div
        v-for="item in diagnostics"
        :key="item.id"
        :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']"
      >
        <dt :class="['text-neutral-400 dark:text-neutral-500']">
          {{ item.label }}
        </dt>
        <dd :class="['mt-1 break-words font-mono text-neutral-700 dark:text-neutral-200']">
          {{ item.value }}
        </dd>
      </div>
    </dl>

    <p v-if="motion.error.value" :class="['mt-3 text-sm text-red-500 dark:text-red-400']">
      {{ motion.error.value }}
    </p>
  </section>

  <OutputFilter
    :options="motion.outputFilterOptions.value"
    :frame="motion.outputFilterFrame.value"
    :generator-active="motion.playing.value"
    @update-options="motion.setOutputFilterOptions"
    @reset="motion.resetOutputFilter"
  />
</template>

<style scoped>
.procedural-motion-fields {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}

.procedural-motion-diagnostics {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
}
</style>
