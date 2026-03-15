<script setup lang="ts">
import type { AnalyserWorkletParameters } from '@nekopaw/tempora'
import type { BeatSyncDetectorState } from '@proj-airi/stage-shared/beat-sync'

import { DEFAULT_ANALYSER_WORKLET_PARAMS } from '@nekopaw/tempora'
import {
  getBeatSyncInputByteFrequencyData,
  getBeatSyncState,
  listenBeatSyncBeatSignal,
  listenBeatSyncStateChange,
  toggleBeatSync,
  updateBeatSyncParameters,
} from '@proj-airi/stage-shared/beat-sync'
import { Alert, AudioSpectrumVisualizer } from '@proj-airi/stage-ui/components'
import { Button, FieldCheckbox, FieldRange, SelectTab } from '@proj-airi/ui'
import { createTimeline } from 'animejs'
import { nanoid } from 'nanoid'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const state = ref<BeatSyncDetectorState>()
const frequencies = ref<number[]>([])
const totalFreqHistory = ref<number[]>([])
const isUpdatingFrequencies = ref(false)
const spectrumScale = ref<'linear' | 'logarithm'>('logarithm')
const spectrumScaleOptions = [
  { label: 'Linear', value: 'linear' as const, icon: 'i-solar:chart-2-bold-duotone' },
  { label: 'Logarithm', value: 'logarithm' as const, icon: 'i-solar:chart-bold-duotone' },
]

const { t } = useI18n()

const beatsHistory = ref<Array<{
  id: string
  energy: number
  normalizedEnergy: number
}>>([])

const parameters = ref<AnalyserWorkletParameters>({
  ...DEFAULT_ANALYSER_WORKLET_PARAMS,
  // Loosen the parameters for easier beat detection by default.
  // Also makes life easier :)
  warmup: false,
  spectralFlux: false,
  adaptiveThreshold: false,
})

watch([state, parameters], ([newState, newParameters]) => {
  if (newState?.isActive) {
    updateBeatSyncParameters(toRaw(newParameters))
  }
}, { deep: true, immediate: true })

function normalizeEnergy(energy: number) {
  const base = 2
  const a = 0.5
  return ((base ** energy - 1) / (base - 1)) ** a
}

function onRippleEnter(el: Element, done: () => void) {
  const beatId = (el as HTMLElement).dataset.beatId
  createTimeline()
    .set(el, {
      opacity: 1,
      scale: 0,
    })
    .add(el, {
      opacity: 0,
      scale: 1,
      duration: 2000,
      delay: 0,
      ease: 'out(5)',
      onComplete: () => {
        if (!beatId)
          return

        const idx = beatsHistory.value.findIndex(b => b.id === beatId)
        if (idx >= 0)
          beatsHistory.value.splice(idx, 1)

        done()
      },
    })
}

function resetDefaultParameters() {
  parameters.value = { ...DEFAULT_ANALYSER_WORKLET_PARAMS }
}

async function updateFrequencies() {
  frequencies.value = Array.from(await getBeatSyncInputByteFrequencyData())
  totalFreqHistory.value.push(frequencies.value.reduce((a, b) => a + b, 0))

  while (totalFreqHistory.value.length > 50)
    totalFreqHistory.value.shift()

  if (isUpdatingFrequencies.value) {
    requestAnimationFrame(updateFrequencies)
  }
  else {
    frequencies.value = frequencies.value.map(() => 0)
    totalFreqHistory.value = []
  }
}

const noAudioDetected = computed(() => {
  if (!isUpdatingFrequencies.value)
    return false

  if (totalFreqHistory.value.length < 50)
    return false

  return totalFreqHistory.value.reduce((a, b) => a + b, 0) === 0
})

watch(state, async (newState) => {
  if (newState?.isActive) {
    if (!isUpdatingFrequencies.value) {
      isUpdatingFrequencies.value = true
      updateFrequencies()
    }
  }
  else {
    isUpdatingFrequencies.value = false
  }
}, { immediate: true, deep: true })

onMounted(() => {
  getBeatSyncState().then(initialState => state.value = initialState)

  const removeHandlerFns = [
    listenBeatSyncStateChange((newState) => {
      state.value = { ...newState }
    }),
    listenBeatSyncBeatSignal(({ energy }) => {
      beatsHistory.value.unshift({
        id: nanoid(),
        energy,
        normalizedEnergy: normalizeEnergy(energy),
      })
    }),
  ]

  const removeHandlers = () => removeHandlerFns.forEach(fn => fn())
  onUnmounted(() => removeHandlers())
})

onUnmounted(() => {
  isUpdatingFrequencies.value = false
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[60%]">
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
            <template v-if="state?.isActive">
              <Button @click="toggleBeatSync(false)">
                {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.stop') }}
              </Button>
            </template>

            <template v-else>
              <Button @click="toggleBeatSync(true)">
                {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.start_screen_capture') }}
              </Button>
            </template>
          </div>
        </div>

        <Alert
          v-if="noAudioDetected"
          type="warning"
        >
          <template #title>
            No audio detected
          </template>
          <template #content>
            Please make sure that the correct permissions are granted and the audio source is playing sound.
          </template>
        </Alert>

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
              v-model="parameters.sensitivity"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.sensitivity.label')"
              :min="0"
              :max="1"
              :step="0.01"
              :format-value="value => value.toFixed(1)"
            />

            <FieldRange
              v-model="parameters.minBeatInterval"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.min_beat_interval.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.min_beat_interval.description')"
              :min="0.05"
              :max="1"
              :step="0.01"
              :format-value="value => `${(60 / value).toFixed(1)} BPM / ${value.toFixed(2)} s`"
            />

            <div>
              <h3 class="text text-neutral-500 md:text-xl dark:text-neutral-500">
                {{ t('settings.pages.modules.beat_sync.sections.parameters.advanced_parameters') }}
              </h3>
            </div>

            <FieldRange
              v-model="parameters.lowpassFilterFrequency"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.lowpass_filter_frequency.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.lowpass_filter_frequency.description')"
              :min="20"
              :max="600"
              :step="10"
              :format-value="value => `${value.toFixed(0)} Hz`"
            />

            <FieldRange
              v-model="parameters.highpassFilterFrequency"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.highpass_filter_frequency.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.highpass_filter_frequency.description')"
              :min="150"
              :max="2000"
              :step="10"
              :format-value="value => `${value.toFixed(0)} Hz`"
            />

            <FieldRange
              v-model="parameters.envelopeFilterFrequency"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.envelope_filter_frequency.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.envelope_filter_frequency.description')"
              :min="20"
              :max="200"
              :step="10"
              :format-value="value => `${value.toFixed(0)} Hz`"
            />

            <FieldCheckbox
              v-model="parameters.warmup"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.warmup.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.warmup.description')"
            />

            <FieldCheckbox
              v-model="parameters.adaptiveThreshold"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.adaptive_threshold.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.adaptive_threshold.description')"
            />

            <FieldCheckbox
              v-model="parameters.spectralFlux"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.spectral_flux.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.spectral_flux.description')"
            />

            <FieldRange
              v-model="parameters.bufferDuration"
              :label="t('settings.pages.modules.beat_sync.sections.parameters.parameters.buffer_duration.label')"
              :description="t('settings.pages.modules.beat_sync.sections.parameters.parameters.buffer_duration.description')"
              :min="2"
              :max="10"
              :step="0.5"
              :format-value="value => `${value.toFixed(1)} s`"
            />
          </div>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6 items-center" class="w-full md:w-[40%]">
      <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
        <div class="inline-flex items-center gap-4">
          {{ t('settings.pages.modules.beat_sync.sections.beat_visualizer.title') }}
        </div>
      </h2>

      <div class="max-w-400px w-full flex flex-col gap-3">
        <div bg="neutral/10" h-64px w-full overflow-hidden rounded-2xl>
          <AudioSpectrumVisualizer
            v-if="isUpdatingFrequencies"
            :frequencies="frequencies"
            :scale="spectrumScale"
            h-full w-full gap-0
            bars-class="bg-primary-400/50 dark:bg-primary-500/50 rounded-none"
          />
        </div>

        <SelectTab
          v-model="spectrumScale"
          size="sm"
          :options="spectrumScaleOptions"
        />
      </div>

      <TransitionGroup
        tag="div"
        bg="neutral/10"
        relative box-border aspect-square h-full max-h-400px max-w-400px w-full rounded-2xl
        flex="~ row gap-2 wrap items-center"
        :css="false"
        @enter="onRippleEnter"
      >
        <div
          v-for="beat in beatsHistory"
          :key="beat.id"
          :data-beat-id="beat.id"
          absolute h-full w-full
          rounded-full bg="primary/50"
        />
      </TransitionGroup>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.beat_sync.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
