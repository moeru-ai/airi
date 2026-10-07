import type { StreamingTranscriber } from '@proj-airi/core-agent'
import type { TranscriptionProvider, TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { WithUnknown } from '@xsai/shared'
import type { StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription'
import type {} from 'pinia-plugin-synced'

import type { AIRIStreamTranscriptionResult } from '../../libs/providers/stream-transcription'
import type { HearingTranscriptionResult } from '../../libs/providers/transcription-types'

import { errorMessageFrom } from '@moeru/std'
import { toMediaStream } from '@proj-airi/audio/browser'
import { encodeWav, Pcm16Encoder } from '@proj-airi/audio/encoding'
import { streamWebSpeechAPITranscription } from '@proj-airi/provider-inference'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'

import { useAnalytics } from '../../composables/use-analytics'
import { createHearingTranscriber } from '../../libs/audio/hearing-transcriber'
import { OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers'
import { APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID, executeAppleSpeechStream } from '../../libs/providers/providers/apple-speech'
import { executeSherpawStream, SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers/providers/sherpaw'
import { streamTranscription } from '../../libs/providers/stream-transcription'
import { useAudioContext } from '../audio'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'

type TranscriptionAnalyticsErrorCode = 'permission_denied' | 'device_unavailable' | 'input_unavailable' | 'provider_error' | 'unknown'

/**
 * Normalizes transcription failures into bounded analytics error codes.
 */
function transcriptionAnalyticsErrorCode(err: unknown): TranscriptionAnalyticsErrorCode {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      return 'permission_denied'

    if (err.name === 'NotFoundError' || err.name === 'NotReadableError')
      return 'device_unavailable'
  }

  const message = (errorMessageFrom(err) ?? '').toLowerCase()
  if (message.includes('permission') || message.includes('notallowed'))
    return 'permission_denied'

  if (message.includes('microphone') || message.includes('audio track') || message.includes('device'))
    return 'device_unavailable'

  if (message.includes('file input') || message.includes('compatible input'))
    return 'input_unavailable'

  return message ? 'provider_error' : 'unknown'
}

export interface StreamTranscriptionFileInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
  file: Blob
  fileName?: string
}

export interface StreamTranscriptionStreamInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
  inputAudioStream: ReadableStream<ArrayBuffer | ArrayBufferView>
}

export type StreamTranscription = (options: WithUnknown<StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions>) => AIRIStreamTranscriptionResult

export type { HearingTranscriptionResult } from '../../libs/providers/transcription-types'

type HearingTranscriptionInput = File | {
  file?: File
  fileName?: string
  inputAudioStream?: ReadableStream<ArrayBuffer | ArrayBufferView>
}

interface HearingTranscriptionInvokeOptions {
  signal?: AbortSignal
  confidenceThreshold?: number
  providerOptions?: Record<string, unknown>
}

export const CONFIDENCE_THRESHOLD_DISABLED = -3

export function filterTranscriptionByConfidence(
  segments: Array<{ text?: string, avg_logprob?: number }>,
  threshold: number,
): string {
  if (!segments.some(s => s?.avg_logprob != null && s?.text != null)) {
    return ''
  }

  return segments.filter(s => (s?.avg_logprob ?? -Infinity) >= threshold).map(s => s?.text ?? '').join('').trim()
}

/**
 * Reads a string field from an unknown response object.
 */
function stringField(value: unknown, key: string, options: { trim?: boolean } = {}) {
  if (!value || typeof value !== 'object')
    return ''

  const field = (value as Record<string, unknown>)[key]
  if (typeof field !== 'string')
    return ''

  return options.trim === false ? field : field.trim()
}

/**
 * Reads a nested object field from an unknown response object.
 */
function objectField(value: unknown, key: string) {
  if (!value || typeof value !== 'object')
    return undefined

  const field = (value as Record<string, unknown>)[key]
  return field && typeof field === 'object' ? field : undefined
}

/**
 * Normalizes generated transcription text from OpenAI-compatible response variants.
 *
 * Before:
 * - `{ result: { text: "你好" } }`
 * - `{ segments: [{ text: "你" }, { text: "好" }] }`
 *
 * After:
 * - `"你好"`
 */
export function normalizeGeneratedTranscriptionText(response: unknown) {
  const directText = stringField(response, 'text')
  if (directText)
    return directText

  for (const envelopeKey of ['result', 'data', 'output']) {
    const nested = objectField(response, envelopeKey)
    const nestedText = stringField(nested, 'text')
    if (nestedText)
      return nestedText
  }

  const segments = objectField(response, 'segments') ?? (response && typeof response === 'object' ? (response as Record<string, unknown>).segments : undefined)
  if (Array.isArray(segments)) {
    const text = segments
      .map(segment => stringField(segment, 'text', { trim: false }))
      .join('')
      .trim()
    if (text)
      return text
  }

  return ''
}

/**
 * Builds a compact diagnostic summary for an empty transcription response.
 */
export function describeEmptyTranscriptionResponse(response: unknown) {
  if (!response || typeof response !== 'object')
    return `response=${String(response)}`

  const keys = Object.keys(response as Record<string, unknown>)
  const nestedKeys = keys
    .map((key) => {
      const nested = objectField(response, key)
      return nested ? `${key}.{${Object.keys(nested as Record<string, unknown>).join(',')}}` : ''
    })
    .filter(Boolean)

  return [
    `keys=${keys.join(',') || '(none)'}`,
    ...(nestedKeys.length ? [`nested=${nestedKeys.join(';')}`] : []),
  ].join(' ')
}

/**
 * Resolves the upload filename for transcription requests.
 *
 * Use when:
 * - OpenAI-compatible providers infer audio format from multipart filenames.
 *
 * Expects:
 * - `file.name` may carry the recorder-generated extension.
 *
 * Returns:
 * - A stable filename with an audio extension.
 */
export function resolveTranscriptionFileName(file: File, explicitFileName?: string) {
  const explicit = explicitFileName?.trim()
  if (explicit)
    return explicit

  const fileName = file.name.trim()
  if (fileName)
    return fileName

  return 'recording.wav'
}

const STREAM_TRANSCRIPTION_EXECUTORS: Record<string, StreamTranscription> = {
  'aliyun-nls-transcription': streamTranscription,
  [SHERPAW_TRANSCRIPTION_PROVIDER_ID]: executeSherpawStream,
  [APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID]: executeAppleSpeechStream,
  [OFFICIAL_TRANSCRIPTION_PROVIDER_ID]: streamTranscription,
  // Web Speech API is handled specially in transcribeForMediaStream since it works directly with MediaStream
}

export function resolveStreamTranscriptionExecutor(providerId: string): StreamTranscription | undefined {
  return STREAM_TRANSCRIPTION_EXECUTORS[providerId]
}

/**
 * Resolves the setup error for the selected transcription provider.
 *
 * Use when:
 * - A speech pipeline entry point needs to fail before provider instantiation.
 * - User-facing diagnostics should explain the missing Hearing selection.
 *
 * Expects:
 * - `providerId` is the current `settings/hearing/active-provider` value.
 *
 * Returns:
 * - A setup error when no provider is selected, otherwise `undefined`.
 */
export function resolveActiveTranscriptionProviderError(providerId: string): string | undefined {
  if (providerId)
    return undefined

  return 'No active transcription provider selected. Select a provider in Settings > Hearing.'
}

/**
 * Resolves the transcription model from Hearing state with provider config fallback.
 *
 * Use when:
 * - OpenAI-compatible transcription stores the model in provider settings.
 * - The Hearing module has not yet synchronized that model into its active model state.
 *
 * Expects:
 * - `activeModel` is the current Hearing model value.
 * - `providerConfig.model` may contain a provider-scoped model name.
 *
 * Returns:
 * - The explicit Hearing model first, then the provider config model, otherwise an empty string.
 */
export function resolveActiveTranscriptionModel(activeModel: string, providerConfig?: Record<string, unknown>) {
  const modelFromHearing = activeModel.trim()
  if (modelFromHearing)
    return modelFromHearing

  const modelFromProviderConfig = typeof providerConfig?.model === 'string' ? providerConfig.model.trim() : ''
  return modelFromProviderConfig
}

/**
 * Resolves extra transcription request options from provider config and UI locale.
 *
 * Use when:
 * - Short ASR recordings need a language hint to avoid multilingual auto-detection drift.
 * - Provider-specific transcription prompts are configured outside the Hearing active model field.
 *
 * Expects:
 * - `uiLocale` uses a BCP-47-like language tag such as `zh-Hans` or `en-US`.
 *
 * Returns:
 * - OpenAI-compatible transcription options that can be merged into the provider request.
 */
export function resolveTranscriptionProviderOptions(providerConfig?: Record<string, unknown>, uiLocale = globalThis.navigator?.language ?? '') {
  const configuredLanguage = typeof providerConfig?.language === 'string' ? providerConfig.language.trim() : ''
  const localeLanguage = uiLocale.split(/[-_]/)[0]?.trim().toLowerCase() ?? ''
  const language = configuredLanguage || localeLanguage
  const prompt = typeof providerConfig?.prompt === 'string' ? providerConfig.prompt.trim() : ''

  return {
    ...(language ? { language } : {}),
    ...(prompt ? { prompt } : {}),
  }
}

export const useHearingStore = defineStore('hearing-store', () => {
  const providersStore = useProviderStore()
  const providerStore = useProviderConfigStore()
  const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)
  const {
    trackMicrophonePermissionDenied,
    trackSttFailed,
    trackSttSucceeded,
    trackVoiceInputStarted,
  } = useAnalytics()

  // Pinia synchronization owns live cross-window state. localStorage only
  // loads and saves durable values for this synchronized store.
  const persistenceOptions = { listenToStorageChanges: false }

  // State
  const activeTranscriptionProvider = useLocalStorageManualReset('settings/hearing/active-provider', '', persistenceOptions)
  const activeTranscriptionModel = useLocalStorageManualReset('settings/hearing/active-model', '', persistenceOptions)
  const activeCustomModelName = useLocalStorageManualReset('settings/hearing/active-custom-model', '', persistenceOptions)
  const transcriptionModelSearchQuery = refManualReset<string>('')
  const autoSendEnabled = useLocalStorageManualReset<boolean>('settings/hearing/auto-send-enabled', false, persistenceOptions)
  const autoSendDelay = useLocalStorageManualReset<number>('settings/hearing/auto-send-delay', 2000, persistenceOptions) // Default 2 seconds
  const confidenceThreshold = useLocalStorageManualReset<number>('settings/hearing/confidence-threshold', CONFIDENCE_THRESHOLD_DISABLED, persistenceOptions)
  const verboseJsonNotSupported = ref(false)

  watch(activeTranscriptionProvider, () => {
    verboseJsonNotSupported.value = false
  })

  // Computed properties
  const availableProvidersMetadata = computed(() => allAudioTranscriptionProvidersMetadata.value)

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.supportsModelListing(activeTranscriptionProvider.value)
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
    if (providersStore.findProviderDefinition(provider)?.requiresCredentials === false)
      await providersStore.initializeProvider(provider)

    if (providersStore.supportsModelListing(provider)) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (providersStore.supportsModelListing(provider)) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    if (!activeTranscriptionProvider.value)
      return false

    // Web Speech API doesn't strictly need a model selected (it has a default)
    // but we still check to maintain consistency
    if (activeTranscriptionProvider.value === 'browser-web-speech-api') {
      return true // Web Speech API is ready if provider is selected and available
    }

    // For OpenAI Compatible providers, check provider config as fallback
    let hasProviderModel = false
    if (activeTranscriptionProvider.value === 'openai-compatible-audio-transcription') {
      const providerConfig = providerStore.getProviderConfig(activeTranscriptionProvider.value)
      hasProviderModel = !!providerConfig?.model
    }

    return !!activeTranscriptionModel.value || hasProviderModel
  })

  function resetState() {
    activeTranscriptionProvider.reset()
    activeTranscriptionModel.reset()
    activeCustomModelName.reset()
    transcriptionModelSearchQuery.reset()
    autoSendEnabled.reset()
    autoSendDelay.reset()
    confidenceThreshold.reset()
  }

  async function transcription(
    providerId: string,
    provider: TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>,
    model: string,
    input: HearingTranscriptionInput,
    format?: 'json' | 'verbose_json',
    options?: HearingTranscriptionInvokeOptions,
  ): Promise<HearingTranscriptionResult> {
    const normalizedInput = (input instanceof File ? { file: input } : input ?? {}) as {
      file?: File
      fileName?: string
      inputAudioStream?: ReadableStream<ArrayBuffer | ArrayBufferView>
    }
    const features = providersStore.getTranscriptionFeatures(providerId)
    const streamExecutor = resolveStreamTranscriptionExecutor(providerId)

    const sttStartedAt = performance.now()
    trackVoiceInputStarted({ stt_provider_id: providerId })

    function emitSucceeded(charCount: number, stream: boolean) {
      trackSttSucceeded({
        provider: providerId,
        latency_ms: Math.round(performance.now() - sttStartedAt),
        char_count: charCount,
        stream,
      })
    }
    function emitFailed(err: unknown) {
      const errorCode = transcriptionAnalyticsErrorCode(err)
      trackSttFailed({ provider: providerId, error_code: errorCode })
      if (errorCode === 'permission_denied') {
        trackMicrophonePermissionDenied({
          stt_provider_id: providerId,
          error_code: errorCode,
        })
      }
    }

    try {
      if (features.supportsStreamOutput && streamExecutor) {
        const request = { ...provider.transcription(model, options?.providerOptions), abortSignal: options?.signal }

        // Recorder files contain encoded media. Sherpaw accepts only the raw PCM16 stream from the live pipeline.
        if (providerId === SHERPAW_TRANSCRIPTION_PROVIDER_ID && normalizedInput.file && !normalizedInput.inputAudioStream) {
          throw new Error('Sherpaw requires live microphone input. Recorded file input is not supported.')
        }

        // Stream branches: emit succeeded with char_count=0 once the
        // executor returns successfully — char count is only known by
        // the downstream consumer of the stream, which lives outside
        // this store. Latency here = "time to start of stream".
        if (features.supportsStreamInput && normalizedInput.inputAudioStream) {
          const streamResult = streamExecutor({
            ...request,
            inputAudioStream: normalizedInput.inputAudioStream,
          } as Parameters<typeof streamExecutor>[0])
          emitSucceeded(0, true)
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
          emitSucceeded(0, true)
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
          emitSucceeded(0, true)
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

      const threshold = options?.confidenceThreshold ?? confidenceThreshold.value
      const useVerboseJson = !format && threshold > CONFIDENCE_THRESHOLD_DISABLED
      const response = await generateTranscription({
        ...provider.transcription(model, options?.providerOptions),
        abortSignal: options?.signal,
        file: normalizedInput.file,
        fileName: resolveTranscriptionFileName(normalizedInput.file, normalizedInput.fileName),
        responseFormat: useVerboseJson ? 'verbose_json' : format,
      })

      if (useVerboseJson) {
        if (response.segments) {
          verboseJsonNotSupported.value = false
          const filteredText = filterTranscriptionByConfidence(response.segments, threshold)
          emitSucceeded(filteredText.length, false)
          return {
            mode: 'generate',
            ...response,
            text: filteredText,
          }
        }
        else {
          verboseJsonNotSupported.value = true
          console.warn('[Hearing] Confidence filter is enabled but the provider did not return verbose_json segments. Filtering has no effect.')
        }
      }

      const fallbackText = normalizeGeneratedTranscriptionText(response)
      emitSucceeded(fallbackText.length, false)
      return {
        mode: 'generate',
        ...response,
        text: fallbackText,
      }
    }
    catch (err) {
      emitFailed(err)
      throw err
    }
  }

  /** Freezes Hearing settings for one request. The controller supplies media and owns cancellation. */
  function createTranscriber(providerId = activeTranscriptionProvider.value): StreamingTranscriber {
    const config = structuredClone(toRaw(providerStore.getProviderConfig(providerId) ?? {}))
    const model = resolveActiveTranscriptionModel(activeTranscriptionModel.value, config)
    const threshold = confidenceThreshold.value
    const providerOptions = resolveTranscriptionProviderOptions(config)
    const features = providersStore.getTranscriptionFeatures(providerId)
    const definition = providersStore.getProviderDefinition(providerId)
    // The provider decides its upload format. Every format starts from the same captured PCM stream.
    let upload: 'media-stream' | 'pcm' | 'file' = 'file'
    if (providerId === 'browser-web-speech-api')
      upload = 'media-stream'
    else if (providerId === SHERPAW_TRANSCRIPTION_PROVIDER_ID || features.supportsStreamInput)
      upload = 'pcm'
    return createHearingTranscriber(async (audio, signal) => {
      const setupError = resolveActiveTranscriptionProviderError(providerId)
      if (setupError)
        throw new Error(setupError)
      if (upload === 'media-stream') {
        // Web Speech recognizes live tracks. Stopping recognition after playback drains keeps the final result.
        // The shared context is created on first use, so stores without Web Speech never allocate audio hardware.
        const media = toMediaStream(audio, useAudioContext().audioContext, signal)
        const result = streamWebSpeechAPITranscription(media.media, { ...providerOptions, continuous: true, interimResults: true, abortSignal: signal })
        void media.done.then(() => result.recognition?.stop(), () => {})
        return { mode: 'stream', ...result }
      }
      const provider = await definition.createProvider(config)
      let disposal: Promise<void> | undefined
      const dispose = () => {
        disposal ??= Promise.resolve().then(async () => {
          signal.removeEventListener('abort', abort)
          if ('dispose' in provider && typeof provider.dispose === 'function')
            await provider.dispose()
        })
        return disposal
      }
      function abort() {
        void dispose().catch(error => console.error('Failed to dispose transcription provider', error))
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) {
        await dispose()
        signal.throwIfAborted()
      }
      if (!('transcription' in provider) || !provider.transcription) {
        await dispose()
        throw new Error('Provider does not support transcription')
      }
      const input = upload === 'pcm'
        ? { inputAudioStream: new Pcm16Encoder(audio, { sampleRate: 16000, signal }).stream }
        : new File([await encodeWav(audio, { sampleRate: 16000, channels: 1 }, signal)], 'recording.wav', { type: 'audio/wav' })
      try {
        const result = await transcription(providerId, provider, model, input, undefined, { signal, confidenceThreshold: threshold, providerOptions })
        if (result.mode === 'stream') {
          void result.text.then(dispose, dispose).catch(error => console.error('Failed to dispose transcription provider', error))
        }
        else {
          await dispose()
        }
        return result
      }
      catch (error) {
        await dispose()
        throw error
      }
    })
  }

  return {
    activeTranscriptionProvider,
    activeTranscriptionModel,
    availableProvidersMetadata,
    activeCustomModelName,
    transcriptionModelSearchQuery,
    autoSendEnabled,
    autoSendDelay,
    confidenceThreshold,
    verboseJsonNotSupported,

    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    transcription,
    createTranscriber,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})
