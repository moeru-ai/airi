import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ModelInfo, ProviderMetadata, VoiceInfo } from '../providers'

const PROVIDER_ID = 'minimax-speech'

// Global (minimax.io) and CN (minimaxi.com) share the same request shape and only
// differ by host, so the region is selected purely through the configured base URL.
// The default targets the global endpoint; CN users point baseUrl at api.minimaxi.com.
const DEFAULT_BASE_URL = 'https://api.minimax.io'
const DEFAULT_MODEL = 'speech-2.8-hd'
const DEFAULT_VOICE = 'English_Graceful_Lady'

// Current MiniMax T2A model catalog. `hd` favours prosody quality, `turbo` favours latency.
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

// Supported synthesis output containers accepted by the `audio_setting.format` field.
const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'flac', 'pcm'] as const
type AudioFormat = (typeof SUPPORTED_AUDIO_FORMATS)[number]

const MINIMAX_SPEECH_VOICES: Array<{ id: string, name: string, gender: string, code: string, title: string }> = [
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
]

const AUDIO_MIME_BY_FORMAT: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  pcm: 'audio/L16',
}

/** Shape of a single `t2a_v2` streaming SSE event that this adapter relies on. */
interface T2AStreamEvent {
  data?: {
    /** Hex-encoded audio payload for this chunk. */
    audio?: string
    /** 2 marks the final summary chunk, which repeats the full audio and must be skipped. */
    status?: number
  }
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

function normalizeBaseUrl(value: unknown): string {
  const base = typeof value === 'string' ? value.trim() : ''
  return (base || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function normalizeApiKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFormat(value: unknown): AudioFormat {
  const format = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (SUPPORTED_AUDIO_FORMATS as readonly string[]).includes(format) ? format as AudioFormat : 'mp3'
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Turns a model id such as `speech-02-hd` into a display name `Speech 02 HD`. */
function formatModelName(id: string): string {
  return id
    .split('-')
    .map((segment) => {
      if (/^\d/.test(segment))
        return segment // version segment such as 2.8 or 02, keep verbatim
      if (segment === 'hd')
        return 'HD'
      return segment.charAt(0).toUpperCase() + segment.slice(1)
    })
    .join(' ')
}

/** Decodes a hex string (MiniMax streams audio as hex) into raw bytes. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2))
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

/**
 * Reads a synthesis control from the request body first and the stored provider
 * options second. The body wins because per-request `extraBody` overrides should
 * take precedence over the persisted provider configuration.
 */
function pickField(body: Record<string, unknown>, options: Record<string, unknown>, key: string): unknown {
  return body[key] ?? options[key]
}

/**
 * Custom fetch adapter that translates an OpenAI-compatible TTS request into a
 * MiniMax `t2a_v2` streaming call, decodes the hex audio chunks, and returns a
 * single audio Response.
 *
 * Request fields (`voice_setting`, `audio_setting`, `language_boost`,
 * `pronunciation_dict`, `voice_modify`, `subtitle_enable`, output format) are
 * configurable through the request body or the stored provider options and fall
 * back to MiniMax defaults when unset.
 */
function createAudioFetch(apiKey: string, baseUrl: string, options: Record<string, unknown>) {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!init?.body || typeof init.body !== 'string')
      throw new Error('Invalid request body')

    const body = JSON.parse(init.body) as Record<string, unknown>
    const text = body.input as string
    if (!text)
      throw new Error('Missing input text for MiniMax TTS')

    const voiceId = (body.voice as string) || (options.voice as string) || DEFAULT_VOICE
    const model = (body.model as string) || (options.model as string) || DEFAULT_MODEL
    const format = normalizeFormat(pickField(body, options, 'format') ?? body.response_format)

    const requestBody: Record<string, unknown> = {
      model,
      text,
      // Streaming keeps memory bounded for long inputs; hex chunks are reassembled below.
      stream: true,
      output_format: 'hex',
      voice_setting: {
        voice_id: voiceId,
        speed: toNumber(pickField(body, options, 'speed'), 1),
        vol: toNumber(pickField(body, options, 'vol') ?? pickField(body, options, 'volume'), 1),
        pitch: toNumber(pickField(body, options, 'pitch'), 0),
      },
      audio_setting: {
        sample_rate: toNumber(pickField(body, options, 'sample_rate'), 32000),
        bitrate: toNumber(pickField(body, options, 'bitrate'), 128000),
        format,
        channel: toNumber(pickField(body, options, 'channel'), 1),
      },
    }

    // Optional fields are only forwarded when explicitly provided so MiniMax applies its own defaults otherwise.
    const languageBoost = pickField(body, options, 'language_boost')
    if (typeof languageBoost === 'string' && languageBoost)
      requestBody.language_boost = languageBoost

    const subtitleEnable = pickField(body, options, 'subtitle_enable')
    if (typeof subtitleEnable === 'boolean')
      requestBody.subtitle_enable = subtitleEnable

    const pronunciationDict = pickField(body, options, 'pronunciation_dict')
    if (pronunciationDict && typeof pronunciationDict === 'object')
      requestBody.pronunciation_dict = pronunciationDict

    const voiceModify = pickField(body, options, 'voice_modify')
    if (voiceModify && typeof voiceModify === 'object')
      requestBody.voice_modify = voiceModify

    const response = await globalThis.fetch(`${baseUrl}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok || !response.body)
      throw new Error(`MiniMax TTS request failed: ${response.status} ${response.statusText}`)

    // Parse the SSE stream, surface MiniMax business errors, and collect hex audio chunks.
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const audioChunks: Uint8Array[] = []
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:'))
          continue
        const jsonStr = line.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]')
          continue

        let event: T2AStreamEvent
        try {
          event = JSON.parse(jsonStr)
        }
        catch {
          continue // ignore malformed SSE events
        }

        // MiniMax reports failures through base_resp.status_code; anything non-zero is a hard error.
        const statusCode = event.base_resp?.status_code
        if (typeof statusCode === 'number' && statusCode !== 0) {
          const statusMsg = event.base_resp?.status_msg
          throw new Error(`MiniMax TTS request failed: ${statusMsg || `status_code ${statusCode}`}`)
        }

        // status 2 is the final summary chunk; skip it to avoid duplicating the audio payload.
        const audio = event.data?.audio
        if (typeof audio === 'string' && audio && event.data?.status !== 2)
          audioChunks.push(hexToBytes(audio))
      }
    }

    if (audioChunks.length === 0)
      throw new Error('MiniMax TTS returned no audio data')

    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of audioChunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    return new Response(combined.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': AUDIO_MIME_BY_FORMAT[format] },
    })
  }
}

function createSpeechProvider(apiKey: string, baseUrl: string): SpeechProviderWithExtraOptions<string, Record<string, unknown>> {
  return {
    speech: (model?: string, options?: Record<string, unknown>) => {
      const resolvedOptions = options ?? {}
      return {
        baseURL: `${baseUrl}/v1/`,
        fetch: createAudioFetch(apiKey, baseUrl, resolvedOptions),
        ...resolvedOptions,
        model: model || (resolvedOptions.model as string | undefined) || DEFAULT_MODEL,
      }
    },
  }
}

function listModels(): ModelInfo[] {
  return MINIMAX_SPEECH_MODELS.map(id => ({
    id,
    name: formatModelName(id),
    provider: PROVIDER_ID,
    description: id.endsWith('-turbo')
      ? 'Fast TTS model for low-latency scenarios'
      : 'High-definition TTS model with natural prosody',
    contextLength: 0,
    deprecated: false,
    capabilities: ['text-to-speech'],
  } satisfies ModelInfo))
}

function listVoices(): VoiceInfo[] {
  return MINIMAX_SPEECH_VOICES.map(voice => ({
    id: voice.id,
    name: voice.name,
    provider: PROVIDER_ID,
    gender: voice.gender,
    languages: [{ code: voice.code, title: voice.title }],
    compatibleModels: [...MINIMAX_SPEECH_MODELS],
  } satisfies VoiceInfo))
}

/**
 * Builds the MiniMax Speech (text-to-speech) provider metadata.
 *
 * The provider speaks MiniMax's `t2a_v2` API and works against both the global
 * (api.minimax.io) and CN (api.minimaxi.com) endpoints, selected through the
 * configured base URL.
 */
export function buildMiniMaxSpeechProvider(): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    category: 'speech',
    tasks: ['text-to-speech'],
    nameKey: 'settings.pages.providers.provider.minimax-speech.title',
    name: 'MiniMax Speech',
    descriptionKey: 'settings.pages.providers.provider.minimax-speech.description',
    description: 'minimax.io',
    icon: 'i-lobe-icons:minimax',
    iconColor: 'i-lobe-icons:minimax-color',
    defaultOptions: () => ({
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL,
    }),
    createProvider: async (config: Record<string, unknown>) => {
      const apiKey = normalizeApiKey(config.apiKey)
      const baseUrl = normalizeBaseUrl(config.baseUrl)
      return createSpeechProvider(apiKey, baseUrl)
    },
    capabilities: {
      listModels: async () => listModels(),
      listVoices: async () => listVoices(),
    },
    validators: {
      chatPingCheckAvailable: false,
      validateProviderConfig: (config: Record<string, unknown>) => {
        const errors = [
          !config.apiKey && new Error('API key is required.'),
        ].filter(Boolean)

        return {
          errors,
          reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
          valid: !!config.apiKey,
        }
      },
    },
  }
}
