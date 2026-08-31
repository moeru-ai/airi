<script setup lang="ts">
import type { Live2DBreathControlOptions } from '@proj-airi/stage-ui-live2d/stores'

import { defaultLive2DBreathControlOptions, sampleLive2DBreath } from '@proj-airi/stage-ui-live2d/stores'
import { BasicButton, FieldRange } from '@proj-airi/ui'
import { useRafFn } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  enabled: boolean
  options: Live2DBreathControlOptions
  startedAtMs: number
}>()

const emit = defineEmits<{
  updateEnabled: [enabled: boolean]
  updateOptions: [options: Live2DBreathControlOptions]
  reset: []
}>()

const { t } = useI18n()
const nowMs = shallowRef(Date.now())

useRafFn(() => {
  nowMs.value = Date.now()
}, { fpsLimit: 15 })

const cycleSeconds = computed({
  get: () => props.options.cycleSeconds,
  set: value => updateOptions({ cycleSeconds: value }),
})

const exhaleDwellSeconds = computed({
  get: () => props.options.exhaleDwellSeconds,
  set: value => updateOptions({ exhaleDwellSeconds: value }),
})

const minimum = computed({
  get: () => props.options.minimum,
  set: value => updateOptions({ minimum: value }),
})

const maximum = computed({
  get: () => props.options.maximum,
  set: value => updateOptions({ maximum: value }),
})

const inhaleRatio = computed({
  get: () => props.options.inhaleRatio,
  set: value => updateOptions({ inhaleRatio: value }),
})

const sample = computed(() => sampleLive2DBreath(
  props.options,
  Math.max(0, nowMs.value - props.startedAtMs) / 1000,
))

function updateOptions(patch: Partial<Live2DBreathControlOptions>) {
  emit('updateOptions', { ...props.options, ...patch })
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`
}

function formatBreathValue(value: number): string {
  return value.toFixed(2)
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <section :class="['rounded-xl bg-primary-50/65 p-4 dark:bg-primary-950/25']">
    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div>
        <h3 :class="['mb-1 font-medium text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.title') }}
        </h3>
        <p :class="['max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.description') }}
        </p>
      </div>

      <div :class="['flex flex-wrap items-center gap-1']">
        <BasicButton @click="emit('updateEnabled', !props.enabled)">
          <span :class="[props.enabled ? 'i-mingcute:wind-fill' : 'i-mingcute:wind-line']" />
          {{ props.enabled
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.breath.actions.disable')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.breath.actions.enable') }}
        </BasicButton>
        <BasicButton @click="emit('reset')">
          <span :class="['i-mingcute:refresh-anticlockwise-1-line']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.actions.reset') }}
        </BasicButton>
      </div>
    </div>

    <div :class="['mt-4 grid gap-4', 'md:grid-cols-2']">
      <FieldRange
        v-model="cycleSeconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.cycle.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.cycle.description')"
        :min="0.5"
        :max="15"
        :step="0.1"
        :default-value="defaultLive2DBreathControlOptions.cycleSeconds"
        :format-value="formatSeconds"
        as="div"
      />
      <FieldRange
        v-model="inhaleRatio"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.inhale.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.inhale.description')"
        :min="0.1"
        :max="0.9"
        :step="0.01"
        :default-value="defaultLive2DBreathControlOptions.inhaleRatio"
        :format-value="formatRatio"
        as="div"
      />
      <FieldRange
        v-model="exhaleDwellSeconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.dwell.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.dwell.description')"
        :min="0"
        :max="8"
        :step="0.1"
        :default-value="defaultLive2DBreathControlOptions.exhaleDwellSeconds"
        :format-value="formatSeconds"
        as="div"
      />
      <FieldRange
        v-model="minimum"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.minimum.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.minimum.description')"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="defaultLive2DBreathControlOptions.minimum"
        :format-value="formatBreathValue"
        as="div"
      />
      <FieldRange
        v-model="maximum"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.maximum.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.breath.maximum.description')"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="defaultLive2DBreathControlOptions.maximum"
        :format-value="formatBreathValue"
        as="div"
      />
    </div>

    <div :class="['mt-4 grid gap-2 text-xs', 'sm:grid-cols-2 xl:grid-cols-4']">
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.diagnostics.stage') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ props.enabled ? t(`tamagotchi.settings.devtools.pages.live2d-motion.breath.stage.${sample.stage}`) : '—' }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.diagnostics.phase') }}
        </div>
        <div :class="['mt-1 font-mono tabular-nums text-neutral-700 dark:text-neutral-200']">
          {{ props.enabled ? formatRatio(sample.phase) : '—' }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.diagnostics.output') }}
        </div>
        <div :class="['mt-1 font-mono tabular-nums text-neutral-700 dark:text-neutral-200']">
          {{ props.enabled ? formatBreathValue(sample.value) : '—' }}
        </div>
      </div>
    </div>
  </section>
</template>
