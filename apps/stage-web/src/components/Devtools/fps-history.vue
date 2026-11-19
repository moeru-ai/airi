<script setup lang="ts">
import type { useDevtoolsLagStore } from '../../stores/devtools-lag'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  samples: Readonly<ReturnType<typeof useDevtoolsLagStore>['buffers']['fps']>
  /** Bounds use the same performance.now() clock as the samples. */
  startedAt: number
  stoppedAt: number
}>()

const { n, t } = useI18n()
const history = computed(() => {
  const samples = props.samples.filter(sample => sample.ts >= props.startedAt
    && sample.ts <= props.stoppedAt && Number.isFinite(sample.value) && sample.value >= 0)
  const values = samples.map(sample => sample.value)
  const maximum = values.length ? Math.max(...values) : 0
  // Keep a zero baseline and 60 FPS steps so a small fluctuation does not fill the chart.
  const ceiling = Math.max(60, Math.ceil(maximum / 60) * 60)
  const duration = Math.max(1, props.stoppedAt - props.startedAt)
  return {
    ceiling,
    latest: samples.at(-1)?.value,
    minimum: values.length ? Math.min(...values) : undefined,
    maximum: values.length ? maximum : undefined,
    // Timestamp spacing preserves the duration of stalls instead of spacing frames equally.
    points: samples.map(sample => `${((sample.ts - props.startedAt) / duration) * 300},${60 - (sample.value / ceiling) * 60}`).join(' '),
  }
})
</script>

<template>
  <div :class="['flex flex-col gap-1']" data-testid="fps-history">
    <div :class="['flex flex-wrap justify-between gap-x-2 text-xs tabular-nums']">
      <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.title') }}</span>
      <span v-if="history.latest !== undefined">
        {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.latest') }} {{ n(history.latest, { maximumFractionDigits: 1 }) }}
      </span>
    </div>
    <div :class="['flex gap-2']">
      <div :class="['flex flex-col justify-between text-[10px] tabular-nums opacity-70']">
        <span>{{ n(history.ceiling) }}</span>
        <span>{{ n(history.ceiling / 2) }}</span>
        <span>0</span>
      </div>
      <svg
        viewBox="0 0 300 60"
        preserveAspectRatio="none"
        role="img"
        :aria-label="t('tamagotchi.settings.devtools.pages.performance-visualizer.history.title')"
        :class="['h-16 min-w-0 flex-1 overflow-visible rounded bg-neutral-500/10']"
      >
        <path d="M0 0H300 M0 30H300 M0 60H300" fill="none" stroke="currentColor" stroke-opacity="0.15" vector-effect="non-scaling-stroke" />
        <polyline :points="history.points" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
    <div :class="['flex justify-between text-[10px] tabular-nums opacity-70']">
      <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.seconds-ago', { seconds: n((stoppedAt - startedAt) / 1000, { maximumFractionDigits: 1 }) }) }}</span>
      <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.end') }}</span>
    </div>
    <div v-if="history.minimum !== undefined && history.maximum !== undefined" :class="['text-xs tabular-nums opacity-70']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.minimum') }} {{ n(history.minimum, { maximumFractionDigits: 1 }) }}
      / {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.maximum') }} {{ n(history.maximum, { maximumFractionDigits: 1 }) }}
    </div>
    <div v-else :class="['text-xs opacity-70']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.history.empty') }}
    </div>
  </div>
</template>
