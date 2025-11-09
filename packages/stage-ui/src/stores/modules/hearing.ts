import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import type { StreamTranscriptionResult } from '../providers/aliyun'

import { useLocalStorage } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { logHearing, summarizeHearingText } from '../../utils/hearing-logger'
import { useProvidersStore } from '../providers'
import { streamTranscription as streamAliyunTranscription } from '../providers/aliyun'

export const DEFAULT_TRANSCRIPTION_REGEX_ENABLED = true
export const DEFAULT_TRANSCRIPTION_REGEX_PATTERN = '(?:\\[[^\\]]+\\])|(\\.)'
export const DEFAULT_TRANSCRIPTION_REGEX_REPLACEMENT = ''
export const DEFAULT_TRANSCRIPTION_REGEX_FLAGS = 'g'

type GenerateTranscriptionResponse = Awaited<ReturnType<typeof generateTranscription>>
type HearingTranscriptionGenerateResult = GenerateTranscriptionResponse & { mode: 'generate' }
type HearingTranscriptionStreamResult = StreamTranscriptionResult & { mode: 'stream' }
export type HearingTranscriptionResult = HearingTranscriptionGenerateResult | HearingTranscriptionStreamResult

type HearingTranscriptionInput = File | {
  file?: File
  inputAudioStream?: ReadableStream<ArrayBuffer>
}

interface HearingTranscriptionInvokeOptions {
  providerOptions?: Record<string, unknown>
}

const STREAM_TRANSCRIPTION_EXECUTORS: Record<string, typeof streamAliyunTranscription> = {
  'aliyun-nls-transcription': streamAliyunTranscription,
}

export const useHearingStore = defineStore('hearing-store', () => {
  const providersStore = useProvidersStore()
  const {
    allAudioTranscriptionProvidersMetadata,
    configuredTranscriptionProvidersMetadata,
  } = storeToRefs(providersStore)

  // State
  const activeTranscriptionProvider = useLocalStorage('settings/hearing/active-provider', '')
  const activeTranscriptionModel = useLocalStorage('settings/hearing/active-model', '')
  const activeCustomModelName = useLocalStorage('settings/hearing/active-custom-model', '')
  const transcriptionModelSearchQuery = ref('')
  const transcriptionRegexEnabled = useLocalStorage('settings/hearing/regex/enabled', DEFAULT_TRANSCRIPTION_REGEX_ENABLED)
  const transcriptionRegexPattern = useLocalStorage('settings/hearing/regex/pattern', DEFAULT_TRANSCRIPTION_REGEX_PATTERN)
  const transcriptionRegexReplacement = useLocalStorage('settings/hearing/regex/replacement', DEFAULT_TRANSCRIPTION_REGEX_REPLACEMENT)
  const transcriptionRegexFlags = useLocalStorage('settings/hearing/regex/flags', DEFAULT_TRANSCRIPTION_REGEX_FLAGS)
  const transcriptionRegexError = ref<string | null>(null)

  const compiledTranscriptionRegex = computed(() => {
    if (!transcriptionRegexEnabled.value || !transcriptionRegexPattern.value) {
      transcriptionRegexError.value = null
      return null
    }

    try {
      const regex = new RegExp(transcriptionRegexPattern.value, transcriptionRegexFlags.value || 'g')
      transcriptionRegexError.value = null
      return regex
    }
    catch (error) {
      transcriptionRegexError.value = error instanceof Error ? error.message : String(error)
      return null
    }
  })

  function applyTranscriptionRegex(text: string) {
    const regex = compiledTranscriptionRegex.value
    if (!regex)
      return text

    try {
      return text.replace(regex, transcriptionRegexReplacement.value ?? '')
    }
    catch (error) {
      console.warn('Failed to apply transcription regex:', error)
      return text
    }
  }

  function resetTranscriptionRegex() {
    transcriptionRegexEnabled.value = DEFAULT_TRANSCRIPTION_REGEX_ENABLED
    transcriptionRegexPattern.value = DEFAULT_TRANSCRIPTION_REGEX_PATTERN
    transcriptionRegexReplacement.value = DEFAULT_TRANSCRIPTION_REGEX_REPLACEMENT
    transcriptionRegexFlags.value = DEFAULT_TRANSCRIPTION_REGEX_FLAGS
  }

  // Computed properties
  const availableProvidersMetadata = computed(() => allAudioTranscriptionProvidersMetadata.value)

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeTranscriptionProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeTranscriptionProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeTranscriptionProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeTranscriptionProvider.value] || null
  })

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    return !!activeTranscriptionProvider.value
  })

  watch(configuredTranscriptionProvidersMetadata, (providers) => {
    if (!activeTranscriptionProvider.value)
      return

    const isStillConfigured = providers.some(provider => provider.id === activeTranscriptionProvider.value)
    if (isStillConfigured)
      return

    activeTranscriptionProvider.value = ''
    activeTranscriptionModel.value = ''
    activeCustomModelName.value = ''
  }, { immediate: true })

  async function transcription(
    providerId: string,
    provider: TranscriptionProviderWithExtraOptions<string, any>,
    model: string,
    input: HearingTranscriptionInput,
    format?: 'json' | 'verbose_json',
    options?: HearingTranscriptionInvokeOptions,
  ): Promise<HearingTranscriptionResult> {
    const normalizedInput = (input instanceof File ? { file: input } : input ?? {}) as {
      file?: File
      inputAudioStream?: ReadableStream<ArrayBuffer>
    }
    const features = providersStore.getTranscriptionFeatures(providerId)
    const streamExecutor = STREAM_TRANSCRIPTION_EXECUTORS[providerId]

    if (features.supportsStreamOutput && streamExecutor) {
      const request = provider.transcription(model, options?.providerOptions)

      if (features.supportsStreamInput && normalizedInput.inputAudioStream) {
        const streamResult = streamExecutor({
          ...request,
          inputAudioStream: normalizedInput.inputAudioStream,
        } as Parameters<typeof streamExecutor>[0])
        // TODO: integrate VAD-driven silence detection to stop and restart realtime sessions based on silence thresholds.
        return {
          mode: 'stream',
          ...streamResult,
        }
      }

      if (!features.supportsStreamInput && normalizedInput.file) {
        const streamResult = streamExecutor({
          ...request,
          file: normalizedInput.file,
        } as Parameters<typeof streamExecutor>[0])
        // TODO: integrate VAD-driven silence detection to stop and restart realtime sessions based on silence thresholds.
        return {
          mode: 'stream',
          ...streamResult,
        }
      }

      if (features.supportsStreamInput && !normalizedInput.inputAudioStream && normalizedInput.file) {
        const streamResult = streamExecutor({
          ...request,
          file: normalizedInput.file,
        } as Parameters<typeof streamExecutor>[0])
        // TODO: integrate VAD-driven silence detection to stop and restart realtime sessions based on silence thresholds.
        return {
          mode: 'stream',
          ...streamResult,
        }
      }

      if (!features.supportsGenerate || !normalizedInput.file) {
        throw new Error('No compatible input provided for streaming transcription.')
      }
    }

    if (!normalizedInput.file) {
      throw new Error('File input is required for transcription.')
    }

    logHearing('request', {
      provider: providerId,
      model,
      format: format ?? 'default',
      fileBytes: normalizedInput.file.size,
      mimeType: normalizedInput.file.type || '(unknown)',
      timestamp: new Date().toISOString(),
    }, 'debug')

    const response = await generateTranscription({
      ...provider.transcription(model, options?.providerOptions),
      file: normalizedInput.file,
      responseFormat: format,
    })

    return {
      mode: 'generate',
      ...response,
    }
  }

  return {
    activeTranscriptionProvider,
    activeTranscriptionModel,
    availableProvidersMetadata,
    activeCustomModelName,
    transcriptionModelSearchQuery,
    transcriptionRegexEnabled,
    transcriptionRegexPattern,
    transcriptionRegexReplacement,
    transcriptionRegexFlags,
    transcriptionRegexError,

    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    transcription,
    loadModelsForProvider,
    getModelsForProvider,
    applyTranscriptionRegex,
    resetTranscriptionRegex,
  }
})

export const useHearingSpeechInputPipeline = defineStore('modules:hearing:speech:audio-input-pipeline', () => {
  const error = ref<string>()

  const hearingStore = useHearingStore()
  const {
    activeTranscriptionProvider,
    activeTranscriptionModel,
    transcriptionRegexEnabled,
    transcriptionRegexPattern,
    transcriptionRegexFlags,
    transcriptionRegexReplacement,
  } = storeToRefs(hearingStore)
  const providersStore = useProvidersStore()

  async function transcribeForRecording(recording: Blob | null | undefined) {
    if (!recording)
      return

    try {
      if (recording && recording.size > 0) {
        const providerId = activeTranscriptionProvider.value
        const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
        if (!provider) {
          throw new Error('Failed to initialize speech provider')
        }

        // Get model from configuration or use default
        const model = activeTranscriptionModel.value
        const result = await hearingStore.transcription(
          providerId,
          provider,
          model,
          new File([recording], 'recording.wav'),
        )
        const rawText = result.mode === 'stream' ? await result.text : result.text
        const normalizedRaw = rawText ?? ''
        const sanitized = hearingStore.applyTranscriptionRegex(normalizedRaw)
        const regexActive = transcriptionRegexEnabled.value && !!transcriptionRegexPattern.value
        const regexChanged = regexActive && normalizedRaw !== sanitized

        logHearing('regex-transform', {
          provider: providerId,
          model,
          rawPreview: summarizeHearingText(normalizedRaw),
          sanitizedPreview: summarizeHearingText(sanitized),
          rawLength: normalizedRaw.length,
          sanitizedLength: sanitized.length,
          regexEnabled: regexActive,
          regexChanged,
          pattern: transcriptionRegexPattern.value,
          flags: transcriptionRegexFlags.value,
          replacementSample: transcriptionRegexReplacement.value ? transcriptionRegexReplacement.value.slice(0, 32) : '',
        }, 'debug')

        if (!sanitized.trim() && normalizedRaw && normalizedRaw.trim()) {
          console.warn('Transcription removed by regex; message will not be sent to the chat.')
        }

        return sanitized
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Error generating transcription:', error.value)
    }
  }

  return {
    error,

    transcribeForRecording,
  }
})
