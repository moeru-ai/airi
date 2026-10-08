<script setup lang="ts">
import type { Capture } from '@proj-airi/pipelines-audio'

import type { HearingTranscriptionResult } from '../../../libs/providers/transcription-types'

import { errorMessageFrom } from '@moeru/std'
import { encodeWav } from '@proj-airi/audio/encoding'
import { capture as captureAudio, observe } from '@proj-airi/pipelines-audio'
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
/** One recording and its level meter. Aborting the session ends both and releases the microphone. */
let session: { recording: Capture, wav: Promise<Blob>, meter: AbortController } | undefined
let disposed = false

function reportFailure(cause: unknown) {
  if (!disposed && (!(cause instanceof DOMException) || cause.name !== 'AbortError'))
    errorMessage.value = errorMessageFrom(cause) ?? t('stage.chat.voice-preview.failed')
}

function discard(reason: string) {
  session?.meter.abort(reason)
  session?.recording.cancel(reason)
  session = undefined
  isMonitoring.value = false
  volumeLevel.value = 0
}

watch(devices.input, () => discard('Audio device replaced'))

function start() {
  errorMessage.value = ''
  isMonitoring.value = true
  const input = devices.input.value
  const recording = captureAudio(input)
  const wav = encodeWav(recording.stream, { sampleRate: 16000, channels: 1 })
  const meter = new AbortController()
  session = { recording, wav, meter }
  void wav.catch(() => {})
  observe(input, { windowMs: 32, hopMs: 32, signal: meter.signal }, async (window) => {
    const samples = window.channels[0]
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 100
  }, (result) => { volumeLevel.value = result.value })
  void recording.done.then((outcome) => {
    if (outcome.status !== 'failed' || session?.recording !== recording)
      return
    discard('Recording failed')
    reportFailure(outcome.error)
  })
}

async function finish() {
  const current = session
  session = undefined
  isMonitoring.value = false
  current?.meter.abort('Recording finished')
  volumeLevel.value = 0
  if (!current)
    return

  try {
    const outcome = await current.recording.finish()
    if (outcome.status !== 'finished' || disposed)
      return
    const audio = await current.wav
    const entry = { url: URL.createObjectURL(audio), text: '' }
    recordings.value.push(entry)
    const result = await props.generateTranscription(new File([audio], 'recording.wav', { type: audio.type }))
    const text = await result.text
    const displayed = recordings.value.find(recording => recording.url === entry.url)
    if (!disposed && displayed)
      displayed.text = text
  }
  catch (cause) {
    reportFailure(cause)
  }
}

async function toggleMonitoring() {
  if (isMonitoring.value)
    await finish()
  else
    start()
}

const speakingIndicatorClass = computed(() => isSpeaking.value
  ? 'bg-green-500 shadow-lg shadow-green-500/50'
  : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600')

onScopeDispose(() => {
  disposed = true
  discard('Playground disposed')
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
