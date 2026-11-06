<script setup lang="ts">
import type { TraceMetricDefinition } from '@proj-airi/trace-kit'
import type { MetricSamples, TimelineState } from '@proj-airi/trace-kit/projections'

import { localize } from '@proj-airi/trace-kit'
import { summarizeMetric } from '@proj-airi/trace-kit/projections'
import { formatDuration } from '@proj-airi/ui-timeline/headless'
import { computed } from 'vue'

const props = defineProps<{
  state: TimelineState
  samples: MetricSamples
  version: number
  locale: string
}>()

function format(value: number | undefined, unit: string | undefined): string {
  if (value === undefined)
    return '–'
  if (unit === 'ms')
    return formatDuration(value)
  return `${Number.isInteger(value) ? value : value.toFixed(2)}${unit ? ` ${unit}` : ''}`
}

const metrics = computed(() => {
  void props.version
  const result = []
  for (const [key, data] of props.state.definitions) {
    if (!key.startsWith('metric/'))
      continue
    const definition = data as TraceMetricDefinition
    const samples = props.samples[definition.key] ?? []
    const summary = summarizeMetric(definition.key, samples, definition)
    result.push({
      key: definition.key,
      label: localize(definition.label, props.locale) ?? definition.key,
      description: localize(definition.description, props.locale),
      better: definition.better,
      unit: definition.unit,
      summary,
    })
  }
  return result.filter(metric => metric.summary.count > 0 || metric.summary.excluded.failed > 0)
})
</script>

<template>
  <div
    v-if="metrics.length > 0"
    :class="['flex flex-wrap content-start gap-2 p-2', 'text-xs']"
  >
    <div
      v-for="metric in metrics"
      :key="metric.key"
      :class="['flex flex-col px-2.5 py-1.5 rounded-lg', 'bg-neutral-100 dark:bg-neutral-800']"
      :title="metric.description"
    >
      <div :class="['flex items-center gap-1 text-neutral-500']">
        {{ metric.label }}
        <span v-if="metric.better" :class="['text-2.5']" :aria-label="metric.better === 'lower' ? 'Lower is better' : 'Higher is better'">
          {{ metric.better === 'lower' ? '↓' : '↑' }}
        </span>
      </div>
      <div :class="['flex items-baseline gap-2 tabular-nums']">
        <span :class="['text-sm font-semibold']">{{ format(metric.summary.values.p50, metric.unit) }}</span>
        <span :class="['text-neutral-500']">p95 {{ format(metric.summary.values.p95, metric.unit) }}</span>
        <span :class="['text-neutral-400']">n={{ metric.summary.count }}</span>
      </div>
      <div
        v-if="metric.summary.excluded.censored + metric.summary.excluded.warmup + metric.summary.excluded.failed > 0"
        :class="['text-2.5 text-neutral-400']"
      >
        left out: {{ metric.summary.excluded.censored }} censored, {{ metric.summary.excluded.warmup }} warm-up, {{ metric.summary.excluded.failed }} failed
      </div>
    </div>
  </div>
</template>
