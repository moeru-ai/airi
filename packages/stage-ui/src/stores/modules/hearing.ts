import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { WithUnknown } from '@xsai/shared'
import type { StreamTranscriptionResult, StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription'

import { generateTranscription } from '@xsai/generate-transcription'
import { streamTranscription } from '@xsai/stream-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { createResettableLocalStorage, createResettableRef } from '../../utils/resettable'
import { useProvidersStore } from '../providers'

export interface StreamTranscriptionFileInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
  file: Blob
  fileName?: string
}

export interface StreamTranscriptionStreamInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
  inputAudioStream: ReadableStream<ArrayBuffer>
}

export type StreamTranscription = (options: WithUnknown<StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions>) => StreamTranscriptionResult

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

const STREAM_TRANSCRIPTION_EXECUTORS: Record<string, StreamTranscription> = {
  'aliyun-nls-transcription': streamTranscription as StreamTranscription,
}

export const useHearingStore = defineStore('hearing-store', () => {
  const providersStore = useProvidersStore()
  const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)

  // State
  const [activeTranscriptionProvider, resetActiveTranscriptionProvider] = createResettableLocalStorage('settings/hearing/active-provider', '')
  const [activeTranscriptionModel, resetActiveTranscriptionModel] = createResettableLocalStorage('settings/hearing/active-model', '')
  const [activeCustomModelName, resetActiveCustomModelName] = createResettableLocalStorage('settings/hearing/active-custom-model', '')
  const [transcriptionModelSearchQuery, resetTranscriptionModelSearchQuery] = createResettableRef('')

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
    return !!activeTranscriptionProvider.value && !!activeTranscriptionModel.value
  })

  function resetState() {
    resetActiveTranscriptionProvider()
    resetActiveTranscriptionModel()
    resetActiveCustomModelName()
    resetTranscriptionModelSearchQuery()
  }

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

    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    transcription,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})

export const useHearingSpeechInputPipeline = defineStore('modules:hearing:speech:audio-input-pipeline', () => {
  const error = ref<string>()

  const hearingStore = useHearingStore()
  const { activeTranscriptionProvider, activeTranscriptionModel } = storeToRefs(hearingStore)
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
        return result.mode === 'stream' ? await result.text : result.text
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
