<script setup lang="ts">
import { ButtonBar, Section } from '@proj-airi/stage-ui/components'
import { useMarkdownStressStore } from '@proj-airi/stage-ui/stores/markdown-stress'
import { Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const stressStore = useMarkdownStressStore()
const { t } = useI18n()
const { capturing, events, isMock, lastRun, payloadPreview, scheduleDelayMs, runState } = storeToRefs(stressStore)

const previewText = computed(() => payloadPreview.value ?? '')
const lastRunSummary = computed(() => {
  if (!lastRun.value)
    return undefined

  return {
    events: lastRun.value.events.length,
    durationMs: (lastRun.value.stoppedAt - lastRun.value.startedAt).toFixed(0),
  }
})
const runSummary = computed(() => {
  return `Run: ${runState.value}, capturing: ${capturing.value ? 'yes' : 'no'}, events: ${events.value.length}`
})

function toggleCapture() {
  if (capturing.value)
    stressStore.stopCapture()
  else
    stressStore.startCapture()
}

function toggleMode() {
  stressStore.toggleMockMode()
}
</script>

<template>
  <div class="grid gap-4 p-4 lg:grid-cols-[1.5fr_1fr]">
    <Section
      :title="t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.title')"
      :description="t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.description')"
      icon="i-solar:code-circle-bold-duotone"
      inner-class="gap-4"
    >
      <div class="flex flex-wrap gap-2">
        <ButtonBar
          class="w-full sm:w-auto"
          icon="i-solar:magic-stick-bold-duotone"
          text="Preview"
          @click="stressStore.generatePreview()"
        >
          Generate payload preview
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          icon="i-solar:play-circle-bold-duotone"
          :text="runState === 'running' ? 'Abort run' : runState === 'scheduled' ? 'Unschedule' : 'Replay'"
          :disabled="!isMock && !stressStore.canRunOnline"
          @click="stressStore.scheduleRun()"
        >
          {{ runState === 'running' ? 'Abort now' : runState === 'scheduled' ? 'Cancel replay' : 'Replay to provider' }}
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          :icon="capturing ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:recive-bold-duotone'"
          text="Capture"
          @click="toggleCapture"
        >
          {{ capturing ? 'Stop capture' : 'Start capture' }}
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          icon="i-solar:export-bold-duotone"
          text="Export"
          :disabled="!lastRun?.events.length"
          @click="stressStore.exportCsv()"
        >
          Export last run
        </ButtonBar>
        <ButtonBar
          class="w-full sm:w-auto"
          :icon="isMock ? 'i-solar:simplerockets-bold-duotone' : 'i-solar:cloud-bold-duotone'"
          :text="isMock ? 'Mode: Mock' : 'Mode: Live'"
          @click="toggleMode"
        >
          {{ isMock ? 'Switch to live provider' : 'Switch to mock stream' }}
        </ButtonBar>
      </div>

      <div class="grid gap-3 md:grid-cols-[auto_1fr] md:items-center">
        <label class="text-xs text-neutral-400">Schedule delay (ms)</label>
        <input
          v-model.number="scheduleDelayMs"
          type="number"
          min="0"
          class="max-w-[180px] w-full border border-neutral-700 rounded bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
        >
      </div>

      <Callout label="Run state" theme="violet">
        <div class="text-xs text-neutral-200">
          {{ runSummary }}
        </div>
        <div class="text-xs text-neutral-500">
          Capture to record recent events; export last run for offline review.
        </div>
      </Callout>

      <Callout v-if="lastRunSummary" label="Last run" theme="orange">
        <div class="text-xs text-neutral-200">
          {{ lastRunSummary.events }} events, duration {{ lastRunSummary.durationMs }} ms
        </div>
        <div class="text-xs text-neutral-500">
          Export the last run to CSV to share with the team.
        </div>
      </Callout>
    </Section>

    <div class="border border-neutral-800/70 rounded-xl bg-neutral-900/60 p-4 shadow-sm lg:col-span-1 space-y-3">
      <div class="text-sm text-neutral-200">
        Live traces
      </div>
      <div class="text-xs text-neutral-400">
        Capturing: {{ capturing ? 'yes' : 'no' }}, events: {{ events.length }}
      </div>
      <ul class="max-h-64 overflow-auto text-xs text-neutral-300 space-y-1">
        <li v-for="(event, idx) in events.slice(-20).reverse()" :key="idx">
          <span class="text-neutral-100 font-mono">{{ event.name }}</span>
          — {{ (event.duration ?? 0).toFixed(2) }} ms
          <span v-if="event.meta" class="text-neutral-500"> {{ JSON.stringify(event.meta) }}</span>
        </li>
      </ul>
    </div>

    <Section
      title="Payload preview"
      icon="i-solar:code-file-bold-duotone"
      inner-class="gap-3"
      class="lg:col-span-2"
    >
      <div class="text-xs text-neutral-300">
        Latest payload
      </div>

      <div v-if="previewText" class="border border-neutral-700 rounded-lg border-dashed bg-neutral-900/60 p-3 space-y-2">
        <pre class="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-neutral-200">{{ previewText }}</pre>
      </div>
      <div v-else class="text-xs text-neutral-500">
        Generate a payload to see the preview.
      </div>
    </Section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.markdown-stress.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
