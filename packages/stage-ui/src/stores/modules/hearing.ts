import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { WithUnknown } from '@xsai/shared'
import type { StreamTranscriptionResult, StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription'

import { tryCatch } from '@moeru/std'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import vadWorkletUrl from '../../workers/vad/process.worklet?worker&url'

import { createResettableLocalStorage, createResettableRef } from '../../utils/resettable'
import { useProvidersStore } from '../providers'
import { streamAliyunTranscription } from '../providers/aliyun/stream-transcription'

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
  'aliyun-nls-transcription': streamAliyunTranscription,
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
  const streamingSession = shallowRef<{
    audioContext: AudioContext
    workletNode: AudioWorkletNode
    mediaStreamSource: MediaStreamAudioSourceNode
    audioStreamController?: ReadableStreamDefaultController<ArrayBuffer>
    abortController: AbortController
    result?: HearingTranscriptionResult
    idleTimer?: ReturnType<typeof setTimeout>
    providerId?: string
  }>()

  const supportsStreamInput = computed(() => {
    return providersStore.getTranscriptionFeatures(activeTranscriptionProvider.value).supportsStreamInput
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
        error.value = err instanceof Error ? err.message : String(err)
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
    if (!supportsStreamInput.value)
      return

    try {
      const providerId = activeTranscriptionProvider.value
      const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
      if (!provider) {
        throw new Error('Failed to initialize speech provider')
      }

      const idleTimeout = options?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT

      // If a session already exists, just bump the idle timer and reuse the websocket/audio graph.
      const existingSession = streamingSession.value
      if (existingSession) {
        if (existingSession.idleTimer) {
          clearTimeout(existingSession.idleTimer)
          existingSession.idleTimer = setTimeout(async () => {
            await stopStreamingTranscription(false, existingSession.providerId)
          }, idleTimeout)
        }
        return
      }

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
      }

      // Stream out text deltas to caller without tearing down the session.
      if (result.mode === 'stream' && result.textStream) {
        void (async () => {
          let fullText = ''
          try {
            const reader = result.textStream.getReader()

            while (true) {
              const { done, value } = await reader.read()
              if (done)
                break
              if (value) {
                fullText += value
                options?.onSentenceEnd?.(value)
              }
            }
          }
          catch (err) {
            console.error('Error reading text stream:', err)
          }
          finally {
            options?.onSpeechEnd?.(fullText)
          }
        })()
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Error generating transcription:', error.value)
    }
  }

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
    transcribeForMediaStream,
    stopStreamingTranscription,
    supportsStreamInput,
  }
})
