import type { Span } from '@opentelemetry/api'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { WithUnknown } from '@xsai/shared'
import type { StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription'
import type {} from 'pinia-plugin-synced'

import type { AIRIStreamTranscriptionResult } from '../../libs/providers/stream-transcription'
import type { StreamingTranscriptionCallbacks, StreamingTranscriptionConsumer } from './streaming-transcription-consumers'

import { errorMessageFrom, tryCatch } from '@moeru/std'
import { errorMessageFromValue, IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import vadWorkletUrl from '../../workers/vad/process.worklet?worker&url'

import { useAnalytics } from '../../composables/use-analytics'
import { activeTurnSpan, startSpan } from '../../composables/use-io-tracer'
import { createVadStreamingSession } from '../../libs/audio/vad-streaming-session'
import { OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers'
import { streamWebSpeechAPITranscription } from '../../libs/providers/providers/browser-web-speech-api'
import { OPENAI_TRANSCRIPTION_DEFAULT_MODEL } from '../../libs/providers/providers/openai-audio'
import { streamTranscription } from '../../libs/providers/stream-transcription'
import { useVAD } from '../ai/models/vad'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { StreamingTranscriptionConsumers } from './streaming-transcription-consumers'

const OPENAI_COMPATIBLE_TRANSCRIPTION_DEFAULT_MODEL = 'whisper-1'

function errorMessage(err: unknown): string {
  const msg = errorMessageFromValue(err)
  // Browsers hide the real reason (CORS, timeout, DNS, …) behind this generic string.
  if (msg === 'Failed to fetch' || msg === 'Load failed') {
    return `${msg} — check the browser console (Network tab) for the exact reason (e.g. CORS, network timeout, DNS failure).`
  }
  return msg
}

// NOTICE: Realtime transcription intentionally uses `AbortError` as a control-flow signal when the
// current stream session is being stopped on purpose.
//
// This happens in `stopStreamingTranscription()`,
// which aborts the session with one of the DOMException messages below when the user disables the mic,
// the page tears down audio interaction, callbacks are intentionally rebound, or the idle timeout closes
// an inactive stream. Those cases should not be surfaced as provider failures because the session was
// explicitly asked to stop. If a future abort is noisy or unexpected, inspect the abort source first:
// `stopStreamingTranscription()` in this file is the primary origin, and provider-specific teardown
// provider adapters in `packages/stage-ui/src/libs/providers/providers/` propagate the
// same reason through the transport. Only treat an abort as "expected" if it is one of these known
// shutdown paths; any other `AbortError` should still be investigated as a real lifecycle bug or a
// provider/runtime failure.
function isExpectedStreamStopError(err: unknown): boolean {
  return err instanceof DOMException
    && err.name === 'AbortError'
    && (err.message === 'Stopped' || err.message === 'Aborted' || err.message === 'Closed' || err.message === 'Idle timeout')
}

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
  inputAudioStream: ReadableStream<ArrayBuffer>
}

export type StreamTranscription = (options: WithUnknown<StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions>) => AIRIStreamTranscriptionResult

type GenerateTranscriptionResponse = Awaited<ReturnType<typeof generateTranscription>>
type HearingTranscriptionGenerateResult = GenerateTranscriptionResponse & { mode: 'generate' }
type HearingTranscriptionStreamResult = AIRIStreamTranscriptionResult & { mode: 'stream' }
export type HearingTranscriptionResult = HearingTranscriptionGenerateResult | HearingTranscriptionStreamResult

type HearingTranscriptionInput = File | {
  file?: File
  fileName?: string
  inputAudioStream?: ReadableStream<ArrayBuffer>
}

interface HearingTranscriptionInvokeOptions {
  providerOptions?: Record<string, unknown>
}

interface MediaStreamTranscriptionOptions extends StreamingTranscriptionConsumer {
  sampleRate?: number
  providerOptions?: Record<string, unknown>
  idleTimeoutMs?: number
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

export function supportsVerboseJsonResponse(providerId: string, model: string): boolean {
  // OpenAI's GPT transcription models only accept JSON responses. Whisper-1
  // remains the official OpenAI model that supports verbose_json segments.
  return providerId !== 'openai-audio-transcription' || model === 'whisper-1'
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
 * Resolves the model displayed by the OpenAI-compatible transcription settings page.
 * An explicitly stored empty string is user-owned state; only a missing model receives the UI default.
 */
export function resolveOpenAICompatibleTranscriptionModel(providerConfig?: Record<string, unknown>) {
  if (Object.hasOwn(providerConfig ?? {}, 'model') && typeof providerConfig?.model === 'string')
    return providerConfig.model

  return OPENAI_COMPATIBLE_TRANSCRIPTION_DEFAULT_MODEL
}

/**
 * Resolves the model displayed by the OpenAI transcription settings page.
 * An own string model, including an explicitly stored empty string, is user-owned state.
 * Missing or non-string models receive the OpenAI default.
 */
export function resolveOpenAITranscriptionModel(providerConfig?: Record<string, unknown>) {
  if (Object.hasOwn(providerConfig ?? {}, 'model') && typeof providerConfig?.model === 'string')
    return providerConfig.model

  return OPENAI_TRANSCRIPTION_DEFAULT_MODEL
}

/**
 * Returns whether a provider explicitly owns a blank transcription model.
 *
 * Missing or non-string model fields are not explicit clearance. A provider
 * owns the cleared state only when its own string model value trims to empty.
 */
export function hasExplicitlyClearedTranscriptionModel(providerConfig?: Record<string, unknown>) {
  return Object.hasOwn(providerConfig ?? {}, 'model')
    && typeof providerConfig?.model === 'string'
    && providerConfig.model.trim() === ''
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

  const activeFunASRConfiguredModel = computed(() => {
    if (activeTranscriptionProvider.value !== 'funasr-audio-transcription')
      return ''

    const model = providerStore.getProviderConfig('funasr-audio-transcription')?.model
    return typeof model === 'string' ? model : 'sensevoice'
  })

  // This watcher state belongs to one destination-model request. A newer load for the same
  // provider replaces the request id, so an older response cannot update the active model.
  let nextDestinationModelRequestId = 0
  let pendingDestinationModelRequest: { providerId: string, requestId?: number } | undefined
  let initialized = false

  function applyActiveTranscriptionModel(providerId: string, model: string) {
    activeTranscriptionModel.value = model
    const providerConfig = providerStore.getProviderConfig(providerId)
    const ownsStoredModel = Object.hasOwn(providerConfig ?? {}, 'model') && typeof providerConfig?.model === 'string'
    if (!providerConfig || (providerId !== 'openai-compatible-audio-transcription' && !ownsStoredModel))
      return

    if (providerConfig.model !== model)
      providerConfig.model = model
  }

  function syncDestinationModel(providerId: string, freshlyListedModels: readonly { id: string }[] = []) {
    if (activeTranscriptionProvider.value !== providerId)
      return false

    const providerConfig = providerStore.getProviderConfig(providerId)
    const configuredModel = providerConfig?.model
    const ownsModel = Object.hasOwn(providerConfig ?? {}, 'model') && typeof configuredModel === 'string'
    if (ownsModel) {
      applyActiveTranscriptionModel(providerId, configuredModel.trim())
      return true
    }

    const defaultOptions = providersStore.getDefaultProviderConfig(providerId)
    const defaultModelValue = (defaultOptions as Record<string, unknown>).model
    const defaultModel = typeof defaultModelValue === 'string' ? defaultModelValue.trim() : ''
    // A list-backed fallback must come from the current refresh. The runtime cache may still belong
    // to credentials or an endpoint that the user has just replaced.
    const listedModel = freshlyListedModels[0]?.id ?? ''
    const model = defaultModel || listedModel
    if (!model)
      return false

    applyActiveTranscriptionModel(providerId, model)
    if (providerConfig && providerConfig.model !== model)
      providerConfig.model = model
    return true
  }

  async function setActiveTranscriptionProvider(providerId: string, requestedModel?: string) {
    const previousProviderId = activeTranscriptionProvider.value
    activeTranscriptionProvider.value = providerId
    verboseJsonNotSupported.value = false
    pendingDestinationModelRequest = undefined
    if (requestedModel !== undefined) {
      applyActiveTranscriptionModel(providerId, requestedModel)
      return
    }

    if (providerId === 'funasr-audio-transcription') {
      applyActiveTranscriptionModel(providerId, activeFunASRConfiguredModel.value)
      await loadModelsForProvider(providerId)
    }
    else if (providerId) {
      if (previousProviderId !== providerId)
        activeTranscriptionModel.value = ''
      pendingDestinationModelRequest = { providerId }
      if (syncDestinationModel(providerId))
        pendingDestinationModelRequest = undefined
      await loadModelsForProvider(providerId)
    }
  }

  async function setActiveTranscriptionModel(model: string) {
    applyActiveTranscriptionModel(activeTranscriptionProvider.value, model)
  }

  async function setTranscriptionModelForProvider(providerId: string, model: string) {
    const providerConfig = providerStore.getProviderConfig(providerId)
    if (providerConfig && providerConfig.model !== model)
      providerConfig.model = model

    if (activeTranscriptionProvider.value === providerId && activeTranscriptionModel.value !== model)
      activeTranscriptionModel.value = model
  }

  async function setActiveCustomTranscriptionModel(model: string) {
    activeCustomModelName.value = model
    applyActiveTranscriptionModel(activeTranscriptionProvider.value, model)
  }

  async function reloadActiveTranscriptionProvider() {
    const providerId = activeTranscriptionProvider.value
    if (!providerId)
      return

    await providersStore.initializeProvider(providerId)
    await setActiveTranscriptionProvider(providerId)
  }

  async function initialize() {
    // This synchronized action runs once in the elected leader. Store creation
    // must not reconcile persisted state independently in every window.
    if (initialized)
      return

    initialized = true
    const providerId = activeTranscriptionProvider.value
    if (!providerId)
      return

    if (providerId === 'funasr-audio-transcription') {
      applyActiveTranscriptionModel(providerId, activeFunASRConfiguredModel.value)
      await loadModelsForProvider(providerId)
      return
    }

    const providerConfig = providerStore.getProviderConfig(providerId)
    const configuredModel = providerConfig?.model
    const ownsConfiguredModel = Object.hasOwn(providerConfig ?? {}, 'model') && typeof configuredModel === 'string'
    if (ownsConfiguredModel) {
      activeTranscriptionModel.value = configuredModel.trim()
      return
    }

    if (activeTranscriptionModel.value.trim())
      return

    pendingDestinationModelRequest = { providerId }
    if (syncDestinationModel(providerId))
      pendingDestinationModelRequest = undefined
  }

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
    const destinationRequest = pendingDestinationModelRequest?.providerId === provider
      ? { providerId: provider, requestId: ++nextDestinationModelRequestId }
      : undefined
    if (destinationRequest)
      pendingDestinationModelRequest = destinationRequest

    let freshlyListedModels: readonly { id: string }[] = []
    if (providersStore.supportsModelListing(provider)) {
      freshlyListedModels = await providersStore.fetchModelsForProvider(provider)
    }

    if (destinationRequest
      && pendingDestinationModelRequest?.providerId === destinationRequest.providerId
      && pendingDestinationModelRequest.requestId === destinationRequest.requestId
      && syncDestinationModel(provider, freshlyListedModels)) {
      pendingDestinationModelRequest = undefined
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
    if (activeTranscriptionProvider.value === 'openai-compatible-audio-transcription'
      || activeTranscriptionProvider.value === 'funasr-audio-transcription') {
      const providerConfig = providerStore.getProviderConfig(activeTranscriptionProvider.value)
      hasProviderModel = !!providerConfig?.model
    }

    return !!activeTranscriptionModel.value || hasProviderModel
  })

  async function resetState() {
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
    provider: TranscriptionProviderWithExtraOptions<string, any>,
    model: string,
    input: HearingTranscriptionInput,
    format?: 'json' | 'verbose_json',
    options?: HearingTranscriptionInvokeOptions,
  ): Promise<HearingTranscriptionResult> {
    const normalizedInput = (input instanceof File ? { file: input } : input ?? {}) as {
      file?: File
      fileName?: string
      inputAudioStream?: ReadableStream<ArrayBuffer>
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
        // TODO: integrate VAD-driven silence detection to stop and restart realtime sessions based on silence thresholds.
        const request = provider.transcription(model, options?.providerOptions)

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

      const confidenceFilteringRequested = !format && confidenceThreshold.value > CONFIDENCE_THRESHOLD_DISABLED
      const useVerboseJson = confidenceFilteringRequested && supportsVerboseJsonResponse(providerId, model)
      if (confidenceFilteringRequested && !useVerboseJson) {
        verboseJsonNotSupported.value = true
        console.warn('[Hearing] Confidence filter is enabled but the selected model does not support verbose_json. Filtering has no effect.')
      }
      const response = await generateTranscription({
        ...provider.transcription(model, options?.providerOptions),
        file: normalizedInput.file,
        fileName: resolveTranscriptionFileName(normalizedInput.file, normalizedInput.fileName),
        responseFormat: useVerboseJson ? 'verbose_json' : format,
      })

      if (useVerboseJson) {
        if (response.segments) {
          verboseJsonNotSupported.value = false
          const filteredText = filterTranscriptionByConfidence(response.segments, confidenceThreshold.value)
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
    initialize,
    reloadActiveTranscriptionProvider,
    setActiveCustomTranscriptionModel,
    setActiveTranscriptionProvider,
    setActiveTranscriptionModel,
    setTranscriptionModelForProvider,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
}, {
  synced: {
    actions: [
      'initialize',
      'loadModelsForProvider',
      'reloadActiveTranscriptionProvider',
      'resetState',
      'setActiveCustomTranscriptionModel',
      'setActiveTranscriptionModel',
      'setActiveTranscriptionProvider',
      'setTranscriptionModelForProvider',
    ],
    state: true,
  },
})

export const useHearingSpeechInputPipeline = defineStore('modules:hearing:speech:audio-input-pipeline', () => {
  const error = ref<string>()

  const hearingStore = useHearingStore()
  const { activeTranscriptionProvider, activeTranscriptionModel } = storeToRefs(hearingStore)
  const providersStore = useProviderStore()
  const providerStore = useProviderConfigStore()
  const streamingConsumers = new StreamingTranscriptionConsumers()
  const streamingCallbacks = {
    onSentenceEnd: (delta: string) => streamingConsumers.emitSentenceEnd(delta),
    onSpeechEnd: (text: string) => streamingConsumers.emitSpeechEnd(text),
    onTranscriptionUpdate: (text: string) => streamingConsumers.emitTranscriptionUpdate(text),
  }
  const {
    trackVoiceInputCancelled,
    trackVoiceInputStarted,
  } = useAnalytics()
  const streamingSession = shallowRef<{
    audioContext?: AudioContext
    workletNode?: AudioWorkletNode
    mediaStreamSource?: MediaStreamAudioSourceNode
    audioStreamController?: ReadableStreamDefaultController<ArrayBuffer>
    abortController: AbortController
    result?: HearingTranscriptionResult & { recognition?: any }
    idleTimer?: ReturnType<typeof setTimeout>
    providerId?: string
    callbacks?: StreamingTranscriptionCallbacks
  }>()
  const streamingVadSession = shallowRef<{
    vad: Pick<ReturnType<typeof useVAD>, 'dispose'>
    lifecycle: ReturnType<typeof createVadStreamingSession>
    providerId: string
    callbacks: StreamingTranscriptionCallbacks
    activeSegment?: {
      audioChunks: ArrayBuffer[]
      audioStreamController?: ReadableStreamDefaultController<ArrayBuffer>
    }
  }>()

  let asrSpan: Span | undefined

  /** Removes callbacks owned by one streaming transcription consumer. */
  function removeStreamingTranscriptionConsumer(consumerId: string) {
    streamingConsumers.remove(consumerId)
  }

  function startStreamingAsrSpan(providerId: string) {
    activeTurnSpan.value?.end()
    const turnSpan = startSpan(IOSpanNames.InteractionTurn)
    activeTurnSpan.value = turnSpan
    asrSpan = startSpan(IOSpanNames.SpeechRecognition, turnSpan, {
      [IOAttributes.Subsystem]: IOSubsystems.ASR,
      [IOAttributes.GenAIRequestModel]: providerId,
    })
  }

  function endStreamingAsrSpan() {
    if (!asrSpan)
      return

    asrSpan.end()
    asrSpan = undefined
  }

  const supportsStreamInput = computed(() => {
    const providerId = activeTranscriptionProvider.value
    if (!providerId)
      return false

    // Web Speech API always supports stream input when available
    if (providerId === 'browser-web-speech-api') {
      return typeof window !== 'undefined'
        && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    }

    return providersStore.getTranscriptionFeatures(providerId).supportsStreamInput
  })

  const DEFAULT_STREAM_IDLE_TIMEOUT = 15000

  async function stopRealtimeTranscription(abort?: boolean, disposeProviderId?: string) {
    const session = streamingSession.value
    if (!session)
      return

    if (asrSpan) {
      asrSpan.setAttribute(IOAttributes.ASRAbort, !!abort)
      asrSpan.end()
      asrSpan = undefined
    }

    // Special handling for Web Speech API
    if (session.providerId === 'browser-web-speech-api') {
      try {
        const reason = new DOMException(abort ? 'Aborted' : 'Stopped', 'AbortError')
        if (!session.abortController.signal.aborted) {
          session.abortController.abort(reason)
        }

        // Stop Web Speech API recognition if it exists
        const result = session.result as any
        if (result?.recognition) {
          try {
            result.recognition.stop()
          }
          catch (err) {
            console.warn('Error stopping Web Speech API recognition:', err)
          }
        }
      }
      catch (err) {
        console.error('Error stopping Web Speech API session:', err)
      }

      if (session.idleTimer)
        clearTimeout(session.idleTimer)

      streamingSession.value = undefined

      if (session.result?.mode === 'stream') {
        try {
          const text = await session.result.text
          return text
        }
        catch (err) {
          if (isExpectedStreamStopError(err))
            return

          error.value = errorMessage(err)
          console.error('Error getting transcription result:', error.value)
        }
      }

      return
    }

    try {
      const reason = new DOMException(abort ? 'Aborted' : 'Stopped', 'AbortError')
      // Ensure provider transports (e.g., Aliyun NLS) are signaled to stop over websocket.
      if (!session.abortController.signal.aborted) {
        session.abortController.abort(reason)
      }

      if (abort)
        session.audioStreamController?.error(reason)
      else
        session.audioStreamController?.close()
    }
    catch {}

    if (session.mediaStreamSource && session.workletNode && session.audioContext) {
      await tryCatch(() => {
        session.mediaStreamSource?.disconnect()
        session.workletNode!.port.onmessage = null
        session.workletNode?.disconnect()
      })
      await tryCatch(() => session.audioContext?.close())
    }

    if (session.idleTimer)
      clearTimeout(session.idleTimer)

    streamingSession.value = undefined

    if (session.result?.mode === 'stream') {
      try {
        const text = await session.result.text

        if (disposeProviderId) {
          await providersStore.disposeProviderInstance(disposeProviderId)
        }

        return text
      }
      catch (err) {
        if (isExpectedStreamStopError(err))
          return

        error.value = errorMessage(err)
        console.error('Error generating transcription:', error.value)
      }
    }

    const text = session.result?.text
    if (disposeProviderId)
      await providersStore.disposeProviderInstance(disposeProviderId)

    return text
  }

  /** Finishes one VAD segment without aborting the Provider's final response. */
  async function finishRealtimeTranscription() {
    const session = streamingSession.value
    if (!session)
      return

    try {
      session.audioStreamController?.close()
    }
    catch {}

    if (session.result?.mode !== 'stream') {
      streamingSession.value = undefined
      return session.result?.text
    }

    try {
      return await session.result.text
    }
    catch (err) {
      if (!isExpectedStreamStopError(err)) {
        error.value = errorMessage(err)
        console.error('Error finishing transcription:', error.value)
      }
    }
    finally {
      if (streamingSession.value === session)
        streamingSession.value = undefined
    }
  }

  /** Stops the active VAD detector and any realtime transcription session. */
  async function stopStreamingTranscription(abort?: boolean, disposeProviderId?: string) {
    const vadSession = streamingVadSession.value
    if (vadSession) {
      streamingVadSession.value = undefined
      vadSession.vad.dispose()
      await vadSession.lifecycle.dispose()
    }

    return await stopRealtimeTranscription(abort, disposeProviderId)
  }

  function float32ToInt16(buffer: Float32Array) {
    const output = new Int16Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      const value = Math.max(-1, Math.min(1, buffer[i]))
      output[i] = value < 0 ? value * 0x8000 : value * 0x7FFF
    }

    return output
  }

  function enqueueVadAudio(segment: NonNullable<typeof streamingVadSession.value>['activeSegment'], buffer: Float32Array) {
    if (!segment)
      return

    const pcm16 = float32ToInt16(buffer)
    const chunk = pcm16.buffer.slice(0)
    if (segment.audioStreamController) {
      segment.audioStreamController.enqueue(chunk)
      return
    }

    segment.audioChunks.push(chunk)
  }

  function createVadAudioStream(segment: NonNullable<typeof streamingVadSession.value>['activeSegment']) {
    if (!segment)
      throw new Error('VAD did not create an active speech segment.')

    return new ReadableStream<ArrayBuffer>({
      start(controller) {
        segment.audioStreamController = controller
        for (const chunk of segment.audioChunks)
          controller.enqueue(chunk)
        segment.audioChunks.length = 0
      },
      cancel() {
        segment.audioStreamController = undefined
        segment.audioChunks.length = 0
      },
    })
  }

  function consumeRealtimeTranscriptionResult(
    session: NonNullable<typeof streamingSession.value>,
    result: HearingTranscriptionResult,
  ) {
    if (result.mode !== 'stream' || !result.fullStream)
      return

    const sessionSpan = asrSpan
    const sessionCallbacks = session.callbacks
    void (async () => {
      let fullText = ''
      let latestSnapshotIsFinal = false
      try {
        const reader = result.fullStream.getReader()

        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          if (value.type === 'transcript.text.snapshot') {
            latestSnapshotIsFinal = value.isFinal
            fullText = value.text
            sessionCallbacks?.onTranscriptionUpdate?.(fullText)
            continue
          }
          if (value.type !== 'transcript.text.delta' || !value.delta)
            continue

          fullText += value.delta
          sessionCallbacks?.onTranscriptionUpdate?.(fullText)
          sessionSpan?.addEvent(IOEvents.ASRSentenceEnd, { [IOAttributes.ASRText]: value.delta })
          sessionCallbacks?.onSentenceEnd?.(value.delta)
        }
      }
      catch (err) {
        if (!isExpectedStreamStopError(err))
          console.error('Error reading text stream:', err)
      }
      finally {
        if (latestSnapshotIsFinal && fullText.trim()) {
          sessionSpan?.addEvent(IOEvents.ASRSentenceEnd, { [IOAttributes.ASRText]: fullText })
          sessionCallbacks?.onSentenceEnd?.(fullText)
        }
        sessionSpan?.setAttribute(IOAttributes.ASRText, fullText)
        sessionSpan?.end()
        if (asrSpan === sessionSpan)
          asrSpan = undefined
        sessionCallbacks?.onSpeechEnd?.(fullText)
      }
    })()
  }

  async function startVadRealtimeTranscription(
    providerId: string,
    options: MediaStreamTranscriptionOptions,
    vadSession: NonNullable<typeof streamingVadSession.value>,
  ) {
    const segment = vadSession.activeSegment
    if (!segment)
      return

    const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
    if (!provider)
      throw new Error('Failed to initialize speech provider')

    const abortController = new AbortController()
    const session: NonNullable<typeof streamingSession.value> = {
      audioStreamController: undefined as ReadableStreamDefaultController<ArrayBuffer> | undefined,
      abortController,
      providerId,
      callbacks: vadSession.callbacks,
    }
    const audioStream = createVadAudioStream(segment)
    session.audioStreamController = segment.audioStreamController
    streamingSession.value = session
    startStreamingAsrSpan(providerId)

    const result = await hearingStore.transcription(
      providerId,
      provider,
      activeTranscriptionModel.value,
      { inputAudioStream: audioStream },
      undefined,
      {
        providerOptions: {
          abortSignal: abortController.signal,
          ...options.providerOptions,
        },
      },
    )

    if (streamingSession.value !== session)
      return

    session.result = result
    consumeRealtimeTranscriptionResult(session, result)
  }

  async function startVadStreamingTranscription(
    stream: MediaStream,
    providerId: string,
    options: MediaStreamTranscriptionOptions,
  ) {
    let vadSession!: NonNullable<typeof streamingVadSession.value>
    const vad = useVAD(vadWorkletUrl, {
      onSpeechStart: () => {
        vadSession.activeSegment = { audioChunks: [] }
        vadSession.lifecycle.onSpeechStart()
      },
      onSpeechAudio: ({ buffer }) => {
        enqueueVadAudio(vadSession.activeSegment, buffer)
      },
      onSpeechEnd: () => {
        vadSession.lifecycle.onSpeechEnd()
      },
      onSpeechCancel: () => {
        vadSession.lifecycle.onSpeechEnd()
      },
    })
    const lifecycle = createVadStreamingSession({
      start: async () => await startVadRealtimeTranscription(providerId, options, vadSession),
      stop: async () => {
        await finishRealtimeTranscription()
      },
      onError: (err) => {
        error.value = errorMessage(err)
        console.error('Error managing VAD streaming transcription:', error.value)
      },
    })
    vadSession = {
      vad,
      lifecycle,
      providerId,
      callbacks: streamingCallbacks,
    }
    streamingVadSession.value = vadSession

    await vad.init()
    if (!vad.loaded.value) {
      throw new Error(vad.inferenceError.value || 'Failed to initialize voice activity detection.')
    }

    await vad.start(stream)
  }

  async function transcribeForMediaStream(stream: MediaStream, options: MediaStreamTranscriptionOptions) {
    console.info('[Hearing Pipeline] transcribeForMediaStream called', {
      supportsStreamInput: supportsStreamInput.value,
      hasStream: !!stream,
      providerId: activeTranscriptionProvider.value,
      hasCallbacks: !!(options.onSentenceEnd || options.onSpeechEnd || options.onTranscriptionUpdate),
    })

    if (!supportsStreamInput.value) {
      console.warn('[Hearing Pipeline] Stream input not supported')
      return
    }

    error.value = undefined
    let consumerRegistered = false

    try {
      const providerId = activeTranscriptionProvider.value
      const providerError = resolveActiveTranscriptionProviderError(providerId)
      if (providerError) {
        error.value = providerError
        console.error('[Hearing Pipeline]', providerError)
        return
      }

      console.info('[Hearing Pipeline] Using provider:', providerId)

      // Special handling for Web Speech API - it works directly with MediaStream
      if (providerId === 'browser-web-speech-api') {
        trackVoiceInputStarted({ stt_provider_id: providerId })

        // Check if Web Speech API is available
        const isAvailable = typeof window !== 'undefined'
          && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

        if (!isAvailable) {
          error.value = 'Web Speech API is not available in this browser'
          console.error('Web Speech API is not available')
          return
        }

        streamingConsumers.register(options)
        consumerRegistered = true

        // Check if session already exists and reuse it
        const existingSession = streamingSession.value
        if (existingSession && existingSession.providerId === 'browser-web-speech-api') {
          const idleTimeout = options.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT
          if (existingSession.idleTimer) {
            clearTimeout(existingSession.idleTimer)
            existingSession.idleTimer = setTimeout(async () => {
              await stopStreamingTranscription(false, existingSession.providerId)
            }, idleTimeout)
          }

          console.info('Web Speech API session already active, reusing it with updated consumers')
          return
        }

        startStreamingAsrSpan(providerId)

        // Auto-select default model if not selected
        if (!activeTranscriptionModel.value) {
          // Try to get models for the provider and select the first one
          const models = await providersStore.getModelsForProvider(providerId)
          if (models.length > 0) {
            await hearingStore.setActiveTranscriptionModel(models[0].id)
            console.info('Auto-selected Web Speech API model:', models[0].id)
          }
          else {
            // Fallback to default model ID
            await hearingStore.setActiveTranscriptionModel('web-speech-api')
            console.info('Auto-selected Web Speech API default model')
          }
        }

        const abortController = new AbortController()

        // Get provider config for language settings
        const providerConfig = providerStore.getProviderConfig(providerId) || {}
        const language = (options?.providerOptions?.language as string)
          || (providerConfig.language as string)
          || 'en-US'

        // Web Speech API in continuous mode should run indefinitely - no idle timeout
        // Only stop when explicitly requested (e.g., microphone disabled)
        const idleTimeout = options?.idleTimeoutMs ?? 0 // 0 = disabled
        let idleTimer: ReturnType<typeof setTimeout> | undefined
        const bumpIdle = () => {
          if (idleTimeout > 0) {
            if (idleTimer)
              clearTimeout(idleTimer)
            idleTimer = setTimeout(async () => {
              await stopStreamingTranscription(false, providerId)
            }, idleTimeout)
          }
        }

        const result = streamWebSpeechAPITranscription(stream, {
          language,
          continuous: (options?.providerOptions?.continuous as boolean) ?? (providerConfig.continuous as boolean) ?? true,
          interimResults: (options?.providerOptions?.interimResults as boolean) ?? (providerConfig.interimResults as boolean) ?? true,
          maxAlternatives: (options?.providerOptions?.maxAlternatives as number) ?? (providerConfig.maxAlternatives as number) ?? 1,
          abortSignal: abortController.signal,
          onSentenceEnd: (delta) => {
            bumpIdle() // Bump idle timer on activity (only if enabled)
            if (asrSpan)
              asrSpan.addEvent(IOEvents.ASRSentenceEnd, { [IOAttributes.ASRText]: delta })
            // Call the options callback
            streamingCallbacks.onSentenceEnd(delta)
          },
          onSpeechEnd: (text) => {
            if (asrSpan) {
              asrSpan.setAttribute(IOAttributes.ASRText, text)
              asrSpan.end()
              asrSpan = undefined
            }
            // Call the options callback
            streamingCallbacks.onSpeechEnd(text)
          },
        })

        // Store session info for cleanup
        const recognitionInstance = (result as any).recognition
        streamingSession.value = {
          audioContext: {} as AudioContext, // Not used for Web Speech API
          workletNode: {} as AudioWorkletNode, // Not used for Web Speech API
          mediaStreamSource: {} as MediaStreamAudioSourceNode, // Not used for Web Speech API
          audioStreamController: undefined,
          abortController,
          result: { ...result, mode: 'stream' as const, recognition: recognitionInstance },
          idleTimer,
          providerId,
          callbacks: streamingCallbacks,
        } as any // Type assertion needed because recognition is extra

        // Initial idle timer (only if enabled)
        bumpIdle()

        // Stream out text deltas
        if (result.textStream) {
          void (async () => {
            try {
              const reader = result.textStream.getReader()

              while (true) {
                const { done } = await reader.read()
                if (done)
                  break
                // onSentenceEnd is already called from the recognition.onresult handler
                // Note: onSpeechEnd is called from web-speech-api/index.ts recognition.onend handler
                // (line 332 for non-continuous mode, line 271 for errors)
                // We don't call it here to avoid duplicate calls
              }
            }
            catch (err) {
              if (!isExpectedStreamStopError(err))
                console.error('Error reading text stream:', err)
            }
          })()
        }

        return
      }

      streamingConsumers.register(options)
      consumerRegistered = true

      const existingVadSession = streamingVadSession.value
      if (existingVadSession) {
        if (existingVadSession.providerId !== providerId) {
          console.info('[Hearing Pipeline] Provider changed, restarting VAD detection')
          await stopStreamingTranscription(false, existingVadSession.providerId)
        }
        else {
          console.info('[Hearing Pipeline] VAD detection already active, reusing it with updated consumers')
          return
        }
      }

      await startVadStreamingTranscription(stream, providerId, options)
    }
    catch (err) {
      if (consumerRegistered)
        streamingConsumers.remove(options.consumerId)

      endStreamingAsrSpan()

      if (isExpectedStreamStopError(err))
        return

      error.value = errorMessage(err)
      console.error('Error generating transcription:', error.value)
    }
  }

  async function transcribeForRecording(recording: Blob | null | undefined) {
    error.value = undefined

    if (!recording) {
      error.value = 'No recording captured from microphone'
      trackVoiceInputCancelled({ stt_provider_id: activeTranscriptionProvider.value || 'unknown' })
      return
    }

    if (recording.size <= 0) {
      error.value = 'Recording captured from microphone is empty'
      return
    }

    try {
      const providerId = activeTranscriptionProvider.value
      const providerError = resolveActiveTranscriptionProviderError(providerId)
      if (providerError) {
        error.value = providerError
        console.error('[Hearing Pipeline]', providerError)
        return
      }

      const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
      if (!provider) {
        throw new Error('Failed to initialize speech provider')
      }

      const providerConfig = providerStore.getProviderConfig(providerId)
      const model = resolveActiveTranscriptionModel(activeTranscriptionModel.value, providerConfig)
      const providerOptions = resolveTranscriptionProviderOptions(providerConfig)
      console.info('[Hearing Pipeline] Transcribing recording', {
        providerId,
        language: providerOptions.language,
        model,
        recordingSize: recording.size,
        recordingType: recording.type,
      })
      const result = await hearingStore.transcription(
        providerId,
        provider,
        model,
        new File([recording], 'recording.wav', { type: recording.type || 'audio/wav' }),
        undefined,
        { providerOptions },
      )
      const text = result.mode === 'stream' ? await result.text : result.text
      if (!text || !text.trim()) {
        const responseSummary = result.mode === 'generate'
          ? describeEmptyTranscriptionResponse(result)
          : 'stream result returned empty text'
        error.value = `No transcription result returned from provider (${responseSummary})`
        return
      }

      return text
    }
    catch (err) {
      error.value = errorMessage(err)
      console.error('Error generating transcription:', error.value)
    }
  }

  return {
    error,

    transcribeForRecording,
    transcribeForMediaStream,
    removeStreamingTranscriptionConsumer,
    stopStreamingTranscription,
    supportsStreamInput,
  }
})
