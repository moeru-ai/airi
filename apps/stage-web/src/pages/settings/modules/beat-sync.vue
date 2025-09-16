<script setup lang="ts">
import type { AnalyserBeatEvent } from '@nekopaw/tempora'

import { Button } from '@proj-airi/stage-ui/components'
import { useBeatSyncStore } from '@proj-airi/stage-ui/stores/beat-sync'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { createTimeline } from 'animejs'
import { nanoid } from 'nanoid'
import { onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

const beatSyncStore = useBeatSyncStore()
const { t } = useI18n()

const selectedAudioSource = ref<string>('none')

const beatsHistory = ref<Array<{
  id: string
  level: number
  linearLevel: number
}>>([])

const minBeatInterval = ref(0.2)
const peakThreshold = ref(1.5)
const lowpassFilterFrequency = ref(240)
const warmup = ref(true)
const shortTermBufferDuration = ref(0.04)
const longTermBufferDuration = ref(4)

watchEffect(() => {
  beatSyncStore.updateParameters({
    minBeatInterval: minBeatInterval.value,
    peakThreshold: peakThreshold.value,
    lowpassFilterFrequency: lowpassFilterFrequency.value,
    warmup: warmup.value,
    shortTermBufferDuration: shortTermBufferDuration.value,
    longTermBufferDuration: longTermBufferDuration.value,
  })
})

function linearLevel(level: number) {
  const base = 2
  const a = 0.5
  return ((base ** level - 1) / (base - 1)) ** a
}

watch(selectedAudioSource, async (source) => {
  switch (source) {
    case 'none':
      break
    case 'screen-capture': {
      await beatSyncStore.startFromScreenCapture()
      break
    }
  }
})

onMounted(() => {
  const onBeat = (event: AnalyserBeatEvent) => {
    const { level } = event
    beatsHistory.value.unshift({
      id: nanoid(),
      level,
      linearLevel: linearLevel(level),
    })
  }

  beatSyncStore.on('beat', onBeat)

  onUnmounted(() => {
    beatSyncStore.off('beat', onBeat)
  })
})

function resetDefaultParameters() {
  minBeatInterval.value = 0.2
  peakThreshold.value = 1.5
  lowpassFilterFrequency.value = 240
  warmup.value = true
  shortTermBufferDuration.value = 0.04
  longTermBufferDuration.value = 4
}
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[40%]">
      <div flex="~ col gap-6">
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.modules.beat_sync.sections.audio_source.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>{{ t('settings.pages.modules.beat_sync.sections.audio_source.description') }}</span>
            </div>
          </div>

          <div max-w-full flex="~ row gap-4 wrap">
            <template v-if="beatSyncStore.isActive">
              <Button @click="beatSyncStore.stop">
                {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.stop') }}
              </Button>
            </template>

            <template v-else>
              <Button @click="beatSyncStore.startFromScreenCapture">
                {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.start_screen_capture') }}
              </Button>
            </template>
          </div>
        </div>

        <div flex="~ col gap-4">
          <div flex="~ row" items-center justify-between>
            <div>
              <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
                {{ t('settings.pages.modules.beat_sync.sections.parameters.title') }}
              </h2>
              <div text="neutral-400 dark:neutral-400">
                <span>{{ t('settings.pages.modules.beat_sync.sections.parameters.description') }}</span>
              </div>
            </div>

            <button
              title="Reset settings"
              flex items-center justify-center rounded-full p-2
              transition="all duration-250 ease-in-out"
              text="neutral-500 dark:neutral-400"
              bg="transparent dark:transparent hover:neutral-200 dark:hover:neutral-800 active:neutral-300 dark:active:neutral-700"
              @click="resetDefaultParameters"
            >
              <div i-solar:refresh-bold-duotone text-xl />
            </button>
          </div>

          <div max-w-full flex="~ col gap-4">
            <FieldRange
              v-model="minBeatInterval"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.min_beat_interval.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.min_beat_interval.description')"
              :min="0.05"
              :max="1"
              :step="0.01"
              :format-value="value => `${(60 / value).toFixed(1)} BPM / ${value.toFixed(2)} s`"
            />

            <FieldRange
              v-model="peakThreshold"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.peak_threshold.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.peak_threshold.description')"
              :min="0.1"
              :max="3"
              :step="0.1"
              :format-value="value => value.toFixed(1)"
            />

            <FieldRange
              v-model="lowpassFilterFrequency"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.lowpass_filter_frequency.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.lowpass_filter_frequency.description')"
              :min="20"
              :max="24000 /* Nyquist frequency under 48 kHz sample rate */"
              :step="10"
              :format-value="value => `${value.toFixed(0)} Hz`"
            />

            <FieldCheckbox
              v-model="warmup"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.warmup.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.warmup.description')"
            />

            <div>
              <h3 class="text text-neutral-500 md:text-xl dark:text-neutral-500">
                {{ t('settings.pages.modules.beat_sync.sections.parameters.advanced_parameters') }}
              </h3>
            </div>

            <FieldRange
              v-model="shortTermBufferDuration"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.short_term_buffer_duration.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.short_term_buffer_duration.description')"
              :min="0.01"
              :max="1"
              :step="0.01"
              :format-value="value => `${value.toFixed(2)} s`"
            />

            <FieldRange
              v-model="longTermBufferDuration"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.long_term_buffer_duration.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.long_term_buffer_duration.description')"
              :min="2"
              :max="10"
              :step="0.5"
              :format-value="value => `${value.toFixed(1)} s`"
            />
          </div>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <div w-full rounded-xl flex="~ col gap-4">
        <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
          <div class="inline-flex items-center gap-4">
            {{ t('settings.pages.modules.beat_sync.sections.beat_visualizer.title') }}
          </div>
        </h2>

        <div flex="~ col gap-4 items-center">
          <TransitionGroup
            tag="div"
            bg="neutral/10"
            relative aspect-square
            h-full max-h-400px max-w-400px w-full
            rounded-2xl
            flex="~ row gap-2 wrap items-center"
            :css="false"
            @enter="(el) => {
              createTimeline()
                .set(el, {
                  opacity: 1,
                  scale: 0,
                })
                .add(el, {
                  opacity: 0.8,
                  duration: 100,
                  ease: 'out(5)',
                })
                .add(el, {
                  opacity: 0,
                  scale: 1,
                  duration: 5000,
                  delay: 300,
                  ease: 'out(5)',
                  onComplete: () => {
                    beatsHistory.pop()
                  },
                })
            }"
          >
            <div
              v-for="beat in beatsHistory"
              :key="beat.id"
              absolute h-full w-full
              rounded-full bg="primary/50"
            />
          </TransitionGroup>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
