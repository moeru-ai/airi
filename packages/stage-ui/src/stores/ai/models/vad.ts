import type { Span } from '@opentelemetry/api'
import type { MaybeRefOrGetter } from 'vue'

import type { BaseVADConfig } from '../../../libs/audio/vad'

import { merge } from '@moeru/std'
import { errorMessageFromValue, IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { ref, toRef, watch } from 'vue'

import { startSpan } from '../../../composables/use-io-tracer'
import { createVAD, createVADStates } from '../../../workers/vad'

interface UseVADOptions {
  threshold?: MaybeRefOrGetter<number>
  minSilenceDurationMs?: MaybeRefOrGetter<number>
  speechPadMs?: MaybeRefOrGetter<number>
  minSpeechDurationMs?: MaybeRefOrGetter<number>

  onSpeechStart?: () => void
  onSpeechAudio?: (event: { buffer: Float32Array }) => void
  onSpeechEnd?: () => void
  onSpeechCancel?: () => void
  onSpeechReady?: (event: { buffer: Float32Array, duration: number }) => void
}

const DEFAULT_VAD_THRESHOLD = 0.52
const DEFAULT_VAD_MIN_SILENCE_DURATION_MS = 1200
const DEFAULT_VAD_SPEECH_PAD_MS = 360
const DEFAULT_VAD_MIN_SPEECH_DURATION_MS = 300

export function resolveVADConfig(
  threshold?: number,
  minSilenceDurationMs?: number,
  speechPadMs?: number,
  minSpeechDurationMs?: number,
): Pick<BaseVADConfig, 'speechThreshold' | 'exitThreshold' | 'minSilenceDurationMs' | 'speechPadMs' | 'minSpeechDurationMs'> {
  const resolvedThreshold = threshold ?? DEFAULT_VAD_THRESHOLD

  return {
    speechThreshold: resolvedThreshold,
    exitThreshold: resolvedThreshold * 0.3,
    minSilenceDurationMs: minSilenceDurationMs ?? DEFAULT_VAD_MIN_SILENCE_DURATION_MS,
    speechPadMs: speechPadMs ?? DEFAULT_VAD_SPEECH_PAD_MS,
    minSpeechDurationMs: minSpeechDurationMs ?? DEFAULT_VAD_MIN_SPEECH_DURATION_MS,
  }
}

export function useVAD(workerUrl: string, options?: UseVADOptions) {
  const defaultOptions: UseVADOptions = {
    threshold: ref(DEFAULT_VAD_THRESHOLD),
    minSilenceDurationMs: ref(DEFAULT_VAD_MIN_SILENCE_DURATION_MS),
    speechPadMs: ref(DEFAULT_VAD_SPEECH_PAD_MS),
    minSpeechDurationMs: ref(DEFAULT_VAD_MIN_SPEECH_DURATION_MS),
  }

  options = merge(defaultOptions, options)

  const vad = ref<Awaited<ReturnType<typeof createVAD>>>()
  const manager = ref<ReturnType<typeof createVADStates>>()
  const inferenceError = ref<string>()
  const maxIsSpeechHistory = 50

  const isSpeech = ref(false)
  const isSpeechProb = ref(0)
  const isSpeechHistory = ref<number[]>([])

  const loaded = ref(false)
  const loading = ref(false)
  let activeSpan: Span | undefined
  let initialization: Promise<void> | undefined
  let generation = 0

  function finishActiveSpan(aborted: boolean) {
    if (!activeSpan)
      return

    if (aborted)
      activeSpan.setAttribute(IOAttributes.VADAborted, true)
    activeSpan.end()
    activeSpan = undefined
  }

  const threshold = toRef(options.threshold)
  const minSilenceDurationMs = toRef(options.minSilenceDurationMs)
  const speechPadMs = toRef(options.speechPadMs)
  const minSpeechDurationMs = toRef(options.minSpeechDurationMs)

  async function init() {
    if (loaded.value)
      return

    if (initialization)
      return await initialization

    const currentGeneration = ++generation
    loading.value = true
    inferenceError.value = ''

    const currentInitialization = (async () => {
      const vadConfig = resolveVADConfig(
        threshold.value,
        minSilenceDurationMs.value,
        speechPadMs.value,
        minSpeechDurationMs.value,
      )

      const createdVad = await createVAD({
        sampleRate: 16000,
        ...vadConfig,
      })
      if (generation !== currentGeneration)
        return

      // Set up event handlers
      createdVad.on('speech-start', () => {
        finishActiveSpan(true)
        activeSpan = startSpan(IOSpanNames.VoiceActivityDetection, undefined, {
          [IOAttributes.Subsystem]: IOSubsystems.VAD,
        })
        isSpeech.value = true
        options?.onSpeechStart?.()
      })

      createdVad.on('speech-audio', (event) => {
        options?.onSpeechAudio?.(event)
      })

      createdVad.on('speech-end', () => {
        isSpeech.value = false
        options?.onSpeechEnd?.()
      })

      createdVad.on('speech-cancel', () => {
        finishActiveSpan(true)
        isSpeech.value = false
        options?.onSpeechCancel?.()
      })

      createdVad.on('speech-ready', (event) => {
        activeSpan?.setAttribute(IOAttributes.VADAudioDurationMs, event.duration)
        finishActiveSpan(false)
        options?.onSpeechReady?.(event)
      })

      createdVad.on('debug', ({ data }) => {
        if (data?.probability !== undefined) {
          isSpeechProb.value = data.probability

          // Update VAD history for visualization
          isSpeechHistory.value.push(data.probability)
          if (isSpeechHistory.value.length > maxIsSpeechHistory) {
            isSpeechHistory.value.shift()
          }
        }
      })

      createdVad.on('status', ({ type, message }) => {
        if (type === 'error') {
          inferenceError.value = message
        }
      })

      // Create and initialize audio manager
      const m = createVADStates(createdVad, workerUrl, {
        minChunkSize: 512,
        // NOTICE: VAD will have it's own audio context since
        // it needs special sample rate and latency settings
        audioContextOptions: {
          sampleRate: 16000,
          latencyHint: 'interactive',
        },
      })

      try {
        await m.initialize()
        if (generation !== currentGeneration) {
          m.dispose()
          return
        }

        vad.value = createdVad
        manager.value = m
        loaded.value = true
      }
      catch (error) {
        m.dispose()
        throw error
      }
    })()
    const settledInitialization = currentInitialization
      .catch((error) => {
        if (generation === currentGeneration)
          inferenceError.value = errorMessageFromValue(error)
      })
      .finally(() => {
        if (initialization === settledInitialization)
          initialization = undefined
        if (generation === currentGeneration)
          loading.value = false
      })
    initialization = settledInitialization
    await settledInitialization
  }

  async function start(stream: MediaStream) {
    const currentManager = manager.value
    const currentGeneration = generation
    if (!currentManager)
      return

    await currentManager.start(stream)
    if (generation !== currentGeneration || manager.value !== currentManager)
      currentManager.dispose()
  }

  function dispose() {
    generation += 1
    initialization = undefined
    finishActiveSpan(true)
    manager.value?.stop()
    manager.value?.dispose()
    manager.value = undefined
    vad.value = undefined

    isSpeech.value = false
    isSpeechProb.value = 0
    isSpeechHistory.value = []

    loaded.value = false
    loading.value = false
  }

  watch(threshold, (newVal) => {
    if (vad.value && newVal !== undefined) {
      vad.value.updateConfig({ speechThreshold: newVal, exitThreshold: newVal * 0.3 })
    }
  })

  watch(minSilenceDurationMs, (newVal) => {
    if (vad.value && newVal !== undefined) {
      vad.value.updateConfig({ minSilenceDurationMs: newVal })
    }
  })

  watch(speechPadMs, (newVal) => {
    if (vad.value && newVal !== undefined) {
      vad.value.updateConfig({ speechPadMs: newVal })
    }
  })

  watch(minSpeechDurationMs, (newVal) => {
    if (vad.value && newVal !== undefined) {
      vad.value.updateConfig({ minSpeechDurationMs: newVal })
    }
  })

  return {
    isSpeech,
    isSpeechProb,
    isSpeechHistory,
    loaded,
    loading,
    inferenceError,
    threshold,
    minSilenceDurationMs,
    speechPadMs,
    minSpeechDurationMs,

    init,
    start,
    dispose,
  }
}
