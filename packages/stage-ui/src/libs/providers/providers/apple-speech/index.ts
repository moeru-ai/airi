import type {
  AppleSpeechTranscription,
  TranscriptionEvent,
  TranscriptionRange,
} from '@xsai-apple-speech/transcription'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { AIRIStreamTranscriptionResult, StreamTranscriptionOptions } from '../../stream-transcription'
import type { ProviderConfigContext } from '../../types'
import type { AppleSpeechConfig } from './provider'

import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { toFloat32FromPCM16 } from '@proj-airi/audio/encoding'
import { isElectronWindow, isStageTamagotchi } from '@proj-airi/stage-shared'
import { streamTranscription as streamAppleSpeechTranscription } from '@xsai-apple-speech/transcription'
import { createAppleSpeechProvider as createElectronAppleSpeechProvider } from '@xsai-apple-speech/transcription-electron-plugin'

import { defineProvider } from '../registry'
import { appleSpeechConfigSchema, listAppleSpeechLocaleOptions } from './provider'

export type { AppleSpeechConfig } from './provider'
export { listAppleSpeechLocaleOptions } from './provider'

export const APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID = 'apple-speech-transcription'
type AppleSpeechTranscriptionProviderId = typeof APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID

/** Request options applied by AIRI before Apple Speech creates a batch or live session. */
export interface AppleSpeechProviderOptions {
  /** Cancels native preparation and active transcription work. */
  abortSignal?: AbortSignal
  /** PCM input rate in hertz. @default 16000 */
  inputSampleRate?: number
  /** Exact Apple Speech locale for this request. The Provider configuration is the default. */
  locale?: string
}

type AIRIAppleSpeechProvider = TranscriptionProviderWithExtraOptions<'apple-speech', AppleSpeechProviderOptions> & {
  dispose: () => void
}

type AppleSpeechStreamOptions = StreamTranscriptionOptions & AppleSpeechTranscription & {
  inputSampleRate?: number
}

async function createAppleSpeechConfigSchema(context: ProviderConfigContext<AppleSpeechConfig>) {
  const { t } = context
  const localeOptions = await listAppleSpeechLocaleOptions(context)
  return appleSpeechConfigSchema.extend({
    locale: appleSpeechConfigSchema.shape.locale.meta({
      type: 'select',
      labelLocalized: t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.label'),
      descriptionLocalized: t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.description'),
      placeholderLocalized: t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.placeholder'),
      options: localeOptions,
    }),
  })
}

function createRendererAppleSpeechProvider(config: AppleSpeechConfig): AIRIAppleSpeechProvider {
  if (typeof window === 'undefined' || !isElectronWindow(window))
    throw new Error('Apple Speech transcription requires the Electron desktop app.')

  const eventa = createContext(window.electron.ipcRenderer)
  const provider = createElectronAppleSpeechProvider({ context: eventa.context })
  const configuredLocale = config.locale?.trim() || 'en-US'

  return {
    transcription(_model, requestOptions = {}) {
      const locale = requestOptions.locale?.trim() || configuredLocale
      return {
        ...provider.transcription({ locale, transcriber: 'automatic' }),
        ...requestOptions,
        inputSampleRate: requestOptions.inputSampleRate ?? 16000,
      }
    },
    dispose() {
      eventa.dispose()
    },
  }
}

async function isAppleSpeechAvailable() {
  if (!isStageTamagotchi() || typeof window === 'undefined' || !isElectronWindow(window) || window.platform !== 'darwin')
    return false

  const { context, dispose } = createContext(window.electron.ipcRenderer)

  try {
    const provider = createElectronAppleSpeechProvider({ context })
    const availability = await provider.isAvailable()
    return availability.available
  }
  catch {
    return false
  }
  finally {
    dispose()
  }
}

function isAppleSpeechStreamRequest(
  options: StreamTranscriptionOptions,
): options is AppleSpeechStreamOptions {
  return options.baseURL instanceof URL
    && typeof options.fetch === 'function'
    && 'model' in options
    && typeof options.model === 'string'
    && 'startStream' in options
    && typeof options.startStream === 'function'
}

/**
 * Normalizes one PCM chunk to a byte view without copying its sample data.
 *
 * @example
 * audioChunkBytes(new Int16Array([0, 1]))
 * // => Uint8Array(4)
 */
function audioChunkBytes(chunk: ArrayBuffer | ArrayBufferView) {
  return ArrayBuffer.isView(chunk)
    ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    : new Uint8Array(chunk)
}

function combinedRange(event: TranscriptionEvent): TranscriptionRange {
  if (event.type === 'transcript.text.partial')
    return event.range

  const ranges = event.results?.map(result => result.range) ?? []
  if (ranges.length === 0)
    return { durationMilliseconds: 0, isFinal: true, startMilliseconds: 0 }

  const startMilliseconds = Math.min(...ranges.map(range => range.startMilliseconds))
  const endMilliseconds = Math.max(...ranges.map(range => range.startMilliseconds + range.durationMilliseconds))
  return {
    durationMilliseconds: endMilliseconds - startMilliseconds,
    isFinal: true,
    startMilliseconds,
  }
}

/**
 * Normalizes one Apple replacement event to the snapshot contract used by Hearing.
 *
 * @example
 * appleEventSnapshot({ type: 'transcript.text.partial', text: 'Hello', locale: 'en-US', range })
 * // => { type: 'transcript.text.snapshot', text: 'Hello', isFinal: false, ... }
 */
function appleEventSnapshot(event: TranscriptionEvent) {
  const range = combinedRange(event)
  return {
    durationMilliseconds: range.durationMilliseconds,
    isFinal: event.type === 'transcript.text.done',
    locale: event.locale,
    startMilliseconds: range.startMilliseconds,
    text: event.text,
    type: 'transcript.text.snapshot' as const,
  }
}

async function pumpPcm16Input(
  input: NonNullable<StreamTranscriptionOptions['inputAudioStream']>,
  writer: WritableStreamDefaultWriter<Float32Array>,
) {
  const reader = input.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break

      await writer.write(toFloat32FromPCM16(audioChunkBytes(value)))
    }
    await writer.close()
  }
  catch (error) {
    await writer.abort(error).catch(() => {})
    throw error
  }
  finally {
    reader.releaseLock()
  }
}

/**
 * Adapts AIRI's mono PCM16 VAD stream to Apple Speech live transcription.
 *
 * The Provider boundary converts each audio chunk and maps Apple replacement
 * events to AIRI transcript snapshots.
 */
export function executeAppleSpeechStream(options: AppleSpeechStreamOptions): AIRIStreamTranscriptionResult
export function executeAppleSpeechStream(options: StreamTranscriptionOptions): AIRIStreamTranscriptionResult
export function executeAppleSpeechStream(options: StreamTranscriptionOptions): AIRIStreamTranscriptionResult {
  if (!options.inputAudioStream)
    throw new TypeError('Apple Speech live transcription requires an audio stream.')
  if (!isAppleSpeechStreamRequest(options))
    throw new TypeError('Apple Speech live transcription requires a native stream request.')

  const inputSampleRate = options.inputSampleRate ?? 16000
  const live = streamAppleSpeechTranscription({
    ...options,
    inputSampleRate,
  })
  const inputPump = pumpPcm16Input(options.inputAudioStream, live.input.getWriter())
  void inputPump.catch(() => {})

  return {
    fullStream: live.fullStream.pipeThrough(new TransformStream({
      transform(event, controller) {
        controller.enqueue(appleEventSnapshot(event))
      },
    })),
    text: Promise.all([live.text, inputPump]).then(([text]) => text),
    textStream: live.partialStream,
  }
}

export const providerAppleSpeechTranscription = defineProvider<AppleSpeechConfig, AppleSpeechTranscriptionProviderId>({
  id: APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID,
  name: 'Apple Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.apple-speech-transcription.title'),
  description: 'On-device speech recognition on macOS 26 or later. No API key is required.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.apple-speech-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  requiresCredentials: false,
  isAvailableBy: isAppleSpeechAvailable,
  views: {
    hearing: () => import('./hearing-settings.vue'),
  },
  capabilities: {
    transcription: {
      protocol: 'native',
      generateOutput: true,
      streamOutput: true,
      streamInput: true,
    },
  },
  createProviderConfig: createAppleSpeechConfigSchema,
  createProvider: createRendererAppleSpeechProvider,
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async () => [{
      id: 'apple-speech',
      name: 'Apple Speech',
      provider: APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID,
      description: 'On-device Apple Speech transcription',
    }],
  },
})
