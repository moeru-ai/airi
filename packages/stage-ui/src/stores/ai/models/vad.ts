import type { MaybeRefOrGetter } from 'vue'

import type { BaseVADConfig } from '../../../libs/audio/vad'

import { merge } from '@moeru/std'
import { ref, toRef, watch } from 'vue'

import { createVAD, createVADStates } from '../../../workers/vad'

interface UseVADOptions {
  threshold?: MaybeRefOrGetter<number>
  minSilenceDurationMs?: MaybeRefOrGetter<number>

  onSpeechStart?: () => void
  onSpeechEnd?: () => void
}

const DEFAULT_VAD_THRESHOLD = 0.6
const DEFAULT_VAD_MIN_SILENCE_DURATION_MS = 800

export function resolveVADConfig(threshold?: number, minSilenceDurationMs?: number): Pick<BaseVADConfig, 'speechThreshold' | 'exitThreshold' | 'minSilenceDurationMs'> {
  const resolvedThreshold = threshold ?? DEFAULT_VAD_THRESHOLD

  return {
    speechThreshold: resolvedThreshold,
    exitThreshold: resolvedThreshold * 0.3,
    minSilenceDurationMs: minSilenceDurationMs ?? DEFAULT_VAD_MIN_SILENCE_DURATION_MS,
  }
}

export function useVAD(workerUrl: string, options?: UseVADOptions) {
  const defaultOptions: UseVADOptions = {
    threshold: ref(DEFAULT_VAD_THRESHOLD),
    minSilenceDurationMs: ref(DEFAULT_VAD_MIN_SILENCE_DURATION_MS),
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

  const threshold = toRef(options.threshold)
  const minSilenceDurationMs = toRef(options.minSilenceDurationMs)

  async function init() {
    if (loaded.value || loading.value || manager.value)
      return

    loading.value = true
    inferenceError.value = ''

    try {
      const vadConfig = resolveVADConfig(threshold.value, minSilenceDurationMs.value)

      vad.value = await createVAD({
        sampleRate: 16000,
        ...vadConfig,
      })

      // Set up event handlers
      vad.value.on('speech-start', () => {
        isSpeech.value = true
        options?.onSpeechStart?.()
      })

      vad.value.on('speech-end', () => {
        isSpeech.value = false
        options?.onSpeechEnd?.()
      })

      vad.value.on('debug', ({ data }) => {
        if (data?.probability !== undefined) {
          isSpeechProb.value = data.probability

          // Update VAD history for visualization
          isSpeechHistory.value.push(data.probability)
          if (isSpeechHistory.value.length > maxIsSpeechHistory) {
            isSpeechHistory.value.shift()
          }
        }
      })

      vad.value.on('status', ({ type, message }) => {
        if (type === 'error') {
          inferenceError.value = message
        }
      })

      // Create and initialize audio manager
      const m = createVADStates(vad.value, workerUrl, {
        minChunkSize: 512,
        // NOTICE: VAD will have it's own audio context since
        // it needs special sample rate and latency settings
        audioContextOptions: {
          sampleRate: 16000,
          latencyHint: 'interactive',
        },
      })

      await m.initialize()
      manager.value = m
      loaded.value = true
    }
    catch (error) {
      inferenceError.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      loading.value = false
    }
  }

  async function start(stream: MediaStream) {
    if (manager.value)
      await manager.value.start(stream)
  }

  function dispose() {
    manager.value?.stop()
    manager.value?.dispose()
    manager.value = undefined

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

  return {
    isSpeech,
    isSpeechProb,
    isSpeechHistory,
    loaded,
    loading,
    inferenceError,
    threshold,
    minSilenceDurationMs,

    init,
    start,
    dispose,
  }
}
