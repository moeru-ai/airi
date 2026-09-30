<script setup lang="ts">
import type { Capture, Observer } from '@proj-airi/pipelines-audio'

import type { HearingTranscriptionResult } from '../../../libs/providers/transcription-types'

import { errorMessageFrom } from '@moeru/std'
import { Button, FieldCombobox, FieldRange } from '@proj-airi/ui'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAudioDevice } from '../../../composables/audio/audio-device'
import { LevelMeter, TestDummyMarker, ThresholdMeter } from '../../gadgets'

const props = defineProps<{
  generateTranscription: (input: File) => Promise<HearingTranscriptionResult>
  apiKeyConfigured?: boolean
}>()

const { t } = useI18n()
const devices = useAudioDevice()
const { audioInputOptions, selectedAudioInput } = devices
const speakingThreshold = ref(25)
const isMonitoring = ref(false)
const volumeLevel = ref(0)
const isSpeaking = computed(() => volumeLevel.value >= speakingThreshold.value)
const errorMessage = ref('')
const recordings = ref<{ url: string, text: string }[]>([])
let capture: Capture<Blob> | undefined
let source: ReturnType<typeof devices.acquireInput> | undefined
let meter: Observer | undefined
let disposed = false

watch(devices.input, (input, previous) => {
  if (previous && input !== previous) {
    capture?.cancel('Audio device replaced')
    capture = undefined
    meter?.cancel()
    isMonitoring.value = false
  }
})

async function start() {
  errorMessage.value = ''
  isMonitoring.value = true
  let lease: ReturnType<typeof devices.acquireInput> | undefined
  try {
    lease = devices.acquireInput()
    source = lease
    const audio = await lease.input
    if (disposed || !isMonitoring.value || source !== lease) {
      await lease.release()
      return
    }
    capture = audio.capture({ delivery: 'file', file: { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 } })
    const recordingLease = lease
    void capture.done.then(() => recordingLease.release())
    meter = audio.observe({ windowMs: 32, hopMs: 32 }, async (window) => {
      const samples = window.channels[0]
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 100
    }, (result) => { volumeLevel.value = result.value })
  }
  catch (cause) {
    void lease?.release()
    if (source !== lease)
      return
    isMonitoring.value = false
    source = undefined
    if (!disposed && (!(cause instanceof DOMException) || cause.name !== 'AbortError'))
      errorMessage.value = errorMessageFrom(cause) ?? t('stage.chat.voice-preview.failed')
  }
}

async function finish() {
  isMonitoring.value = false
  const recording = capture
  const lease = source
  source = undefined
  capture = undefined
  meter?.cancel()
  meter = undefined
  volumeLevel.value = 0
  // Retain the source until its codec has drained. Another recording can retain the same microphone meanwhile.
  const completed = recording?.finish()
  if (!completed) {
    await lease?.release()
    return
  }
  try {
    const outcome = await completed
    if (outcome.status === 'failed')
      throw outcome.error
    if (outcome.status !== 'finished' || disposed)
      return
    const entry = { url: URL.createObjectURL(outcome.value), text: '' }
    recordings.value.push(entry)
    const result = await props.generateTranscription(new File([outcome.value], 'recording.wav', { type: outcome.value.type }))
    const text = await result.text
    const displayed = recordings.value.find(recording => recording.url === entry.url)
    if (!disposed && displayed)
      displayed.text = text
  }
  catch (cause) {
    if (!disposed)
      errorMessage.value = errorMessageFrom(cause) ?? t('stage.chat.voice-preview.failed')
  }
}

async function toggleMonitoring() {
  if (isMonitoring.value)
    await finish()
  else
    await start()
}

const speakingIndicatorClass = computed(() => isSpeaking.value
  ? 'bg-green-500 shadow-lg shadow-green-500/50'
  : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600')

onScopeDispose(() => {
  disposed = true
  capture?.cancel('Playground disposed')
  void source?.release()
  meter?.cancel()
  recordings.value.forEach(recording => URL.revokeObjectURL(recording.url))
})
</script>

<template>
  <div :class="['w-full pt-1']">
    <h2 :class="['mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400']">
      <div :class="['inline-flex items-center gap-4']">
        <TestDummyMarker />
        <div>
          {{ t('settings.pages.providers.provider.transcriptions.playground.title') }}
        </div>
      </div>
    </h2>

    <!-- Audio Input Selection -->
    <div :class="['mb-2']">
      <FieldCombobox
        v-model="selectedAudioInput"
        :label="t('stage.chat.voice-preview.device')"
        :description="t('stage.chat.voice-preview.device-description')"
        :options="audioInputOptions"
        :placeholder="t('stage.chat.voice-preview.device-placeholder')"
        layout="vertical"
        :class="['h-fit w-full']"
      />
    </div>

    <Button :class="['my-4 w-full']" @click="toggleMonitoring">
      {{ t(isMonitoring ? 'stage.chat.voice-preview.stop' : 'stage.chat.voice-preview.start') }}
    </Button>

    <!-- Error message display -->
    <div v-if="errorMessage" :class="['mb-4 border border-red-200 rounded-lg bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20']">
      <div :class="['flex items-center gap-2 text-red-700 dark:text-red-400']">
        <div :class="['i-solar:warning-circle-line-duotone text-lg']" />
        <span :class="['text-sm font-medium']">{{ errorMessage }}</span>
      </div>
    </div>

    <div>
      <div v-for="recording in recordings" :key="recording.url" :class="['mb-2']">
        <audio :src="recording.url" controls :class="['w-full']" />
        <div v-if="recording.text" :class="['mt-2 text-sm text-neutral-500 dark:text-neutral-400']">
          {{ recording.text }}
        </div>
      </div>
    </div>

    <!-- Audio Level Visualization -->
    <div :class="['space-y-3']">
      <!-- Volume Meter -->
      <LevelMeter :level="volumeLevel" :label="t('stage.chat.voice-preview.level')" />

      <!-- VAD Probability Meter (when VAD model is active) -->
      <ThresholdMeter
        :value="volumeLevel / 100"
        :threshold="speakingThreshold / 100"
        :label="t('stage.chat.voice-preview.activity')"
        :below-label="t('stage.chat.voice-preview.silence')"
        :above-label="t('stage.chat.voice-preview.speech')"
        :threshold-label="t('stage.chat.voice-preview.threshold')"
      />

      <div :class="['space-y-3']">
        <FieldRange
          v-model="speakingThreshold"
          :label="t('stage.chat.voice-preview.sensitivity')"
          :description="t('stage.chat.voice-preview.sensitivity-description')"
          :min="1"
          :max="80"
          :step="1"
          :format-value="value => `${value}%`"
        />
      </div>

      <!-- Speaking Indicator -->
      <div :class="['flex items-center gap-3']">
        <div
          :class="['h-4 w-4 rounded-full transition-all duration-200', speakingIndicatorClass]"
        />
        <span :class="['text-sm font-medium']">
          {{ t(isSpeaking ? 'stage.chat.voice-preview.speech' : 'stage.chat.voice-preview.silence') }}
        </span>
      </div>
    </div>
  </div>
</template>
