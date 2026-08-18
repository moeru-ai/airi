<script setup lang="ts">
import { computed } from 'vue'

import LevelMeter from './level-meter.vue'
import TimeSeriesChart from './time-series-chart.vue'

interface Props {
  title?: string
  processingHistory: Readonly<number[]>
  processingValue?: number | null
  processingUnit?: string
  processingLabel?: string
  processingMax?: number
  rateValue?: number
  rateMax?: number
  rateLabel?: string
  rateUnit?: string
  secondaryRateValue?: number
  secondaryRateMax?: number
  secondaryRateLabel?: string
  secondaryRateUnit?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Processing',
  processingValue: null,
  processingUnit: 'ms',
  processingLabel: 'Inference latency',
  processingMax: 0,
  rateValue: 0,
  rateMax: 60,
  rateLabel: 'Context updates',
  rateUnit: '/min',
  secondaryRateValue: undefined,
  secondaryRateMax: 60,
  secondaryRateLabel: 'Capture rate',
  secondaryRateUnit: '/min',
})

const resolvedProcessingMax = computed(() => {
  const historyMax = props.processingHistory.length > 0
    ? Math.max(...props.processingHistory)
    : 0
  return Math.max(1, props.processingMax || 0, historyMax)
})

const processingValueResolved = computed(() => {
  if (props.processingValue !== null && props.processingValue !== undefined)
    return props.processingValue
  return props.processingHistory.at(-1) ?? 0
})

const normalizedProcessingHistory = computed(() => {
  const maxValue = resolvedProcessingMax.value
  return props.processingHistory.map(value => Math.min(1, value / maxValue))
})

const normalizedProcessingValue = computed(() => {
  return Math.min(1, processingValueResolved.value / resolvedProcessingMax.value)
})

const formattedProcessingValue = computed(() => {
  return `${processingValueResolved.value.toFixed(0)}${props.processingUnit}`
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4', 'rounded-2xl', 'bg-white/70', 'p-4', 'shadow-sm', 'dark:bg-neutral-900/50']">
    <div :class="['flex', 'items-center', 'justify-between']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <div :class="['text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
          {{ title }}
        </div>
        <div :class="['text-base', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
          {{ processingLabel }}
        </div>
      </div>
      <div :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ formattedProcessingValue }}
      </div>
    </div>

    <TimeSeriesChart
      :is-active="false"
      :history="normalizedProcessingHistory"
      :current-value="normalizedProcessingValue"
      :show-legend="false"
      :show-header="false"
      :show-area="true"
      :show-active-indicator="false"
      :show-current-value="false"
      :height="72"
      :precision="0"
      :unit="processingUnit"
    />

    <div :class="['grid', 'gap-4', 'md:grid-cols-2']">
      <LevelMeter
        :level="rateValue"
        :min="0"
        :max="rateMax"
        :label="rateLabel"
        :unit="rateUnit"
      />

      <LevelMeter
        v-if="secondaryRateValue !== undefined"
        :level="secondaryRateValue"
        :min="0"
        :max="secondaryRateMax"
        :label="secondaryRateLabel"
        :unit="secondaryRateUnit"
      />
    </div>
  </div>
</template>
