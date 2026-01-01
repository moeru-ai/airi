<script setup lang="ts">
import { ButtonBar } from '@proj-airi/stage-ui/components'
import { useMarkdownStressStore } from '@proj-airi/stage-ui/stores/markdown-stress'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const stressStore = useMarkdownStressStore()
const { t } = useI18n()
const { capturing, events, lastRun, payloadPreview, scheduleDelayMs, runState } = storeToRefs(stressStore)

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
      {{ t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.title') }}
    </div>
    <div text="sm neutral-400">
      {{ t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.description') }}
    </div>

    <div flex="~ col gap-2">
      <div flex="~ row items-center gap-2">
        <ButtonBar
          icon="i-solar:magic-stick-bold-duotone"
          text="Preview"
          @click="stressStore.generatePreview()"
        >
          Generate payload preview
        </ButtonBar>
        <ButtonBar
          icon="i-solar:play-circle-bold-duotone"
          :text="runState === 'running' ? 'Abort run' : runState === 'scheduled' ? 'Unschedule' : 'Schedule live replay'"
          :disabled="!stressStore.canRunOnline"
          @click="stressStore.scheduleRun()"
        >
          {{ runState === 'running' ? 'Abort now' : runState === 'scheduled' ? 'Cancel scheduled replay' : 'Schedule replay (sends to active provider)' }}
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

      <div flex="~ row items-center gap-2">
        <label text="xs neutral-400">Schedule delay (ms)</label>
        <input
          v-model.number="scheduleDelayMs"
          type="number"
          min="0"
          class="w-28 border border-neutral-700 rounded bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
        >
        <span text="xs neutral-400">
          Run state: {{ runState }}, capturing: {{ capturing ? 'yes' : 'no' }}, events: {{ events.length }}
        </span>
      </div>
    </div>

    <div v-if="payloadPreview" flex="~ col gap-1" rounded="lg" border="1 dashed neutral-700" p-3>
      <div text="xs neutral-300">
        Payload preview
      </div>
      <pre class="whitespace-pre-wrap text-xs text-neutral-200">{{ payloadPreview }}</pre>
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
