<script setup lang="ts">
import type { IOSubsystem } from '@proj-airi/stage-shared'

import { useIOTracerStore } from '@proj-airi/stage-ui/stores/devtools/io-tracer'
import { storeToRefs } from 'pinia'
import { onUnmounted, ref } from 'vue'

import IOTracerChart from './components/io-tracer-chart.vue'
import IOTracerControls from './components/io-tracer-controls.vue'
import IOTracerDetail from './components/io-tracer-detail.vue'
import IOTracerMetrics from './components/io-tracer-metrics.vue'

const store = useIOTracerStore()
const { turns, isRecording, selectedSpanId, selectedSpan, recordingStartTs, rawSpanCount } = storeToRefs(store)

const chartRef = ref<InstanceType<typeof IOTracerChart>>()
const hiddenSubsystems = ref(new Set<IOSubsystem>())

function toggleRecording() {
  if (isRecording.value)
    store.stopRecording()
  else
    store.startRecording()
}

function toggleSubsystem(subsystem: IOSubsystem) {
  const next = new Set(hiddenSubsystems.value)
  if (next.has(subsystem))
    next.delete(subsystem)
  else
    next.add(subsystem)
  hiddenSubsystems.value = next
}

onUnmounted(() => {
  store.stopRecording()
})
</script>

<template>
  <div :class="['flex flex-col h-full']">
    <IOTracerControls
      :is-recording="isRecording"
      :turn-count="turns.length"
      :span-count="rawSpanCount"
      :hidden-subsystems="hiddenSubsystems"
      @toggle-recording="toggleRecording"
      @clear="store.clear()"
      @auto-fit="chartRef?.autoFit()"
      @toggle-subsystem="toggleSubsystem"
      @export-otlp="store.exportOTLP()"
    />

    <IOTracerMetrics :turns="turns" />

    <div :class="['flex flex-1 overflow-hidden']">
      <IOTracerChart
        ref="chartRef"
        :turns="turns"
        :selected-span-id="selectedSpanId"
        :time-origin="recordingStartTs"
        :hidden-subsystems="hiddenSubsystems"
        @select-span="store.selectSpan($event)"
      />

      <IOTracerDetail
        :span="selectedSpan?.span"
        :turn="selectedSpan?.turn"
        @close="store.selectSpan(null)"
        @select-span="store.selectSpan($event)"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.io-tracer.title
  subtitleKey: tamagotchi.settings.devtools.title
  disableBackButton: true
</route>
