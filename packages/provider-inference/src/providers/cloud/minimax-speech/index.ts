import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { VoiceInfo } from '../../../types'

import { EventSourceParserStream } from '@xsai/shared-stream'
import { z } from 'zod'

import { defineProvider } from '../../registry'

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

/** Locale of a voice that the catalog cannot resolve from its ID. */
const UNKNOWN_VOICE_LANGUAGE = { code: 'und', title: 'Unknown' }

/**
 * Maps the voice ID prefix to a locale. MiniMax prefixes system voice IDs with
 * the language, for example `Spanish_Serene_Woman` or `Chinese (Mandarin)_Anchor`.
 */
const VOICE_LANGUAGE_BY_PREFIX: Record<string, { code: string, title: string }> = {
  'english': { code: 'en', title: 'English' },
  'spanish': { code: 'es', title: 'Spanish' },
  'chinese (mandarin)': { code: 'zh', title: 'Chinese' },
  'cantonese': { code: 'yue', title: 'Cantonese' },
  'chinese': { code: 'zh', title: 'Chinese' },
  'japanese': { code: 'ja', title: 'Japanese' },
  'korean': { code: 'ko', title: 'Korean' },
  'french': { code: 'fr', title: 'French' },
  'german': { code: 'de', title: 'German' },
  'italian': { code: 'it', title: 'Italian' },
  'portuguese': { code: 'pt', title: 'Portuguese' },
  'russian': { code: 'ru', title: 'Russian' },
  'turkish': { code: 'tr', title: 'Turkish' },
  'indonesian': { code: 'id', title: 'Indonesian' },
  'vietnamese': { code: 'vi', title: 'Vietnamese' },
  'thai': { code: 'th', title: 'Thai' },
}

/**
 * Every ID here is listed in the MiniMax System Voice ID List. An ID that the
 * account does not own makes the synthesis call fail, so never invent one.
 * Source: https://platform.minimax.io/docs/api-reference/system-voice-id
 */
const builtinMinimaxVoices: VoiceInfo[] = [
  { id: 'English_Graceful_Lady', name: 'Graceful Lady', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
  { id: 'English_radiant_girl', name: 'Radiant Girl', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
  { id: 'English_expressive_narrator', name: 'Expressive Narrator', provider: 'minimax-speech', gender: 'neutral', languages: [{ code: 'en', title: 'English' }] },
  { id: 'English_Upbeat_Woman', name: 'Upbeat Woman', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'en', title: 'English' }] },
  { id: 'English_Trustworth_Man', name: 'Trustworthy Man', provider: 'minimax-speech', gender: 'male', languages: [{ code: 'en', title: 'English' }] },
  { id: 'Spanish_SereneWoman', name: 'Serene Woman', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'es', title: 'Spanish' }] },
  { id: 'Spanish_Narrator', name: 'Narrator', provider: 'minimax-speech', gender: 'male', languages: [{ code: 'es', title: 'Spanish' }] },
  { id: 'Spanish_WiseScholar', name: 'Wise Scholar', provider: 'minimax-speech', gender: 'male', languages: [{ code: 'es', title: 'Spanish' }] },
  { id: 'Spanish_ConfidentWoman', name: 'Confident Woman', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'es', title: 'Spanish' }] },
  { id: 'Chinese (Mandarin)_Reliable_Executive', name: 'Reliable Executive', provider: 'minimax-speech', gender: 'male', languages: [{ code: 'zh', title: 'Chinese' }] },
  { id: 'Chinese (Mandarin)_News_Anchor', name: 'News Anchor', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'zh', title: 'Chinese' }] },
  { id: 'Cantonese_ProfessionalHost (F)', name: 'Professional Female Host', provider: 'minimax-speech', gender: 'female', languages: [{ code: 'yue', title: 'Cantonese' }] },
]

/** Reads the language that the ID prefix names. Cloned and generated voices have no prefix. */
function resolveVoiceLanguage(voiceId: string): { code: string, title: string } {
  const separatorIndex = voiceId.indexOf('_')
  if (separatorIndex <= 0)
    return UNKNOWN_VOICE_LANGUAGE
  return VOICE_LANGUAGE_BY_PREFIX[voiceId.slice(0, separatorIndex).trim().toLowerCase()] ?? UNKNOWN_VOICE_LANGUAGE
}

interface MinimaxVoiceEntry {
  voice_id?: string
  voice_name?: string
  description?: string[]
}

/**
 * Every MiniMax endpoint reports its own outcome in this envelope, and it does
 * so with HTTP 200. A rejected key and a rejected request therefore look like a
 * successful empty result to anything that reads only the status code. The
 * payload is the only place the outcome appears.
 */
interface MinimaxBaseResponse {
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

/** The only status code MiniMax uses for a successful call. */
const MINIMAX_STATUS_OK = 0

/** One `data:` event of the synthesis stream. */
interface MinimaxStreamEvent extends MinimaxBaseResponse {
  data?: {
    audio?: string
    status?: number
  }
}

/**
 * The API message for an outcome other than success, or an empty string when
 * the call succeeded. An absent status means the endpoint reported no outcome,
 * which is not a refusal.
 */
function minimaxRefusal(payload: MinimaxBaseResponse, fallbackMessage: string): string {
  const statusCode = payload.base_resp?.status_code
  if (statusCode === undefined || statusCode === MINIMAX_STATUS_OK)
    return ''

  return payload.base_resp?.status_msg || fallbackMessage
}

/** The API message from a failed HTTP response, when its body carries one. */
async function readMinimaxRefusal(response: Response, fallbackMessage: string): Promise<string> {
  let payload: MinimaxBaseResponse
  try {
    payload = await response.json() as MinimaxBaseResponse
  }
  catch {
    return fallbackMessage
  }

  return minimaxRefusal(payload, fallbackMessage) || fallbackMessage
}

/**
 * How the account answered a voice catalog request. A refusal and an
 * unreachable API stay apart, because only a refusal says anything about the
 * credentials.
 */
type VoiceCatalogOutcome
  = | { kind: 'ok', voices: VoiceInfo[] }
    | { kind: 'rejected', reason: string }
    | { kind: 'unreachable' }

interface MinimaxVoiceCatalog extends MinimaxBaseResponse {
  system_voice?: MinimaxVoiceEntry[]
  voice_cloning?: MinimaxVoiceEntry[]
  voice_generation?: MinimaxVoiceEntry[]
}

/**
 * Reads the account voice catalog from `POST /v1/get_voice`. The account holds
 * every system voice, plus cloned and generated voices.
 */
async function requestMinimaxVoices(config: MinimaxSpeechConfig): Promise<VoiceCatalogOutcome> {
  const apiKey = config.apiKey?.trim()
  if (!apiKey)
    return { kind: 'rejected', reason: 'API key is required.' }

  const baseUrl = (config.baseUrl || 'https://api.minimax.io').replace(/\/$/, '')

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/get_voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ voice_type: 'all' }),
    })
  }
  // Only the call itself is guarded. A refusal must reach the caller, because a
  // refused key and an unreachable API are different answers.
  catch {
    return { kind: 'unreachable' }
  }

  if (!response.ok)
    return { kind: 'rejected', reason: await readMinimaxRefusal(response, `MiniMax voice catalog request failed: ${response.status} ${response.statusText}`) }

  let payload: MinimaxVoiceCatalog
  try {
    payload = await response.json() as MinimaxVoiceCatalog
  }
  catch {
    return { kind: 'unreachable' }
  }

  const refusal = minimaxRefusal(payload, 'MiniMax rejected the voice catalog request.')
  if (refusal)
    return { kind: 'rejected', reason: refusal }

  const entries = [
    ...(payload.system_voice ?? []),
    ...(payload.voice_cloning ?? []),
    ...(payload.voice_generation ?? []),
  ]

  return {
    kind: 'ok',
    voices: entries
      .filter(entry => !!entry.voice_id)
      .map(entry => ({
        id: entry.voice_id as string,
        name: entry.voice_name || entry.voice_id as string,
        provider: 'minimax-speech',
        description: entry.description?.join(' '),
        languages: [resolveVoiceLanguage(entry.voice_id as string)],
      })),
  }
}

/**
 * Reports why the account refused these credentials, or an empty string when it
 * accepted them.
 *
 * A supplied key is not an authenticated one, and an unreachable API is not a
 * refusal. Only the payload tells the two apart, so this is the check that
 * separates "the user typed something" from "the account works".
 */
async function probeMinimaxCredentials(config: MinimaxSpeechConfig): Promise<string> {
  const outcome = await requestMinimaxVoices(config)
  return outcome.kind === 'rejected' ? outcome.reason : ''
}

interface MiniMaxUploadResponse extends MinimaxBaseResponse {
  file?: {
    file_id?: number | string
  }
}

interface MiniMaxVoiceCloneResponse extends MinimaxBaseResponse {
  voice_id?: string
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

async function parseJsonResponse<T extends MinimaxBaseResponse>(response: Response, operation: string): Promise<T> {
  if (!response.ok)
    throw new Error(await readMinimaxRefusal(response, `${operation} failed: ${response.status} ${response.statusText}`))

  const data = await response.json() as T
  const refusal = minimaxRefusal(data, `${operation} failed`)
  if (refusal)
    throw new Error(refusal)
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

async function collectStreamingAudio(body: ReadableStream<Uint8Array<ArrayBuffer>>) {
  // MiniMax streams SSE events that contain hex-encoded audio chunks.
  const audioChunks: Uint8Array[] = []
  let summaryAudio = ''
  const events = body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
  for await (const { data } of events) {
    if (!data || data === '[DONE]')
      continue

    let event: MinimaxStreamEvent
    try {
      event = JSON.parse(data) as MinimaxStreamEvent
    }
    catch {
      // A malformed SSE event does not invalidate earlier audio chunks.
      continue
    }

    // The HTTP status is already 200 by the time the stream opens, so
    // each event carries the outcome on its own. A refusal here must
    // not reach the player as silence.
    const refusal = minimaxRefusal(event, 'MiniMax rejected the synthesis request.')
    if (refusal)
      throw new Error(refusal)

    const audio = event.data?.audio
    if (audio) {
      if (event.data?.status === 2)
        summaryAudio = audio
      else
        audioChunks.push(hexToBytes(audio))
    }
  }

  // A summary supplies audio only when the stream contains no audio chunks.
  if (audioChunks.length === 0 && summaryAudio)
    audioChunks.push(hexToBytes(summaryAudio))

  const combined = combineAudioChunks(audioChunks)

  // A stream can end with no audio at all. Returning that as a success
  // presents an empty player with no error, which reads as a working
  // provider and hides the reason the request produced nothing.
  if (combined.byteLength === 0)
    throw new Error('MiniMax returned no audio for this request.')
  return combined
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
      signal: init.signal,
    })

    if (!response.ok)
      throw new Error(await readMinimaxRefusal(response, `MiniMax TTS request failed: ${response.status} ${response.statusText}`))

    if (stream) {
      if ((response.headers.get('content-type') ?? '').includes('application/json'))
        throw new Error(await readMinimaxRefusal(response, 'MiniMax rejected the synthesis request.'))
      if (!response.body)
        throw new Error('MiniMax TTS response has no body')
      const audio = await collectStreamingAudio(response.body)
      return new Response(audio.buffer as ArrayBuffer, {
        status: 200,
        headers: { 'Content-Type': AUDIO_MIME_BY_FORMAT[format] },
      })
    }

    const data = await parseJsonResponse<MinimaxStreamEvent>(response, 'MiniMax TTS request')
    const audio = data.data?.audio
    if (!audio)
      throw new Error('MiniMax TTS returned no audio data')

    if (outputFormat === 'url') {
      const audioResponse = await globalThis.fetch(audio, { signal: init.signal })
      if (!audioResponse.ok)
        throw new Error(`MiniMax TTS audio download failed: ${audioResponse.status} ${audioResponse.statusText}`)
      const downloadedAudio = await audioResponse.arrayBuffer()
      if (downloadedAudio.byteLength === 0)
        throw new Error('MiniMax returned no audio for this request.')
      return new Response(downloadedAudio, {
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

export const providerMinimaxSpeech = defineProvider<MinimaxSpeechConfig, 'minimax-speech'>({
  id: 'minimax-speech',
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
          const errors: Array<{ error: unknown }> = []

          if (!config.apiKey?.trim()) {
            errors.push({ error: new Error('API key is required.') })
          }
          else {
            // A nonempty key is a supplied key, not an authenticated one.
            const refusal = await probeMinimaxCredentials(config)
            if (refusal)
              errors.push({ error: new Error(refusal) })
          }

          return {
            errors,
            reason: errors.map(item => (item.error as Error).message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
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
    voiceCatalogConfig: () => ({}),
    listVoices: async (config) => {
      const outcome = await requestMinimaxVoices(config)

      // A refusal must not become a populated selector. The built-in list would
      // read as a working account and hide the rejected key.
      if (outcome.kind === 'rejected')
        throw new Error(outcome.reason)

      if (outcome.kind === 'unreachable')
        return builtinMinimaxVoices.map(voice => ({ ...voice, compatibleModels: [...MINIMAX_SPEECH_MODELS] }))

      // An account with no voices yet still needs entries to choose from.
      return (outcome.voices.length > 0 ? outcome.voices : builtinMinimaxVoices)
        .map(voice => ({ ...voice, compatibleModels: [...MINIMAX_SPEECH_MODELS] }))
    },
  },
})
