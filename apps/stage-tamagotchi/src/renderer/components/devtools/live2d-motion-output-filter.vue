<script setup lang="ts">
import type {
  Live2DMotionOutputFilterFrame,
  Live2DMotionOutputFilterOptions,
} from '../../composables/live2d-motion-output-filter'

import { BasicButton, FieldRange } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { defaultLive2DMotionOutputFilterOptions } from '../../composables/live2d-motion-output-filter'

const props = defineProps<{
  options: Live2DMotionOutputFilterOptions
  frame?: Live2DMotionOutputFilterFrame
  generatorActive: boolean
}>()

const emit = defineEmits<{
  updateOptions: [options: Live2DMotionOutputFilterOptions]
  reset: []
}>()

const { t } = useI18n()

const smoothing = computed({
  get: () => props.options.smoothing,
  set: value => updateOptions({ smoothing: value }),
})

const cutoff = computed({
  get: () => props.options.cutoff,
  set: value => updateOptions({ cutoff: value }),
})

const status = computed(() => {
  if (!props.options.enabled)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.status.bypassed')
  if (props.generatorActive)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.status.filtering')
  return t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.status.waiting')
})

function updateOptions(patch: Partial<Live2DMotionOutputFilterOptions>) {
  emit('updateOptions', { ...props.options, ...patch })
}

function formatSmoothing(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatCutoff(value: number): string {
  return value.toFixed(3)
}

function formatChange(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(4)
}
</script>

<template>
  <section :class="['rounded-xl bg-primary-50/65 p-4 dark:bg-primary-950/25']">
    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div>
        <h3 :class="['mb-1 font-medium text-neutral-900 dark:text-neutral-100']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.title') }}
        </h3>
        <p :class="['max-w-3xl text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.description') }}
        </p>
      </div>

      <div :class="['flex flex-wrap items-center gap-1']">
        <BasicButton @click="updateOptions({ enabled: !props.options.enabled })">
          <span :class="[props.options.enabled ? 'i-mingcute:filter-fill' : 'i-mingcute:filter-line']" />
          {{ props.options.enabled
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.actions.disable')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.actions.enable') }}
        </BasicButton>
        <BasicButton :disabled="!props.generatorActive" @click="emit('reset')">
          <span :class="['i-mingcute:refresh-anticlockwise-1-line']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.actions.reset') }}
        </BasicButton>
      </div>
    </div>

    <div :class="['output-filter-fields mt-4 grid gap-4']">
      <FieldRange
        v-model="smoothing"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.smoothing.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.smoothing.description')"
        :min="0"
        :max="0.99"
        :step="0.01"
        :default-value="defaultLive2DMotionOutputFilterOptions.smoothing"
        :format-value="formatSmoothing"
        as="div"
      />
      <FieldRange
        v-model="cutoff"
        :label="t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.cutoff.label')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.cutoff.description')"
        :min="0"
        :max="0.2"
        :step="0.0025"
        :default-value="defaultLive2DMotionOutputFilterOptions.cutoff"
        :format-value="formatCutoff"
        as="div"
      />
    </div>

    <div :class="['output-filter-diagnostics mt-4 grid gap-2 text-xs']">
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.diagnostics.status') }}
        </div>
        <div :class="['mt-1 font-mono text-neutral-700 dark:text-neutral-200']">
          {{ status }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.diagnostics.input-change') }}
        </div>
        <div :class="['mt-1 font-mono tabular-nums text-neutral-700 dark:text-neutral-200']">
          {{ formatChange(props.frame?.inputChangeMeanAbsolute) }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.diagnostics.output-change') }}
        </div>
        <div :class="['mt-1 font-mono tabular-nums text-neutral-700 dark:text-neutral-200']">
          {{ formatChange(props.frame?.outputChangeMeanAbsolute) }}
        </div>
      </div>
      <div :class="['rounded-lg bg-white/70 px-3 py-2 dark:bg-neutral-950/40']">
        <div :class="['text-neutral-400 dark:text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.output-filter.diagnostics.cutoff-tracks') }}
        </div>
        <div :class="['mt-1 font-mono tabular-nums text-neutral-700 dark:text-neutral-200']">
          {{ props.frame?.cutoffTrackCount ?? '—' }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.output-filter-fields {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}

.output-filter-diagnostics {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
}
</style>
