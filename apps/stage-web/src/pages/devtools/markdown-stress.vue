<script setup lang="ts">
import { ButtonBar, CheckBar } from '@proj-airi/stage-ui/components'
import { storeToRefs } from 'pinia'

import { useMarkdownStressStore } from '../../stores/markdown-stress'

const stressStore = useMarkdownStressStore()
const { onlineMode, capturing, events, lastRun, mockPreview, scheduleDelayMs } = storeToRefs(stressStore)

function toggleCapture() {
  if (capturing.value)
    stressStore.stopCapture()
  else
    stressStore.startCapture()
}
</script>

<template>
  <div flex="~ col gap-4" pb-6>
    <div text="lg neutral-100">
      Markdown Stress
    </div>
    <div text="sm neutral-400">
      Generate mock chat payloads, schedule them into chat after a {{ scheduleDelayMs }}ms delay, and record markdown parse timings via the perf tracer. Online mode will send the user content to the active provider (when implemented).
    </div>

    <div flex="~ col gap-2">
      <div flex="~ row items-center gap-2">
        <ButtonBar
          icon="i-solar:magic-stick-bold-duotone"
          text="Mock"
          @click="stressStore.generateMockPreview()"
        >
          Generate mock payload
        </ButtonBar>
        <ButtonBar
          :icon="capturing ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:recive-bold-duotone'"
          text="Capture"
          @click="toggleCapture"
        >
          {{ capturing ? 'Stop capture' : 'Start capture' }}
        </ButtonBar>
        <ButtonBar
          icon="i-solar:export-bold-duotone"
          text="Export"
          :disabled="!lastRun?.events.length"
          @click="stressStore.exportCsv()"
        >
          Export last run
        </ButtonBar>
      </div>

      <CheckBar
        v-model="onlineMode"
        icon-on="i-solar:cloud-download-bold-duotone"
        icon-off="i-solar:cloud-broken-bold-duotone"
        text="Online mode"
        description="When enabled, the mock user content will be sent to the active provider (not yet wired)."
      />
    </div>

    <div v-if="mockPreview" flex="~ col gap-1" rounded="lg" border="1 dashed neutral-700" p-3>
      <div text="xs neutral-300">
        Mock preview
      </div>
      <pre class="whitespace-pre-wrap text-xs text-neutral-200">{{ mockPreview }}</pre>
    </div>

    <div flex="~ col gap-2" rounded="lg" border="1 dashed neutral-700" p-3>
      <div text="sm neutral-200">
        Trace events (live)
      </div>
      <div text="xs neutral-400">
        Capturing: {{ capturing ? 'yes' : 'no' }}, events: {{ events.length }}
      </div>
      <ul class="max-h-52 overflow-auto text-xs text-neutral-300 space-y-1">
        <li v-for="(event, idx) in events.slice(-20).reverse()" :key="idx">
          <span class="text-neutral-100 font-mono">{{ event.name }}</span>
          — {{ (event.duration ?? 0).toFixed(2) }} ms
          <span v-if="event.meta" class="text-neutral-500"> {{ JSON.stringify(event.meta) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="lastRun" flex="~ col gap-1" rounded="lg" border="1 dashed neutral-700" p-3>
      <div text="sm neutral-200">
        Last run
      </div>
      <div text="xs neutral-400">
        {{ lastRun.events.length }} events, duration {{ (lastRun.stoppedAt - lastRun.startedAt).toFixed(0) }} ms
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
