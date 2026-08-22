<script setup lang="ts">
import type { LagMetric } from '../../stores/devtools-lag'

import { Button, FieldCheckbox } from '@proj-airi/ui'
import { useMagicKeys, whenever } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDevtoolsLagStore } from '../../stores/devtools-lag'

const { n, t } = useI18n()
const lagStore = useDevtoolsLagStore()
const { enabled, lastRecording, recording, recordingElapsedMs, supported } = storeToRefs(lagStore)

const metricDefinitions: Array<{
  key: LagMetric
  labelKey: string
  descriptionKey: string
  unsupportedKey?: string
}> = [
  {
    key: 'fps',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.fps.label',
    descriptionKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.fps.description',
  },
  {
    key: 'frameDuration',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.frame-duration.label',
    descriptionKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.frame-duration.description',
  },
  {
    key: 'longtask',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.long-task.label',
    descriptionKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.long-task.description',
    unsupportedKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.long-task.unsupported',
  },
  {
    key: 'memory',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.memory.label',
    descriptionKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.memory.description',
    unsupportedKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.memory.unsupported',
  },
]

const metricControls = computed(() => metricDefinitions.map(metric => ({
  ...metric,
  supported: supported.value[metric.key],
})))
const recordingElapsedSeconds = computed(() => Math.min(60, Math.floor(recordingElapsedMs.value / 1000)))
const recordingLabel = computed(() => recording.value
  ? t('tamagotchi.settings.devtools.pages.performance-visualizer.controls.stop-recording', { seconds: recordingElapsedSeconds.value })
  : t('tamagotchi.settings.devtools.pages.performance-visualizer.controls.start-recording'))
const hasRecording = computed(() => !!lastRecording.value)
const allEnabled = computed({
  get() {
    const supportedMetrics = metricDefinitions.filter(metric => supported.value[metric.key])
    return supportedMetrics.length > 0
      && supportedMetrics.every(metric => enabled.value[metric.key])
  },
  set(value: boolean) {
    lagStore.toggleAll(value)
  },
})

const magicKeys = useMagicKeys()
whenever(magicKeys['ctrl+alt+l'], () => lagStore.toggleAll(true))
whenever(magicKeys['ctrl+alt+k'], () => lagStore.toggleAll(false))

function exportCsv() {
  lagStore.exportCsv()
}

function metricDescription(metric: typeof metricControls.value[number]) {
  if (metric.supported || !metric.unsupportedKey)
    return t(metric.descriptionKey)

  return t(metric.unsupportedKey)
}
</script>

<template>
  <div :class="['flex flex-col gap-4', 'pb-6']">
    <section
      :class="[
        'rounded-2xl p-4',
        'bg-neutral-50/80 dark:bg-neutral-900/50',
      ]"
    >
      <FieldCheckbox
        v-model="allEnabled"
        :label="t('tamagotchi.settings.devtools.pages.performance-visualizer.controls.enable-all.label')"
        :description="t('tamagotchi.settings.devtools.pages.performance-visualizer.controls.enable-all.description')"
      />
    </section>

    <div :class="['flex flex-wrap items-center gap-2']">
      <Button
        :icon="recording ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:record-circle-bold-duotone'"
        :label="recordingLabel"
        :color="recording ? 'red' : 'primary'"
        variant="secondary"
        @click="lagStore.toggleRecording"
      />
      <Button
        icon="i-solar:export-bold-duotone"
        :label="t('tamagotchi.settings.devtools.pages.performance-visualizer.controls.export-last-recording')"
        :disabled="!hasRecording"
        @click="exportCsv"
      />
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.recording.limit') }}
      </span>
    </div>

    <div :class="['grid gap-3', 'md:grid-cols-2']">
      <section
        v-for="metric in metricControls"
        :key="metric.key"
        :class="[
          'min-w-0 rounded-2xl p-4',
          'bg-neutral-50/80 dark:bg-neutral-900/50',
        ]"
      >
        <FieldCheckbox
          v-model="enabled[metric.key]"
          :label="t(metric.labelKey)"
          :description="metricDescription(metric)"
          :disabled="!metric.supported"
        />
      </section>
    </div>

    <section
      v-if="lastRecording"
      :class="[
        'flex flex-col gap-2 rounded-2xl p-4',
        'border border-dashed border-neutral-300 dark:border-neutral-700',
      ]"
    >
      <div :class="['text-sm font-medium text-neutral-800 dark:text-neutral-200']">
        {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.recording.title') }}
      </div>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.recording.duration', {
          duration: n(lastRecording.stoppedAt - lastRecording.startedAt, { maximumFractionDigits: 0 }),
        }) }}
      </div>
      <div :class="['grid gap-1 text-xs text-neutral-500 dark:text-neutral-400', 'sm:grid-cols-2 lg:grid-cols-4']">
        <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.metrics.fps.label') }}: {{ n(lastRecording.samples.fps.length) }}</span>
        <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.metrics.frame-duration.label') }}: {{ n(lastRecording.samples.frameDuration.length) }}</span>
        <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.metrics.long-task.label') }}: {{ n(lastRecording.samples.longtask.length) }}</span>
        <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.metrics.memory.label') }}: {{ n(lastRecording.samples.memory.length) }}</span>
      </div>
    </section>

    <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.description') }}
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.performance-visualizer.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
