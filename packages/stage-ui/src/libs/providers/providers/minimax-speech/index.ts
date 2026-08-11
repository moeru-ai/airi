import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { z } from 'zod'

import { defineProvider } from '../registry'

const PROVIDER_ID = 'minimax-speech'
const DEFAULT_BASE_URL = 'https://api.minimax.io'
const DEFAULT_MODEL = 'speech-2.8-hd'
const DEFAULT_VOICE = 'English_Graceful_Lady'

const MINIMAX_SPEECH_MODELS = [
  'speech-2.8-hd',
  'speech-2.8-turbo',
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-02-hd',
  'speech-02-turbo',
  'speech-01-hd',
  'speech-01-turbo',
] as const

const MINIMAX_VOICE_CLONE_MODELS = [
  'speech-2.8-hd',
  'speech-2.6-hd',
  'speech-02-hd',
  'speech-01-hd',
] as const

const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'flac', 'pcm'] as const
const SUPPORTED_OUTPUT_FORMATS = ['hex', 'url'] as const
const minimaxVoiceCloneModelSchema = z.enum(MINIMAX_VOICE_CLONE_MODELS)

type AudioFormat = (typeof SUPPORTED_AUDIO_FORMATS)[number]
type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number]
type MiniMaxVoiceCloneModel = z.infer<typeof minimaxVoiceCloneModelSchema>

const minimaxSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  model: z.string().default(DEFAULT_MODEL),
  voice: z.string().default(DEFAULT_VOICE),
  format: z.enum(SUPPORTED_AUDIO_FORMATS).default('mp3'),
  output_format: z.enum(SUPPORTED_OUTPUT_FORMATS).default('hex'),
  stream: z.boolean().optional(),
  speed: z.number().optional(),
  vol: z.number().optional(),
  pitch: z.number().optional(),
  sample_rate: z.number().optional(),
  bitrate: z.number().optional(),
  channel: z.number().optional(),
  language_boost: z.string().optional(),
  subtitle_enable: z.boolean().optional(),
  voice_setting: z.record(z.string(), z.unknown()).optional(),
  audio_setting: z.record(z.string(), z.unknown()).optional(),
  pronunciation_dict: z.record(z.string(), z.unknown()).optional(),
  voice_modify: z.record(z.string(), z.unknown()).optional(),
})

type MinimaxSpeechConfig = z.input<typeof minimaxSpeechConfigSchema>

interface MiniMaxBaseResponse {
  status_code?: number
  status_msg?: string
}

interface MiniMaxT2AResponse {
  data?: {
    audio?: string
    status?: number
  }
  base_resp?: MiniMaxBaseResponse
}

interface MiniMaxUploadResponse {
  file?: {
    file_id?: number | string
  }
  base_resp?: MiniMaxBaseResponse
}

interface MiniMaxVoiceCloneResponse {
  voice_id?: string
  base_resp?: MiniMaxBaseResponse
}

/** Input for uploading sample audio and creating a MiniMax cloned voice. */
export interface MiniMaxVoiceCloneInput {
  file: Blob
  fileName: string
  voiceId: string
  model: MiniMaxVoiceCloneModel
}

/** Identifiers returned after MiniMax creates a cloned voice. */
export interface MiniMaxVoiceCloneResult {
  fileId: number | string
  voiceId: string
}

const MINIMAX_SPEECH_VOICES = [
  { id: 'English_Graceful_Lady', name: 'Graceful Lady', gender: 'female', code: 'en', title: 'English' },
  { id: 'English_Insightful_Speaker', name: 'Insightful Speaker', gender: 'male', code: 'en', title: 'English' },
  { id: 'English_radiant_girl', name: 'Radiant Girl', gender: 'female', code: 'en', title: 'English' },
  { id: 'English_Persuasive_Man', name: 'Persuasive Man', gender: 'male', code: 'en', title: 'English' },
  { id: 'English_Lucky_Robot', name: 'Lucky Robot', gender: 'neutral', code: 'en', title: 'English' },
  { id: 'English_expressive_narrator', name: 'Expressive Narrator', gender: 'neutral', code: 'en', title: 'English' },
  { id: 'Mandarin_Gentle_Woman', name: 'Gentle Woman', gender: 'female', code: 'zh', title: 'Chinese' },
  { id: 'Mandarin_Steadfast_Man', name: 'Steadfast Man', gender: 'male', code: 'zh', title: 'Chinese' },
  { id: 'Mandarin_Sweet_Girl', name: 'Sweet Girl', gender: 'female', code: 'zh', title: 'Chinese' },
  { id: 'Mandarin_Magnetic_Gentleman', name: 'Magnetic Gentleman', gender: 'male', code: 'zh', title: 'Chinese' },
] as const

const AUDIO_MIME_BY_FORMAT: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  pcm: 'audio/L16',
}

function normalizeBaseUrl(value: unknown) {
  const baseUrl = typeof value === 'string' ? value.trim() : ''
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function normalizeFormat(value: unknown): AudioFormat {
  const format = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (SUPPORTED_AUDIO_FORMATS as readonly string[]).includes(format) ? format as AudioFormat : 'mp3'
}

function normalizeOutputFormat(value: unknown): OutputFormat {
  return value === 'url' ? 'url' : 'hex'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatModelName(id: string) {
  return id
    .split('-')
    .map((segment) => {
      if (/^\d/.test(segment))
        return segment
      if (segment === 'hd')
        return 'HD'
      return segment.charAt(0).toUpperCase() + segment.slice(1)
    })
    .join(' ')
}

function hexToBytes(hex: string) {
  if (!/^(?:[\da-f]{2})+$/i.test(hex))
    throw new Error('MiniMax TTS returned invalid hex audio data')

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return bytes
}

function throwForBusinessError(operation: string, response: { base_resp?: MiniMaxBaseResponse }) {
  const statusCode = response.base_resp?.status_code
  if (typeof statusCode !== 'number' || statusCode === 0)
    return

  const statusMessage = response.base_resp?.status_msg || `status_code ${statusCode}`
  throw new Error(`${operation} failed: ${statusMessage}`)
}

async function parseJsonResponse<T extends { base_resp?: MiniMaxBaseResponse }>(response: Response, operation: string): Promise<T> {
  if (!response.ok)
    throw new Error(`${operation} failed: ${response.status} ${response.statusText}`)

  const data = await response.json() as T
  throwForBusinessError(operation, data)
  return data
}

function combineAudioChunks(chunks: Uint8Array[]) {
  const combined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return combined
}

async function collectStreamingAudio(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const audioChunks: Uint8Array[] = []
  let summaryAudio = ''
  let buffer = ''

  const processLine = (line: string) => {
    if (!line.startsWith('data:'))
      return

    const json = line.slice(5).trim()
    if (!json || json === '[DONE]')
      return

    let event: MiniMaxT2AResponse
    try {
      event = JSON.parse(json) as MiniMaxT2AResponse
    }
    catch {
      return
    }

    throwForBusinessError('MiniMax TTS request', event)
    const audio = event.data?.audio
    if (!audio)
      return

    if (event.data?.status === 2)
      summaryAudio = audio
    else
      audioChunks.push(hexToBytes(audio))
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines)
      processLine(line)
  }

  buffer += decoder.decode()
  if (buffer.trim())
    processLine(buffer)

  if (audioChunks.length === 0 && summaryAudio)
    audioChunks.push(hexToBytes(summaryAudio))
  if (audioChunks.length === 0)
    throw new Error('MiniMax TTS returned no audio data')

  return combineAudioChunks(audioChunks)
}

function pickField(body: Record<string, unknown>, options: Record<string, unknown>, key: string) {
  return body[key] ?? options[key]
}

function createAudioFetch(apiKey: string, baseUrl: string, options: Record<string, unknown>) {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!init?.body || typeof init.body !== 'string')
      throw new Error('Invalid request body')

    const body = JSON.parse(init.body) as Record<string, unknown>
    const text = body.input
    if (typeof text !== 'string' || !text)
      throw new Error('Missing input text for MiniMax TTS')

    const configuredVoiceSetting = pickField(body, options, 'voice_setting')
    const configuredAudioSetting = pickField(body, options, 'audio_setting')
    const voiceSetting = isRecord(configuredVoiceSetting) ? configuredVoiceSetting : {}
    const audioSetting = isRecord(configuredAudioSetting) ? configuredAudioSetting : {}
    const model = typeof body.model === 'string' && body.model
      ? body.model
      : typeof options.model === 'string' && options.model ? options.model : DEFAULT_MODEL
    const voiceId = typeof body.voice === 'string' && body.voice
      ? body.voice
      : typeof options.voice === 'string' && options.voice ? options.voice : DEFAULT_VOICE
    const format = normalizeFormat(body.format ?? body.response_format ?? audioSetting.format ?? options.format)
    const outputFormat = normalizeOutputFormat(body.output_format ?? options.output_format)
    const requestedStream = body.stream ?? options.stream
    const stream = format === 'mp3' && outputFormat === 'hex' && requestedStream !== false

    const requestBody: Record<string, unknown> = {
      model,
      text,
      stream,
      output_format: stream ? 'hex' : outputFormat,
      voice_setting: {
        ...voiceSetting,
        voice_id: voiceId,
        speed: toNumber(pickField(body, options, 'speed') ?? voiceSetting.speed, 1),
        vol: toNumber(pickField(body, options, 'vol') ?? pickField(body, options, 'volume') ?? voiceSetting.vol, 1),
        pitch: toNumber(pickField(body, options, 'pitch') ?? voiceSetting.pitch, 0),
      },
      audio_setting: {
        ...audioSetting,
        sample_rate: toNumber(pickField(body, options, 'sample_rate') ?? audioSetting.sample_rate, 32000),
        bitrate: toNumber(pickField(body, options, 'bitrate') ?? audioSetting.bitrate, 128000),
        format,
        channel: toNumber(pickField(body, options, 'channel') ?? audioSetting.channel, 1),
      },
    }

    const languageBoost = pickField(body, options, 'language_boost')
    if (typeof languageBoost === 'string' && languageBoost)
      requestBody.language_boost = languageBoost

    const subtitleEnable = pickField(body, options, 'subtitle_enable')
    if (typeof subtitleEnable === 'boolean')
      requestBody.subtitle_enable = subtitleEnable

    const pronunciationDict = pickField(body, options, 'pronunciation_dict')
    if (isRecord(pronunciationDict))
      requestBody.pronunciation_dict = pronunciationDict

    const voiceModify = pickField(body, options, 'voice_modify')
    if (isRecord(voiceModify))
      requestBody.voice_modify = voiceModify

    const response = await globalThis.fetch(`${baseUrl}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok)
      throw new Error(`MiniMax TTS request failed: ${response.status} ${response.statusText}`)

    if (stream) {
      if (!response.body)
        throw new Error('MiniMax TTS response has no body')
      const audio = await collectStreamingAudio(response.body)
      return new Response(audio.buffer as ArrayBuffer, {
        status: 200,
        headers: { 'Content-Type': AUDIO_MIME_BY_FORMAT[format] },
      })
    }

    const data = await parseJsonResponse<MiniMaxT2AResponse>(response, 'MiniMax TTS request')
    const audio = data.data?.audio
    if (!audio)
      throw new Error('MiniMax TTS returned no audio data')

    if (outputFormat === 'url') {
      const audioResponse = await globalThis.fetch(audio)
      if (!audioResponse.ok)
        throw new Error(`MiniMax TTS audio download failed: ${audioResponse.status} ${audioResponse.statusText}`)
      return new Response(audioResponse.body, {
        status: 200,
        headers: { 'Content-Type': audioResponse.headers.get('Content-Type') || AUDIO_MIME_BY_FORMAT[format] },
      })
    }

    const bytes = hexToBytes(audio)
    return new Response(bytes.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': AUDIO_MIME_BY_FORMAT[format] },
    })
  }
}

function createSpeechProvider(apiKey: string, baseUrl: string, defaults: Record<string, unknown>): SpeechProviderWithExtraOptions<string, Record<string, unknown>> {
  return {
    speech: (model?: string, options?: Record<string, unknown>) => {
      const resolvedOptions = { ...defaults, ...options }
      return {
        ...resolvedOptions,
        baseURL: `${baseUrl}/v1/`,
        fetch: createAudioFetch(apiKey, baseUrl, resolvedOptions),
        model: model || (typeof resolvedOptions.model === 'string' ? resolvedOptions.model : DEFAULT_MODEL),
      }
    },
  }
}

/** Uploads clone audio, then creates the voice on the selected regional endpoint. */
export async function createMiniMaxVoiceClone(config: { apiKey: string, baseUrl?: string }, input: MiniMaxVoiceCloneInput): Promise<MiniMaxVoiceCloneResult> {
  const apiKey = config.apiKey.trim()
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const model = minimaxVoiceCloneModelSchema.parse(input.model)
  const uploadForm = new FormData()
  uploadForm.append('purpose', 'voice_clone')
  uploadForm.append('file', input.file, input.fileName)

  const uploadResponse = await globalThis.fetch(`${baseUrl}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: uploadForm,
  })
  const upload = await parseJsonResponse<MiniMaxUploadResponse>(uploadResponse, 'MiniMax voice clone upload')
  const fileId = upload.file?.file_id
  if (fileId === undefined)
    throw new Error('MiniMax voice clone upload returned no file_id')

  const cloneResponse = await globalThis.fetch(`${baseUrl}/v1/voice_clone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      file_id: fileId,
      voice_id: input.voiceId,
      model,
    }),
  })
  const clone = await parseJsonResponse<MiniMaxVoiceCloneResponse>(cloneResponse, 'MiniMax voice clone request')
  return { fileId, voiceId: clone.voice_id || input.voiceId }
}

export const providerMinimaxSpeech = defineProvider<MinimaxSpeechConfig>({
  id: PROVIDER_ID,
  name: 'MiniMax Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-speech.title'),
  description: 'minimax.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-speech.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:minimax',
  iconColor: 'i-lobe-icons:minimax-color',
  createProviderConfig: () => minimaxSpeechConfigSchema,
  createProvider(config) {
    const defaults: Record<string, unknown> = {
      model: config.model,
      voice: config.voice,
      format: config.format,
      output_format: config.output_format,
      stream: config.stream,
      speed: config.speed,
      vol: config.vol,
      pitch: config.pitch,
      sample_rate: config.sample_rate,
      bitrate: config.bitrate,
      channel: config.channel,
      language_boost: config.language_boost,
      subtitle_enable: config.subtitle_enable,
      voice_setting: config.voice_setting,
      audio_setting: config.audio_setting,
      pronunciation_dict: config.pronunciation_dict,
      voice_modify: config.voice_modify,
    }
    return createSpeechProvider(config.apiKey.trim(), normalizeBaseUrl(config.baseUrl), defaults)
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'minimax-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const valid = Boolean(config.apiKey?.trim())
          return {
            errors: valid ? [] : [{ error: new Error('API key is required.') }],
            reason: valid ? '' : 'API key is required.',
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => MINIMAX_SPEECH_MODELS.map(id => ({
      id,
      name: formatModelName(id),
      provider: PROVIDER_ID,
      description: id.endsWith('-turbo')
        ? 'Fast TTS model for low-latency scenarios'
        : 'High-definition TTS model with natural prosody',
      capabilities: ['text-to-speech'],
      deprecated: false,
    })),
    listVoices: async () => MINIMAX_SPEECH_VOICES.map(voice => ({
      id: voice.id,
      name: voice.name,
      provider: PROVIDER_ID,
      gender: voice.gender,
      languages: [{ code: voice.code, title: voice.title }],
      compatibleModels: [...MINIMAX_SPEECH_MODELS],
    })),
  },
})
