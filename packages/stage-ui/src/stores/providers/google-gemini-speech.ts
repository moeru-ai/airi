import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ModelInfo, ProviderMetadata, VoiceInfo } from '../providers'

const PROVIDER_ID = 'google-gemini-audio-speech'
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts'

const GOOGLE_GEMINI_TTS_MODELS = [
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
] as const

const GOOGLE_GEMINI_TTS_VOICES: [string, string][] = [
  ['Zephyr', 'Bright'],
  ['Puck', 'Upbeat'],
  ['Charon', 'Informative'],
  ['Kore', 'Firm'],
  ['Fenrir', 'Excitable'],
  ['Leda', 'Youthful'],
  ['Orus', 'Firm'],
  ['Aoede', 'Breezy'],
  ['Callirrhoe', 'Easy-going'],
  ['Autonoe', 'Bright'],
  ['Enceladus', 'Breathy'],
  ['Iapetus', 'Clear'],
  ['Umbriel', 'Easy-going'],
  ['Algieba', 'Smooth'],
  ['Despina', 'Smooth'],
  ['Erinome', 'Clear'],
  ['Algenib', 'Gravelly'],
  ['Rasalgethi', 'Informative'],
  ['Laomedeia', 'Upbeat'],
  ['Achernar', 'Soft'],
  ['Alnilam', 'Firm'],
  ['Schedar', 'Even'],
  ['Gacrux', 'Mature'],
  ['Pulcherrima', 'Forward'],
  ['Achird', 'Friendly'],
  ['Zubenelgenubi', 'Casual'],
  ['Vindemiatrix', 'Gentle'],
  ['Sadachbia', 'Lively'],
  ['Sadaltager', 'Knowledgeable'],
  ['Sulafat', 'Warm'],
]

/** Wraps raw PCM16 mono data in a minimal WAV container. */
function wrapPCM16InWAV(pcmBytes: Uint8Array, sampleRate = 24000): Uint8Array {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const header = new ArrayBuffer(44)
  const view = new DataView(header)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + pcmBytes.length, true)
  writeStr(8, 'WAVE')

  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  writeStr(36, 'data')
  view.setUint32(40, pcmBytes.length, true)

  const wav = new Uint8Array(44 + pcmBytes.length)
  wav.set(new Uint8Array(header), 0)
  wav.set(pcmBytes, 44)
  return wav
}

/** Decodes a base64 string into a Uint8Array. */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++)
    bytes[i] = binaryString.charCodeAt(i)
  return bytes
}

function normalizeBaseUrl(value: unknown): string {
  let base = typeof value === 'string' ? value.trim() : ''
  if (!base)
    base = DEFAULT_BASE_URL
  if (!base.endsWith('/'))
    base += '/'
  return base
}

function normalizeApiKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Custom fetch adapter that translates an OpenAI-compatible TTS request
 * into a Gemini generateContent call with AUDIO response modality.
 */
function createAudioFetch(apiKey: string, baseUrl: string) {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!init?.body || typeof init.body !== 'string')
      throw new Error('Invalid request body')

    const body = JSON.parse(init.body)
    const model = body.model as string
    const input = body.input as string
    const temperature = typeof body.temperature === 'number' ? body.temperature : undefined

    if (!input)
      throw new Error('Missing input text for Gemini TTS')
    if (!model)
      throw new Error('Missing model for Gemini TTS')

    function buildGenerationConfig(): Record<string, unknown> {
      const voiceConfig: Record<string, unknown> = {
        prebuiltVoiceConfig: {
          voiceName: (body.voice as string) || 'Kore',
        },
      }

      return {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig },
        ...(temperature !== undefined ? { temperature } : {}),
      }
    }

    const response = await globalThis.fetch(`${baseUrl}models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: input },
            ],
          },
        ],
        generationConfig: buildGenerationConfig(),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Gemini TTS request failed: ${response.status} ${errorText}`)
    }

    const json = await response.json()
    const audioBase64 = json.candidates?.[0]?.content?.parts?.find(
      (part: { inlineData?: { data?: string } }) => part.inlineData,
    )?.inlineData?.data

    if (!audioBase64) {
      throw new Error('Gemini TTS response missing audio data')
    }

    const pcmBytes = base64ToBytes(audioBase64)
    const wavBytes = wrapPCM16InWAV(pcmBytes)

    // NOTICE: wrapPCM16InWAV always creates a fresh Uint8Array, so .buffer is the full
    // backing ArrayBuffer (not a subarray view into a larger buffer). The `as ArrayBuffer`
    // cast is needed because .buffer returns ArrayBufferLike in newer TypeScript.
    return new Response(wavBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    })
  }
}

function createSpeechProvider(apiKey: string, baseUrl: string): SpeechProviderWithExtraOptions<string, Record<string, unknown>> {
  return {
    speech: (model?: string, options?: Record<string, unknown>) => ({
      baseURL: `${baseUrl}`,
      fetch: createAudioFetch(apiKey, baseUrl),
      ...options,
      model: model || (options?.model as string | undefined) || DEFAULT_MODEL,
    }),
  }
}

function listModels(): ModelInfo[] {
  return GOOGLE_GEMINI_TTS_MODELS.map(id => ({
    id,
    name: id
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    provider: PROVIDER_ID,
    description: 'Gemini API text-to-speech model',
    capabilities: ['text-to-speech'],
  } satisfies ModelInfo))
}

function listVoices(): VoiceInfo[] {
  return GOOGLE_GEMINI_TTS_VOICES.map(([voiceName, style]) => ({
    id: voiceName,
    name: voiceName,
    provider: PROVIDER_ID,
    description: style,
    languages: [{ code: 'auto', title: 'Auto' }],
    compatibleModels: [...GOOGLE_GEMINI_TTS_MODELS],
  } satisfies VoiceInfo))
}

export function buildGoogleGeminiSpeechProvider(
  baseUrlValidator: (baseUrl: unknown) => { errors: unknown[], reason: string, valid: boolean } | null | undefined,
): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    category: 'speech',
    tasks: ['text-to-speech', 'tts'],
    nameKey: 'settings.pages.providers.provider.google-gemini-audio-speech.title',
    name: 'Google Gemini',
    descriptionKey: 'settings.pages.providers.provider.google-gemini-audio-speech.description',
    description: 'aistudio.google.com',
    icon: 'i-lobe-icons:gemini',
    iconColor: 'i-lobe-icons:gemini-color',
    defaultOptions: () => ({
      baseUrl: `${DEFAULT_BASE_URL}/`,
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
        const errors: Error[] = []
        if (!normalizeApiKey(config.apiKey))
          errors.push(new Error('API Key is required.'))

        if (config.baseUrl) {
          const res = baseUrlValidator(config.baseUrl)
          if (res)
            return res
        }

        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: errors.length === 0,
        }
      },
    },
  }
}
