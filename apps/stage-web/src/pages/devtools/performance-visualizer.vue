<script setup lang="ts">
import { ButtonBar, CheckBar } from '@proj-airi/stage-ui/components'
import { useMagicKeys, whenever } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useDevtoolsLagStore } from '../../stores/devtools-lag'

const lagStore = useDevtoolsLagStore()
const { enabled, lastRecording, recording } = storeToRefs(lagStore)

const recordingLabel = computed(() => recording.value ? 'Stop recording (max 60s)' : 'Start recording')
const hasRecording = computed(() => !!lastRecording.value)
const allEnabled = computed(() => enabled.value.fps && enabled.value.frameDuration && enabled.value.longtask && enabled.value.memory)

const magicKeys = useMagicKeys()
whenever(magicKeys['ctrl+alt+l'], () => toggleAll(true))
whenever(magicKeys['ctrl+alt+k'], () => toggleAll(false))

function toggleAll(on: boolean) {
  lagStore.toggleAll(on)
}

function exportCsv() {
  lagStore.exportCsv()
}
</script>

<template>
  <div flex="~ col gap-4" pb-6>
    <div flex="~ col gap-2">
      <div flex="~ row items-center gap-2">
        <CheckBar
          :model-value="allEnabled"
          icon-on="i-solar:sledgehammer-bold-duotone"
          icon-off="i-solar:sledgehammer-bold-duotone"
          text="Enable all metrics"
          description="Toggle all lag metrics (FPS, frame time, long task, memory)"
          @update:model-value="value => toggleAll(Boolean(value))"
        />
        <ButtonBar
          :icon="recording ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:recive-bold-duotone'"
          text="Recording"
          @click="recording ? lagStore.stopRecording() : lagStore.startRecording()"
        >
          {{ recordingLabel }}
        </ButtonBar>
        <ButtonBar
          icon="i-solar:export-bold-duotone"
          text="Export CSV"
          :disabled="!hasRecording"
          @click="exportCsv"
        >
          Export last recording
        </ButtonBar>
      </div>

      <div flex="~ col gap-2">
        <CheckBar
          v-model="enabled.fps"
          icon-on="i-solar:activity-bold-duotone"
          icon-off="i-solar:activity-bold-duotone"
          text="FPS"
          description="Collect FPS histogram"
        />
        <CheckBar
          v-model="enabled.frameDuration"
          icon-on="i-solar:chart-bold-duotone"
          icon-off="i-solar:chart-bold-duotone"
          text="Frame time (ms)"
          description="Collect frame duration histogram"
        />
        <CheckBar
          v-model="enabled.longtask"
          icon-on="i-solar:timer-bold-duotone"
          icon-off="i-solar:timer-bold-duotone"
          text="Long tasks"
          description="PerformanceObserver('longtask')"
        />
        <CheckBar
          v-model="enabled.memory"
          icon-on="i-solar:database-bold-duotone"
          icon-off="i-solar:database-bold-duotone"
          text="Memory"
          description="Sample performance.memory every second"
        />
      </div>
    </div>

    <div v-if="hasRecording" flex="~ col gap-2" rounded="lg" border="1 dashed neutral-700" p-3>
      <div text="sm neutral-200">
        Last recording
      </div>
      <div text="xs neutral-400">
        Started at {{ lastRecording?.startedAt.toFixed(0) }} ms, duration
        {{ (lastRecording!.stoppedAt - lastRecording!.startedAt).toFixed(0) }} ms
      </div>
      <div text="xs neutral-400">
        Samples:
        FPS {{ lastRecording?.samples.fps.length }},
        Frames {{ lastRecording?.samples.frameDuration.length }},
        Long tasks {{ lastRecording?.samples.longtask.length }},
        Memory {{ lastRecording?.samples.memory.length }}
      </div>
    </div>

    <div text="xs neutral-500">
      Overlay is visible when any metric is enabled. Recording caps at 60s.
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.performance-visualizer.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
