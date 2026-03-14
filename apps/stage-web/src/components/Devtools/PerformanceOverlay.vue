<script setup lang="ts">
import type { LagMetric } from '../../stores/devtools-lag'

import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useDevtoolsLagStore } from '../../stores/devtools-lag'

const store = useDevtoolsLagStore()
const { enabled, buffers, recording } = storeToRefs(store)

const hovered = ref(false)

const metrics: Array<{ key: LagMetric, label: string, enabled: () => boolean }> = [
  { key: 'fps', label: 'FPS', enabled: () => enabled.value.fps },
  { key: 'frameDuration', label: 'Frame (ms)', enabled: () => enabled.value.frameDuration },
  { key: 'longtask', label: 'Long task (ms)', enabled: () => enabled.value.longtask },
  { key: 'memory', label: 'Memory (MB)', enabled: () => enabled.value.memory },
]

const visibleMetrics = computed(() => metrics.filter(metric => metric.enabled()))
const hasAnyEnabled = computed(() => visibleMetrics.value.length > 0)
const metricsWithStats = computed(() => visibleMetrics.value.map(metric => ({
  ...metric,
  stats: store.getMetricStats(metric.key),
})))

const histogramCache = {
  fps: { version: -1, bars: [] as Array<{ width: string, height: string }> },
  frameDuration: { version: -1, bars: [] as Array<{ width: string, height: string }> },
  longtask: { version: -1, bars: [] as Array<{ width: string, height: string }> },
  memory: { version: -1, bars: [] as Array<{ width: string, height: string }> },
}

function formatValue(metric: string, value: number) {
  if (!Number.isFinite(value))
    return '--'

  if (metric === 'memory')
    return `${(value / 1048576).toFixed(1)}`

  if (metric === 'fps')
    return value.toFixed(0)

  return value.toFixed(1)
}

function barSeries(metric: LagMetric) {
  const version = store.bufferVersion[metric]
  const cache = histogramCache[metric]
  if (cache.version === version)
    return cache.bars

  const values = buffers.value[metric].map(sample => sample.value)
  const histogram = store.buildHistogram(values, 20)
  const max = Math.max(1, ...histogram.map(bin => bin.count))
  const bars = histogram.map(bin => ({
    width: `${100 / (histogram.length || 1)}%`,
    height: `${(bin.count / max) * 100}%`,
  }))

  cache.version = version
  cache.bars = bars
  return bars
}

function toggleRecording() {
  if (recording.value) {
    const snapshot = store.stopRecording()
    if (snapshot)
      store.exportCsv(snapshot)
    return
  }

  store.startRecording()
}
</script>

<template>
  <div
    v-if="hasAnyEnabled"
    :style="{ opacity: hovered ? 1 : 0.3 }"
    class="fixed bottom-3 left-3 z-50"
    p-3
    flex="~ col gap-2"
    rounded="xl"
    bg="neutral-900/80"
    text="white sm"
    shadow="xl"
    transition="opacity 200ms ease"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div flex="~ row items-center gap-2" justify-between>
      <div text="xs neutral-200" uppercase tracking="wide">
        Performance Overlay
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/20"
        @click="toggleRecording"
      >
        <span
          class="inline-block h-2 w-2 rounded-full"
          :class="recording ? 'bg-red-400' : 'bg-neutral-400'"
        />
        <span>{{ recording ? 'Stop' : 'Record' }}</span>
      </button>
    </div>

    <div v-for="metric in metricsWithStats" :key="metric.key" flex="~ col gap-1">
      <div flex="~ row items-center justify-between">
        <span text="xs neutral-100">{{ metric.label }}</span>
        <span text="xs neutral-300">
          <template v-if="metric.stats.count > 0">
            avg {{ formatValue(metric.key, metric.stats.avg) }}
            /
            p95 {{ formatValue(metric.key, metric.stats.p95) }}
          </template>
          <template v-else>
            --
          </template>
        </span>
      </div>
      <div class="h-10 flex items-end gap-0.5 overflow-hidden rounded bg-white/5 px-1 py-1">
        <div
          v-for="(bar, index) in barSeries(metric.key)"
          :key="index"
          :style="{ width: bar.width, height: bar.height }"
          class="bg-white/50"
        />
      </div>
    </div>
  </div>
</template>
