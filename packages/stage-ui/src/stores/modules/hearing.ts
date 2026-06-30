import type { Span } from '@opentelemetry/api'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { WithUnknown } from '@xsai/shared'
import type { StreamTranscriptionResult, StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription'

import { errorMessageFrom, tryCatch } from '@moeru/std'
import { errorMessageFromValue, IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import vadWorkletUrl from '../../workers/vad/process.worklet?worker&url'

import { useAnalytics } from '../../composables/use-analytics'
import { activeTurnSpan, startSpan } from '../../composables/use-io-tracer'
import { OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers'
import { useProvidersStore } from '../providers'
import { streamAliyunTranscription } from '../providers/aliyun/stream-transcription'
import { streamWebSpeechAPITranscription } from '../providers/web-speech-api'

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
// bridges such as `packages/stage-ui/src/stores/providers/aliyun/stream-transcription.ts` propagate the
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

function haveStreamingCallbacksChanged(
  previous: { onSentenceEnd?: (delta: string) => void, onSpeechEnd?: (text: string) => void } | undefined,
  next: { onSentenceEnd?: (delta: string) => void, onSpeechEnd?: (text: string) => void },
): boolean {
  return (next.onSentenceEnd !== undefined && next.onSentenceEnd !== previous?.onSentenceEnd)
    || (next.onSpeechEnd !== undefined && next.onSpeechEnd !== previous?.onSpeechEnd)
}

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
  fileName?: string
  inputAudioStream?: ReadableStream<ArrayBuffer>
}

interface HearingTranscriptionInvokeOptions {
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
  'aliyun-nls-transcription': streamAliyunTranscription,
  [OFFICIAL_TRANSCRIPTION_PROVIDER_ID]: streamAliyunTranscription,
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
  const providersStore = useProvidersStore()
  const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)
  const {
    trackAudioDeviceUnavailable,
    trackMicrophonePermissionDenied,
    trackSttFailed,
    trackSttStarted,
    trackSttSucceeded,
    trackVoiceInputStarted,
  } = useAnalytics()

  // State
  const activeTranscriptionProvider = useLocalStorageManualReset('settings/hearing/active-provider', '')
  const activeTranscriptionModel = useLocalStorageManualReset('settings/hearing/active-model', '')
  const activeCustomModelName = useLocalStorageManualReset('settings/hearing/active-custom-model', '')
  const transcriptionModelSearchQuery = refManualReset<string>('')
  const autoSendEnabled = useLocalStorageManualReset<boolean>('settings/hearing/auto-send-enabled', false)
  const autoSendDelay = useLocalStorageManualReset<number>('settings/hearing/auto-send-delay', 2000) // Default 2 seconds
  const confidenceThreshold = useLocalStorageManualReset<number>('settings/hearing/confidence-threshold', CONFIDENCE_THRESHOLD_DISABLED)
  const verboseJsonNotSupported = ref(false)

  watch(activeTranscriptionProvider, () => {
    verboseJsonNotSupported.value = false
  })

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
      const providerConfig = providersStore.getProviderConfig(activeTranscriptionProvider.value)
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
    trackSttStarted(providerId)

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
      if (errorCode === 'device_unavailable') {
        trackAudioDeviceUnavailable({
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

      const useVerboseJson = !format && confidenceThreshold.value > CONFIDENCE_THRESHOLD_DISABLED
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
  const {
    trackAudioDeviceUnavailable,
    trackVoiceInputCancelled,
    trackVoiceInputStarted,
  } = useAnalytics()
  const streamingSession = shallowRef<{
    audioContext: AudioContext | Record<string, never>
    workletNode: AudioWorkletNode | Record<string, never>
    mediaStreamSource: MediaStreamAudioSourceNode | Record<string, never>
    audioStreamController?: ReadableStreamDefaultController<ArrayBuffer>
    abortController: AbortController
    result?: HearingTranscriptionResult & { recognition?: any }
    idleTimer?: ReturnType<typeof setTimeout>
    providerId?: string
    callbacks?: {
      onSentenceEnd?: (delta: string) => void
      onSpeechEnd?: (text: string) => void
    }
  }>()

  let asrSpan: Span | undefined

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

  const DEFAULT_SAMPLE_RATE = 16000
  const DEFAULT_STREAM_IDLE_TIMEOUT = 15000

  function float32ToInt16(buffer: Float32Array) {
    const output = new Int16Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      const value = Math.max(-1, Math.min(1, buffer[i]))
      output[i] = value < 0 ? value * 0x8000 : value * 0x7FFF
    }

    return output
  }

  async function createAudioStreamFromMediaStream(stream: MediaStream, sampleRate = DEFAULT_SAMPLE_RATE, onActivity?: () => void) {
    const audioContext = new AudioContext({ sampleRate, latencyHint: 'interactive' })
    await audioContext.audioWorklet.addModule(vadWorkletUrl)
    const workletNode = new AudioWorkletNode(audioContext, 'vad-audio-worklet-processor')

    let audioStreamController: ReadableStreamDefaultController<ArrayBuffer> | undefined
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        audioStreamController = controller
      },
      cancel: () => {
        audioStreamController = undefined
      },
    })

    workletNode.port.onmessage = ({ data }: MessageEvent<{ buffer?: Float32Array }>) => {
      const buffer = data?.buffer
      if (!buffer || !audioStreamController)
        return

      const pcm16 = float32ToInt16(buffer)
      // Clone buffer to avoid retaining underlying ArrayBuffer references
      audioStreamController.enqueue(pcm16.buffer.slice(0))
      onActivity?.()
    }

    const mediaStreamSource = audioContext.createMediaStreamSource(stream)
    mediaStreamSource.connect(workletNode)

    // Sink to avoid feedback/echo
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0
    workletNode.connect(silentGain)
    silentGain.connect(audioContext.destination)

    return {
      audioContext,
      workletNode,
      mediaStreamSource,
      audioStream,
      get controller() {
        return audioStreamController
      },
    }
  }

  async function stopStreamingTranscription(abort?: boolean, disposeProviderId?: string) {
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

    await tryCatch(() => {
      session.mediaStreamSource.disconnect()
      session.workletNode.port.onmessage = null
      session.workletNode.disconnect()
    })
    await tryCatch(() => session.audioContext.close())

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

  async function transcribeForMediaStream(stream: MediaStream, options?: {
    sampleRate?: number
    providerOptions?: Record<string, unknown>
    idleTimeoutMs?: number
    onSentenceEnd?: (delta: string) => void
    onSpeechEnd?: (text: string) => void
  }) {
    console.info('[Hearing Pipeline] transcribeForMediaStream called', {
      supportsStreamInput: supportsStreamInput.value,
      hasStream: !!stream,
      providerId: activeTranscriptionProvider.value,
      hasCallbacks: !!(options?.onSentenceEnd || options?.onSpeechEnd),
    })

    if (!supportsStreamInput.value) {
      console.warn('[Hearing Pipeline] Stream input not supported')
      return
    }

    error.value = undefined

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

        // Check if session already exists and reuse it
        const existingSession = streamingSession.value
        if (existingSession && existingSession.providerId === 'browser-web-speech-api') {
          const nextCallbacks = {
            onSentenceEnd: options?.onSentenceEnd,
            onSpeechEnd: options?.onSpeechEnd,
          }
          // For Web Speech API, if callbacks are provided and different, we need to restart
          // because recognition instance callbacks are set once and can't be changed
          const hasNewCallbacks = haveStreamingCallbacksChanged(existingSession.callbacks, nextCallbacks)

          if (hasNewCallbacks) {
            console.info('Web Speech API: New callbacks provided, restarting session to use them')
            await stopStreamingTranscription(false, existingSession.providerId)
            // Continue to create new session below
            // Note: stopStreamingTranscription already clears streamingSession.value and waits for async cleanup
          }
          else {
            // No new callbacks - just bump idle timer and reuse existing session
            const idleTimeout = options?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT
            if (existingSession.idleTimer) {
              clearTimeout(existingSession.idleTimer)
              existingSession.idleTimer = setTimeout(async () => {
                await stopStreamingTranscription(false, existingSession.providerId)
              }, idleTimeout)
            }

            console.info('Web Speech API session already active, reusing existing session (no callback changes)')
            return
          }
        }

        startStreamingAsrSpan(providerId)

        // Auto-select default model if not selected
        if (!activeTranscriptionModel.value) {
          // Try to get models for the provider and select the first one
          const models = await providersStore.getModelsForProvider(providerId)
          if (models.length > 0) {
            activeTranscriptionModel.value = models[0].id
            console.info('Auto-selected Web Speech API model:', models[0].id)
          }
          else {
            // Fallback to default model ID
            activeTranscriptionModel.value = 'web-speech-api'
            console.info('Auto-selected Web Speech API default model')
          }
        }

        const abortController = new AbortController()

        // Get provider config for language settings
        const providerConfig = providersStore.getProviderConfig(providerId) || {}
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
            options?.onSentenceEnd?.(delta)
          },
          onSpeechEnd: (text) => {
            if (asrSpan) {
              asrSpan.setAttribute(IOAttributes.ASRText, text)
              asrSpan.end()
              asrSpan = undefined
            }
            // Call the options callback
            options?.onSpeechEnd?.(text)
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
          callbacks: {
            onSentenceEnd: options?.onSentenceEnd,
            onSpeechEnd: options?.onSpeechEnd,
          },
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

      const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
      if (!provider) {
        throw new Error('Failed to initialize speech provider')
      }

      const idleTimeout = options?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT

      // If a session exists, reuse it unless new callbacks are provided.
      // The stream reader captures callbacks at creation time, so updated callbacks
      // require restarting the session to create a new reader.
      const existingSession = streamingSession.value
      if (existingSession) {
        const hasNewCallbacks = haveStreamingCallbacksChanged(existingSession.callbacks, {
          onSentenceEnd: options?.onSentenceEnd,
          onSpeechEnd: options?.onSpeechEnd,
        })

        if (hasNewCallbacks) {
          console.info('[Hearing Pipeline] New callbacks provided, restarting session')
          await stopStreamingTranscription(false, existingSession.providerId)
          // Fall through to create a new session with updated callbacks
        }
        else {
          // No callback changes: refresh idle timer and reuse session
          if (existingSession.idleTimer) {
            clearTimeout(existingSession.idleTimer)
            existingSession.idleTimer = setTimeout(async () => {
              await stopStreamingTranscription(false, existingSession.providerId)
            }, idleTimeout)
          }
          return
        }
      }

      startStreamingAsrSpan(providerId)

      const abortController = new AbortController()
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const bumpIdle = () => {
        if (idleTimer)
          clearTimeout(idleTimer)
        idleTimer = setTimeout(async () => {
          await stopStreamingTranscription(false, providerId)
        }, idleTimeout)
      }

      const session = await createAudioStreamFromMediaStream(
        stream,
        options?.sampleRate ?? DEFAULT_SAMPLE_RATE,
        () => bumpIdle(),
      )

      if (session.audioContext.state === 'suspended')
        await session.audioContext.resume()

      bumpIdle()

      const model = activeTranscriptionModel.value
      const result = await hearingStore.transcription(
        providerId,
        provider,
        model,
        { inputAudioStream: session.audioStream },
        undefined,
        {
          providerOptions: {
            abortSignal: abortController.signal,
            ...options?.providerOptions,
          },
        },
      )

      streamingSession.value = {
        audioContext: session.audioContext,
        workletNode: session.workletNode,
        mediaStreamSource: session.mediaStreamSource,
        audioStreamController: session.controller,
        abortController,
        result,
        idleTimer,
        providerId,
        callbacks: {
          onSentenceEnd: options?.onSentenceEnd,
          onSpeechEnd: options?.onSpeechEnd,
        },
      }

      // Stream out text deltas to caller without tearing down the session.
      if (result.mode === 'stream' && result.textStream) {
        void (async () => {
          // Capture callbacks from the session at the time the reader is created
          // This prevents cross-session leakage if the session is restarted before
          // this reader finishes (e.g., when navigating between pages or callbacks change)
          const sessionCallbacks = {
            onSentenceEnd: streamingSession.value?.callbacks?.onSentenceEnd,
            onSpeechEnd: streamingSession.value?.callbacks?.onSpeechEnd,
          }

          let fullText = ''
          try {
            const reader = result.textStream.getReader()

            while (true) {
              const { done, value } = await reader.read()
              if (done)
                break
              if (value) {
                fullText += value
                if (asrSpan)
                  asrSpan.addEvent(IOEvents.ASRSentenceEnd, { [IOAttributes.ASRText]: value })
                // Use captured callbacks to avoid cross-session leakage
                sessionCallbacks.onSentenceEnd?.(value)
              }
            }
          }
          catch (err) {
            if (!isExpectedStreamStopError(err))
              console.error('Error reading text stream:', err)
          }
          finally {
            if (asrSpan) {
              asrSpan.setAttribute(IOAttributes.ASRText, fullText)
              asrSpan.end()
              asrSpan = undefined
            }
            // Use captured callbacks to avoid cross-session leakage
            sessionCallbacks.onSpeechEnd?.(fullText)
          }
        })()
      }
    }
    catch (err) {
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
      trackAudioDeviceUnavailable({
        stt_provider_id: activeTranscriptionProvider.value || 'unknown',
        error_code: 'device_unavailable',
      })
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

      const providerConfig = providersStore.getProviderConfig(providerId)
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
    stopStreamingTranscription,
    supportsStreamInput,
  }
})
