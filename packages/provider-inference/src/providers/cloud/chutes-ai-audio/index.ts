import type { ModelInfo, ProviderContext, VoiceInfo } from '../../../types'

import { encodeBase64 } from '@moeru/std/base64'
import { z } from 'zod'

import { defineProvider } from '../../registry'

/**
 * Public Chutes chute that serves every speech and transcription model on one host.
 *
 * Chutes removed the standalone `chutes-kokoro` and `chutes-whisper-large-v3` chutes.
 * AudioDojo keeps the Kokoro request contract and adds Qwen3-TTS, Whisper, Canary, and Parakeet.
 * See https://chutes.ai/app/chute/vonkaiser-audiodojo/llms.txt for the endpoint list.
 */
const AUDIODOJO_BASE_URL = 'https://vonkaiser-audiodojo.chutes.ai/'

/**
 * Speech models and the AudioDojo route that synthesizes each one.
 * Every route returns raw `audio/wav` bytes. Kokoro renders at 24 kHz.
 */
const speechModels = {
  'kokoro': { path: 'tts/kokoro', name: 'Kokoro 82M', description: '54 preset voices in 9 languages' },
  'qwen3-tts': { path: 'tts/qwen3custom', name: 'Qwen3-TTS 1.7B', description: '9 preset speakers that follow a style instruction' },
} as const

type ChutesSpeechModel = keyof typeof speechModels

/** Transcription models and the AudioDojo route that serves each one. Every route returns JSON. */
const transcriptionModels = {
  'whisper-large-v3-turbo': { path: 'stt/whisper', name: 'Whisper large-v3-turbo', description: 'Multilingual transcription in 99 languages' },
  'parakeet-tdt-0.6b-v3': { path: 'stt/parakeet', name: 'Parakeet TDT 0.6B v3', description: 'Fast transcription of 25 European languages' },
  'canary-qwen-2.5b': { path: 'stt/canary', name: 'Canary-Qwen 2.5B', description: 'High-accuracy English-only transcription' },
} as const

type ChutesTranscriptionModel = keyof typeof transcriptionModels

const DEFAULT_SPEECH_MODEL: ChutesSpeechModel = 'kokoro'
const DEFAULT_TRANSCRIPTION_MODEL: ChutesTranscriptionModel = 'whisper-large-v3-turbo'

/** Kokoro encodes the language in the first letter of each voice id and the gender in the second. */
const kokoroLanguages: Record<string, VoiceInfo['languages'][number]> = {
  a: { code: 'en-US', title: 'English (US)' },
  b: { code: 'en-GB', title: 'English (UK)' },
  e: { code: 'es', title: 'Spanish' },
  f: { code: 'fr', title: 'French' },
  h: { code: 'hi', title: 'Hindi' },
  i: { code: 'it', title: 'Italian' },
  j: { code: 'ja', title: 'Japanese' },
  p: { code: 'pt-BR', title: 'Portuguese (Brazil)' },
  z: { code: 'zh', title: 'Chinese' },
}

const kokoroVoiceIds = [
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_alice',
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
  'bm_george',
  'bm_lewis',
  'ef_dora',
  'em_alex',
  'em_santa',
  'ff_siwis',
  'hf_alpha',
  'hf_beta',
  'hm_omega',
  'hm_psi',
  'if_sara',
  'im_nicola',
  'jf_alpha',
  'jf_gongitsune',
  'jf_nezumi',
  'jf_tebukuro',
  'jm_kumo',
  'pf_dora',
  'pm_alex',
  'pm_santa',
  'zf_xiaobei',
  'zf_xiaoni',
  'zf_xiaoxiao',
  'zf_xiaoyi',
  'zm_yunjian',
  'zm_yunxi',
  'zm_yunxia',
  'zm_yunyang',
] as const

/** Qwen3-TTS CustomVoice speakers. AudioDojo expects these display names, including spaces. */
const qwen3Speakers = ['Ryan', 'Aiden', 'Vivian', 'Serena', 'Uncle Fu', 'Dylan', 'Eric', 'Ono Anna', 'Sohee'] as const

const chutesSpeechVoices: VoiceInfo[] = [
  ...kokoroVoiceIds.map((id): VoiceInfo => {
    const [prefix, name] = id.split('_')
    return {
      id,
      name: `${name[0].toUpperCase()}${name.slice(1)}`,
      provider: 'chutes-ai-speech',
      gender: prefix[1] === 'f' ? 'female' : 'male',
      compatibleModels: ['kokoro'],
      languages: [kokoroLanguages[prefix[0]]],
    }
  }),
  ...qwen3Speakers.map((speaker): VoiceInfo => ({
    id: speaker,
    name: speaker,
    provider: 'chutes-ai-speech',
    compatibleModels: ['qwen3-tts'],
    languages: [],
  })),
]

const chutesSpeechConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default(AUDIODOJO_BASE_URL),
  /**
   * Persisted by the speech settings page. Kokoro reads `speed`.
   * Qwen3-TTS reads `language` and `instruct`, a natural-language style description.
   */
  voiceSettings: z.object({
    speed: z.number().optional(),
    language: z.string().optional(),
    instruct: z.string().optional(),
  }).optional().default({ speed: 1, language: 'English' }),
})

const chutesTranscriptionConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default(AUDIODOJO_BASE_URL),
  model: z.string().optional().default(DEFAULT_TRANSCRIPTION_MODEL),
})

type ChutesSpeechConfig = z.input<typeof chutesSpeechConfigSchema>
type ChutesTranscriptionConfig = z.input<typeof chutesTranscriptionConfigSchema>

/**
 * Normalizes a configured AudioDojo base URL so relative routes resolve under it.
 *
 * @example
 * normalizeBaseUrl('https://vonkaiser-audiodojo.chutes.ai')
 * // => 'https://vonkaiser-audiodojo.chutes.ai/'
 */
function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || AUDIODOJO_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

function isSpeechModel(model: string): model is ChutesSpeechModel {
  return Object.hasOwn(speechModels, model)
}

function isTranscriptionModel(model: string): model is ChutesTranscriptionModel {
  return Object.hasOwn(transcriptionModels, model)
}

/** Builds the flat JSON body of one AudioDojo speech route from the OpenAI-shaped request. */
function toSpeechBody(model: ChutesSpeechModel, input: string, voice: string | undefined, settings: ChutesSpeechConfig['voiceSettings']) {
  if (model === 'kokoro')
    return { text: input, voice: voice || 'af_heart', speed: settings?.speed ?? 1 }

  const instruct = settings?.instruct?.trim()
  return {
    text: input,
    speaker: voice || 'Ryan',
    language: settings?.language?.trim() || 'English',
    ...(instruct ? { instruct } : {}),
  }
}

/** Builds the flat JSON body of one AudioDojo transcription route. Timestamps are off because AIRI reads only the text. */
function toTranscriptionBody(model: ChutesTranscriptionModel, audio: string, language: string | undefined) {
  if (model === 'whisper-large-v3-turbo')
    return { audio_b64: audio, return_timestamps: false, ...(language ? { language } : {}) }
  if (model === 'parakeet-tdt-0.6b-v3')
    return { audio_b64: audio, timestamps: false }

  return { audio_b64: audio }
}

const transcriptSegmentsSchema = z.array(z.object({ text: z.string() }))
const transcriptObjectSchema = z.object({ text: z.string() })

/**
 * Reads the transcript text from an AudioDojo transcription response.
 *
 * @example
 * readTranscript({ text: ' Hello there. ' })
 * // => 'Hello there.'
 *
 * readTranscript([{ start: 0, end: 1.2, text: 'Hello' }, { start: 1.2, end: 2, text: 'there.' }])
 * // => 'Hello there.'
 */
function readTranscript(payload: unknown): string {
  // NOTICE:
  // AudioDojo publishes no response schema for /stt/* routes.
  // `{ text }` is the Hugging Face pipeline shape. A segment array is the removed Whisper chute
  // contract (`chutesai/ai-sdk-provider-chutes` src/models/audio-model.ts).
  // Other shapes throw with their keys. Remove when AudioDojo documents the response.
  const object = transcriptObjectSchema.safeParse(payload)
  if (object.success)
    return object.data.text.trim()

  const segments = transcriptSegmentsSchema.safeParse(payload)
  if (segments.success)
    return segments.data.map(segment => segment.text.trim()).filter(Boolean).join(' ')

  const keys = payload && typeof payload === 'object' ? Object.keys(payload).join(', ') : typeof payload
  throw new Error(`Chutes transcription response has no transcript text (received: ${keys}).`)
}

function createChutesAudioValidators<TConfig extends { apiKey?: string, baseUrl?: string }>(id: string) {
  return {
    validateConfig: [
      ({ t }: ProviderContext) => ({
        id: `${id}:check-config`,
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: TConfig) => {
          const errors: Array<{ error: unknown }> = []
          if (!config.apiKey?.trim())
            errors.push({ error: new Error('API key is required.') })
          if (!config.baseUrl?.trim())
            errors.push({ error: new Error('Base URL is required.') })

          return {
            errors,
            reason: errors.map(item => (item.error as Error).message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  }
}

function createChutesSpeechProvider(config: ChutesSpeechConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)

  return {
    speech: (model?: string) => ({
      apiKey: config.apiKey?.trim() ?? '',
      baseURL: baseUrl,
      model: model || DEFAULT_SPEECH_MODEL,
      // `generateSpeech` posts an OpenAI `audio/speech` body. This fetch reroutes it to the
      // model's AudioDojo route and reuses the Bearer header and abort signal that xsai built.
      // xsai rejects a non-2xx upstream response with its body, so the response passes through unchanged.
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Invalid request body')

        const request = JSON.parse(init.body) as { input?: string, model?: string, voice?: string }
        const requestModel = request.model || DEFAULT_SPEECH_MODEL
        if (!isSpeechModel(requestModel))
          throw new Error(`Unsupported Chutes speech model: ${requestModel}`)

        return globalThis.fetch(new URL(speechModels[requestModel].path, baseUrl), {
          method: 'POST',
          headers: init.headers,
          body: JSON.stringify(toSpeechBody(requestModel, request.input ?? '', request.voice, config.voiceSettings)),
          signal: init.signal,
        })
      },
    }),
  }
}

function createChutesTranscriptionProvider(config: ChutesTranscriptionConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)

  return {
    transcription: (model?: string) => ({
      apiKey: config.apiKey?.trim() ?? '',
      baseURL: baseUrl,
      model: model || config.model || DEFAULT_TRANSCRIPTION_MODEL,
      // `generateTranscription` posts OpenAI multipart form data. AudioDojo takes JSON with
      // raw base64 audio, so this fetch re-encodes the file and returns an OpenAI `{ text }` body.
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!(init?.body instanceof FormData))
          throw new Error('No audio file provided for transcription.')

        const file = init.body.get('file')
        if (!(file instanceof Blob))
          throw new Error('No audio file provided for transcription.')

        const requestModel = String(init.body.get('model') || DEFAULT_TRANSCRIPTION_MODEL)
        if (!isTranscriptionModel(requestModel))
          throw new Error(`Unsupported Chutes transcription model: ${requestModel}`)

        const language = init.body.get('language')
        const headers = new Headers(init.headers)
        headers.set('Content-Type', 'application/json')
        const response = await globalThis.fetch(new URL(transcriptionModels[requestModel].path, baseUrl), {
          method: 'POST',
          headers,
          body: JSON.stringify(toTranscriptionBody(
            requestModel,
            encodeBase64(await file.arrayBuffer()),
            typeof language === 'string' ? language : undefined,
          )),
          signal: init.signal,
        })
        if (!response.ok)
          return response

        return Response.json({ text: readTranscript(await response.json()) })
      },
    }),
  }
}

export const providerChutesAISpeech = defineProvider<ChutesSpeechConfig, 'chutes-ai-speech'>({
  id: 'chutes-ai-speech',
  name: 'Chutes',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.chutes.title'),
  description: 'chutes.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.chutes.description'),
  tasks: ['text-to-speech'],
  icon: 'i-ph:parachute-duotone',
  createProviderConfig: () => chutesSpeechConfigSchema,
  createProvider: createChutesSpeechProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createChutesAudioValidators<ChutesSpeechConfig>('chutes-ai-speech'),
  extraMethods: {
    listModels: async () => Object.entries(speechModels).map(([id, model]): ModelInfo => ({
      id,
      name: model.name,
      provider: 'chutes-ai-speech',
      description: model.description,
    })),
    // The catalog is static. The speech settings page filters it by `compatibleModels`.
    voiceCatalogConfig: () => ({}),
    listVoices: async () => chutesSpeechVoices,
  },
})

export const providerChutesAITranscription = defineProvider<ChutesTranscriptionConfig, 'chutes-ai-transcription'>({
  id: 'chutes-ai-transcription',
  name: 'Chutes',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.chutes.title'),
  description: 'chutes.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.chutes.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-ph:parachute-duotone',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: () => chutesTranscriptionConfigSchema,
  createProvider: createChutesTranscriptionProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createChutesAudioValidators<ChutesTranscriptionConfig>('chutes-ai-transcription'),
  extraMethods: {
    listModels: async () => Object.entries(transcriptionModels).map(([id, model]): ModelInfo => ({
      id,
      name: model.name,
      provider: 'chutes-ai-transcription',
      description: model.description,
    })),
  },
})
