<script setup lang="ts">
import type { Live2DAmbientLightSample } from '@proj-airi/stage-ui-live2d'

import type { ScreenAmbientLightDiagnosticsSnapshot } from '../../../../shared/screen-ambient-light-diagnostics'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sampling?: ScreenAmbientLightDiagnosticsSnapshot['sampling']
}>()

const { t } = useI18n()
const colors = computed(() => [
  {
    id: 'unweighted',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.unweighted.title'),
    description: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.unweighted.description'),
    sample: props.sampling?.unweightedSample,
  },
  {
    id: 'target',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.target.title'),
    description: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.target.description'),
    sample: props.sampling?.targetSample,
  },
  {
    id: 'applied',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.applied.title'),
    description: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.applied.description'),
    sample: props.sampling?.appliedSample,
  },
])

function colorStyle(sample?: Live2DAmbientLightSample) {
  return sample ? { backgroundColor: colorHex(sample) } : undefined
}

function colorHex(sample: Live2DAmbientLightSample) {
  const channels = [sample.red, sample.green, sample.blue]
    .map(channel => Math.round(channel * 255).toString(16).padStart(2, '0'))
  return `#${channels.join('')}`
}

function colorRgb(sample: Live2DAmbientLightSample) {
  return [sample.red, sample.green, sample.blue]
    .map(channel => Math.round(channel * 255))
    .join(', ')
}
</script>

<template>
  <div :class="['grid gap-2']">
    <div :class="['text-sm font-medium']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.title') }}
    </div>
    <div :class="['grid gap-2', 'md:grid-cols-3']">
      <div
        v-for="color in colors"
        :key="color.id"
        :class="['grid gap-3 rounded-xl bg-neutral-100/70 p-3 dark:bg-neutral-800/70']"
      >
        <div :class="['flex items-start gap-3']">
          <div
            :class="['size-10 shrink-0 rounded-lg border border-neutral-300 bg-transparent dark:border-neutral-700']"
            :style="colorStyle(color.sample)"
          />
          <div :class="['min-w-0']">
            <div :class="['text-sm font-medium']">
              {{ color.label }}
            </div>
            <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ color.description }}
            </div>
          </div>
        </div>
        <div v-if="color.sample" :class="['grid gap-1 font-mono text-xs tabular-nums']">
          <div>{{ colorHex(color.sample) }}</div>
          <div>RGB {{ colorRgb(color.sample) }}</div>
          <div>L {{ color.sample.luminance.toFixed(3) }}</div>
        </div>
        <div v-else :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.colors.unavailable') }}
        </div>
      </div>
    </div>
  </div>
</template>
