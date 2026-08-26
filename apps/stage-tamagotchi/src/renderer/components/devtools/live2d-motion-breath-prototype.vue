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
  <section :class="['rounded-xl border border-primary-200/80 p-4 dark:border-primary-900/70', 'bg-primary-50/40 dark:bg-primary-950/15']">
    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div>
        <div :class="['mb-1 flex items-center gap-2']">
          <span :class="['rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700', 'dark:bg-primary-900/50 dark:text-primary-200']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.prototype') }}
          </span>
          <h3 :class="['font-medium text-neutral-900 dark:text-neutral-100']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.title') }}
          </h3>
        </div>
        <p :class="['max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.question') }}
        </p>
      </div>

      <div :class="['flex flex-wrap items-center gap-1']">
        <BasicButton @click="emit('updateEnabled', !props.enabled)">
          <span :class="[props.enabled ? 'i-solar:wind-bold-duotone' : 'i-solar:wind-linear']" />
          {{ props.enabled
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.breath.actions.disable')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.breath.actions.enable') }}
        </BasicButton>
        <BasicButton @click="emit('reset')">
          <span :class="['i-solar:restart-bold']" />
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
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.breath.diagnostics.status') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ props.enabled
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.breath.status.active')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.breath.status.disabled') }}
        </div>
      </div>
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
