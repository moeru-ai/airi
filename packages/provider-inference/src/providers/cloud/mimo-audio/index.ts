import type { ProviderContext } from '../../../types'

import { encodeBase64 } from '@moeru/std/base64'
import { literal, object, picklist, safeParse, string, tupleWithRest, unknown } from 'valibot'
import { z } from 'zod'

import { defineProvider } from '../../registry'

export const MIMO_ASR_MODEL = 'mimo-v2.5-asr'
export const MIMO_ASR_LANGUAGES = ['auto', 'zh', 'en'] as const
export type MimoAsrLanguage = typeof MIMO_ASR_LANGUAGES[number]

const MIMO_DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1/'
const MIMO_MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024

const mimoSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(MIMO_DEFAULT_BASE_URL),
  model: z.string().default('mimo-v2.5-tts'),
  voice: z.string().default('mimo_default'),
  format: z.string().default('wav'),
  stylePrompt: z.string().optional(),
  voiceSample: z.string().optional(),
})

const mimoTranscriptionConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(MIMO_DEFAULT_BASE_URL),
  model: z.literal(MIMO_ASR_MODEL).default(MIMO_ASR_MODEL),
  language: z.enum(MIMO_ASR_LANGUAGES).default('auto'),
})

type MimoSpeechConfig = z.input<typeof mimoSpeechConfigSchema>
type MimoTranscriptionConfig = z.input<typeof mimoTranscriptionConfigSchema>
type MimoConfig = MimoSpeechConfig | MimoTranscriptionConfig

function normalizeBaseUrl(baseUrl: string | undefined) {
  return `${(baseUrl || MIMO_DEFAULT_BASE_URL).replace(/\/+$/, '')}/`
}

function createMimoValidators<TConfig extends MimoConfig>(id: string) {
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

function createMimoSpeechProvider(config: MimoSpeechConfig) {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const defaultModel = config.model || 'mimo-v2.5-tts'
  const defaultVoice = config.voice || 'mimo_default'
  const defaultFormat = config.format || 'wav'

  return {
    speech: () => ({
      baseURL: baseUrl,
      model: defaultModel,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.body || typeof init.body !== 'string')
          throw new Error('Invalid request body')

        const body = JSON.parse(init.body) as {
          input?: string
          model?: string
          response_format?: string
          style_prompt?: string
          voice_sample?: string
          voice?: string
        }
        const model = body.model || defaultModel
        const format = body.response_format || defaultFormat
        const stylePrompt = body.style_prompt?.trim() || config.stylePrompt?.trim() || ''
        const voiceSample = body.voice_sample?.trim() || config.voiceSample?.trim() || ''
        const userPrompt = model === 'mimo-v2.5-tts-voiceclone'
          ? stylePrompt
          : stylePrompt || 'Use a natural, clear speaking style.'

        const audio: Record<string, string> = { format }
        if (model === 'mimo-v2.5-tts-voiceclone') {
          if (!voiceSample)
            throw new Error('MiMo voice clone requires a base64 audio sample in data URI format.')
          audio.voice = voiceSample
        }
        else if (model === 'mimo-v2.5-tts') {
          audio.voice = body.voice || defaultVoice
        }

        if (model === 'mimo-v2.5-tts-voicedesign' && !stylePrompt)
          throw new Error('MiMo voice design requires a style prompt in the user message.')

        const response = await fetch(new URL('chat/completions', baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: body.input ?? '' },
            ],
            audio,
          }),
        })
        if (!response.ok || !response.body)
          throw new Error(`MiMo TTS request failed: ${response.status} ${response.statusText}`)

        const data = await response.json() as {
          choices?: Array<{ message?: { audio?: { data?: string } } }>
        }
        const audioBase64 = data.choices?.[0]?.message?.audio?.data
        if (!audioBase64)
          throw new Error('MiMo TTS response missing audio data')

        const binary = atob(audioBase64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index++)
          bytes[index] = binary.charCodeAt(index)

        let contentType = `audio/${format}`
        if (format === 'wav')
          contentType = 'audio/wav'
        else if (format === 'mp3')
          contentType = 'audio/mpeg'

        return new Response(bytes.buffer, {
          status: 200,
          headers: { 'Content-Type': contentType },
        })
      },
    }),
  }
}

function hasFourCc(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.byteLength < offset + value.length)
    return false
  return value.split('').every((character, index) => bytes[offset + index] === character.charCodeAt(0))
}

function isWavAudio(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  return bytes.byteLength >= 44 && hasFourCc(bytes, 0, 'RIFF') && hasFourCc(bytes, 8, 'WAVE')
}

function isLikelyMp3Audio(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes.byteLength < 2)
    return false
  if (hasFourCc(bytes, 0, 'ID3'))
    return true
  return bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0
}

function createMimoAudioData(buffer: ArrayBuffer, format: 'wav' | 'mp3') {
  const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg'
  const base64 = encodeBase64(buffer)
  if (base64.length > MIMO_MAX_AUDIO_BASE64_LENGTH)
    throw new Error('MiMo ASR audio exceeds the 10 MB Base64 limit.')

  return {
    data: `data:${mimeType};base64,${base64}`,
    format,
  }
}

/** Identifies supported MiMo upload containers from their bytes, independent of the declared MIME type. */
export function mimoAsrAudioFormat(buffer: ArrayBuffer): 'wav' | 'mp3' | undefined {
  if (isWavAudio(buffer))
    return 'wav'
  if (isLikelyMp3Audio(buffer))
    return 'mp3'
}

async function prepareMimoAsrAudio(file: Blob) {
  const buffer = await file.arrayBuffer()
  const format = mimoAsrAudioFormat(buffer)
  if (!format)
    throw new Error('MiMo ASR accepts only WAV or MP3 audio.')
  return createMimoAudioData(buffer, format)
}

/** Unsupported language values use MiMo automatic language detection. */
function normalizeMimoAsrLanguage(value: unknown): MimoAsrLanguage {
  const parsed = safeParse(picklist(MIMO_ASR_LANGUAGES), value)
  return parsed.success ? parsed.output : 'auto'
}

/** Validates the dedicated ASR model and first transcript before returning its trimmed text. */
export function parseMimoAsrResponse(value: unknown) {
  if (!safeParse(object({ model: literal(MIMO_ASR_MODEL) }), value).success)
    throw new Error('MiMo ASR response did not identify the dedicated mimo-v2.5-asr model.')
  const parsed = safeParse(object({
    choices: tupleWithRest([object({ message: object({ content: string() }) })], unknown()),
  }), value)
  if (!parsed.success)
    throw new Error('MiMo ASR response is missing a string transcript.')
  return parsed.output.choices[0].message.content.trim()
}

export interface MimoTranscriptionOptions {
  language?: string
}

function createMimoTranscriptionProvider(config: MimoTranscriptionConfig) {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const configuredLanguage = config.language

  return {
    transcription: (_model: string, extraOptions?: MimoTranscriptionOptions) => ({
      baseURL: baseUrl,
      model: MIMO_ASR_MODEL,
      headers: {},
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!(init?.body instanceof FormData))
          throw new Error('No audio file provided for transcription.')

        const file = init.body.get('file')
        if (!(file instanceof Blob))
          throw new Error('No audio file provided for transcription.')

        const audio = await prepareMimoAsrAudio(file)
        const response = await globalThis.fetch(new URL('chat/completions', baseUrl), {
          method: 'POST',
          signal: init.signal,
          headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          body: JSON.stringify({
            model: MIMO_ASR_MODEL,
            messages: [{
              role: 'user',
              content: [
                { type: 'input_audio', input_audio: audio },
              ],
            }],
            asr_options: {
              language: normalizeMimoAsrLanguage(extraOptions?.language ?? configuredLanguage),
            },
          }),
        })
        if (!response.ok) {
          throw new Error(`MiMo ASR request failed: ${response.status} ${response.statusText}`)
        }

        let data: unknown
        try {
          data = await response.json()
        }
        catch {
          throw new Error('MiMo ASR response was not valid JSON.')
        }

        const text = parseMimoAsrResponse(data)
        return new Response(JSON.stringify({ text }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    }),
  }
}

export const providerMimoAudioSpeech = defineProvider<MimoSpeechConfig, 'mimo-audio-speech'>({
  id: 'mimo-audio-speech',
  name: 'Xiaomi MiMo',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.title'),
  description: 'api.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.description'),
  tasks: ['text-to-speech'],
  icon: 'i-simple-icons:xiaomi',
  createProviderConfig: () => mimoSpeechConfigSchema,
  createProvider: createMimoSpeechProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createMimoValidators<MimoSpeechConfig>('mimo-audio-speech'),
  extraMethods: {
    listModels: async () => [
      { id: 'mimo-v2.5-tts', name: 'MiMo v2.5 TTS', provider: 'mimo-audio-speech', description: 'Preset voice synthesis with the built-in MiMo voice list', deprecated: false },
      { id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo v2.5 TTS Voice Design', provider: 'mimo-audio-speech', description: 'Design a new voice from a natural language description', deprecated: false },
      { id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo v2.5 TTS Voice Clone', provider: 'mimo-audio-speech', description: 'Clone a voice from a base64-encoded audio sample', deprecated: false },
    ],
    voiceCatalogConfig: () => ({}),
    listVoices: async () => [
      { id: 'mimo_default', name: 'MiMo-默认', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }, { code: 'zh', title: 'Chinese' }] },
      { id: '冰糖', name: '冰糖', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: '茉莉', name: '茉莉', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: '苏打', name: '苏打', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: '白桦', name: '白桦', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
      { id: 'Mia', name: 'Mia', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
      { id: 'Chloe', name: 'Chloe', provider: 'mimo-audio-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
      { id: 'Milo', name: 'Milo', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
      { id: 'Dean', name: 'Dean', provider: 'mimo-audio-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
    ],
  },
})

export const providerMimoAudioTranscription = defineProvider<MimoTranscriptionConfig, 'mimo-audio-transcription'>({
  id: 'mimo-audio-transcription',
  name: 'Xiaomi MiMo',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.title'),
  description: 'api.xiaomimimo.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mimo.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-simple-icons:xiaomi',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: () => mimoTranscriptionConfigSchema,
  createProvider: createMimoTranscriptionProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createMimoValidators<MimoTranscriptionConfig>('mimo-audio-transcription'),
  extraMethods: {
    listModels: async () => [
      { id: MIMO_ASR_MODEL, name: 'MiMo v2.5 ASR', provider: 'mimo-audio-transcription', description: 'Dedicated Xiaomi MiMo Speech Recognition model', contextLength: 8_000, deprecated: false },
    ],
  },
})
