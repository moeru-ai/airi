<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useDevtoolsLagStore } from '../../stores/devtools-lag'

const store = useDevtoolsLagStore()
const { enabled, buffers } = storeToRefs(store)

const hovered = ref(false)

const metrics = [
  { key: 'fps', label: 'FPS', enabled: () => enabled.value.frames },
  { key: 'frameDuration', label: 'Frame (ms)', enabled: () => enabled.value.frames },
  { key: 'longtask', label: 'Long task (ms)', enabled: () => enabled.value.longtask },
  { key: 'gc', label: 'GC (ms)', enabled: () => enabled.value.gc },
  { key: 'memory', label: 'Memory (MB)', enabled: () => enabled.value.memory },
]

const visibleMetrics = computed(() => metrics.filter(metric => metric.enabled()))
const hasAnyEnabled = computed(() => visibleMetrics.value.length > 0)

function formatValue(metric: string, value: number) {
  if (!Number.isFinite(value))
    return '--'

  if (metric === 'memory')
    return `${(value / 1048576).toFixed(1)}`

  if (metric === 'fps')
    return value.toFixed(0)

  return value.toFixed(1)
}

function barSeries(metric: 'fps' | 'frameDuration' | 'longtask' | 'gc' | 'memory') {
  const values = buffers.value[metric].map(sample => sample.value)
  const histogram = store.buildHistogram(values, 20)
  const max = Math.max(1, ...histogram.map(bin => bin.count))
  return histogram.map(bin => ({
    width: `${100 / (histogram.length || 1)}%`,
    height: `${(bin.count / max) * 100}%`,
  }))
}

function metricStats(metric: 'fps' | 'frameDuration' | 'longtask' | 'gc' | 'memory') {
  const values = buffers.value[metric].map(sample => sample.value)
  return store.calcStats(values)
}

function toggleRecording() {
  if (store.recording)
    store.stopRecording()
  else
    store.startRecording()
}
</script>

<template>
  <div
    v-if="hasAnyEnabled"
    :style="{ opacity: hovered ? 1 : 0.3 }"
    class="fixed right-3 top-3 z-50"
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
        Lag Overlay
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs bg-white/10 hover:bg-white/20 transition-colors"
        @click="toggleRecording"
      >
        <span
          class="inline-block h-2 w-2 rounded-full"
          :class="store.recording ? 'bg-red-400' : 'bg-neutral-400'"
        />
        <span>{{ store.recording ? 'Stop' : 'Record' }}</span>
      </button>
    </div>

    <div v-for="metric in visibleMetrics" :key="metric.key" flex="~ col gap-1">
      <div flex="~ row items-center justify-between">
        <span text="xs neutral-100">{{ metric.label }}</span>
        <span text="xs neutral-300">
          <template v-if="metricStats(metric.key as any).latest">
            avg {{ formatValue(metric.key, metricStats(metric.key as any).avg) }}
            /
            p95 {{ formatValue(metric.key, metricStats(metric.key as any).p95) }}
          </template>
          <template v-else>
            --
          </template>
        </span>
      </div>
      <div class="h-10 rounded bg-white/5 px-1 py-1 flex items-end gap-0.5 overflow-hidden">
        <div
          v-for="(bar, index) in barSeries(metric.key as any)"
          :key="index"
          :style="{ width: bar.width, height: bar.height }"
          class="bg-white/50"
        />
      </div>
    </div>
  </div>
</template>
