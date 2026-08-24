import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { z } from 'zod'

import { defineProvider } from '../registry'

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/'
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts'

const googleGeminiSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
})

type GoogleGeminiSpeechConfig = z.input<typeof googleGeminiSpeechConfigSchema>

const googleGeminiTtsModels = [
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
] as const

const googleGeminiTtsVoices: Array<[string, string]> = [
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

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || DEFAULT_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

function decodeBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

function createAudioFetch(apiKey: string, baseUrl: string) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.body || typeof init.body !== 'string')
      throw new Error('Invalid request body')

    const body = JSON.parse(init.body) as {
      input?: string
      model?: string
      voice?: string
      temperature?: number
    }
    if (!body.input)
      throw new Error('Missing input text for Gemini TTS')
    if (!body.model)
      throw new Error('Missing model for Gemini TTS')

    const response = await globalThis.fetch(new URL(`models/${body.model}:generateContent`, baseUrl), {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: body.input }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: body.voice || 'Kore' } },
          },
          ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        },
      }),
    })
    if (!response.ok)
      throw new Error(`Gemini TTS request failed: ${response.status} ${await response.text().catch(() => '')}`)

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>
    }
    const audio = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData?.data
    if (!audio)
      throw new Error('Gemini TTS response missing audio data')

    return new Response(toWavFromPCM16(decodeBase64(audio), 24000), {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    })
  }
}

export const providerGoogleGeminiAudioSpeech = defineProvider<GoogleGeminiSpeechConfig>({
  id: 'google-gemini-audio-speech',
  name: 'Google Gemini',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.google-gemini-audio-speech.title'),
  description: 'aistudio.google.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.google-gemini-audio-speech.description'),
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-lobe-icons:gemini',
  iconColor: 'i-lobe-icons:gemini-color',
  createProviderConfig: () => googleGeminiSpeechConfigSchema,
  createProvider(config) {
    const apiKey = config.apiKey.trim()
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    return {
      speech: (model?: string, options?: Record<string, unknown>) => ({
        baseURL: baseUrl,
        fetch: createAudioFetch(apiKey, baseUrl),
        ...options,
        model: model || (typeof options?.model === 'string' ? options.model : DEFAULT_MODEL),
      }),
    }
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'google-gemini-audio-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const valid = Boolean(config.apiKey?.trim())
          return {
            errors: valid ? [] : [{ error: new Error('API Key is required.') }],
            reason: valid ? '' : 'API Key is required.',
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => googleGeminiTtsModels.map(id => ({
      id,
      name: id.split('-').map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(' '),
      provider: 'google-gemini-audio-speech',
      description: 'Gemini API text-to-speech model',
      capabilities: ['text-to-speech'],
    })),
    listVoices: async () => googleGeminiTtsVoices.map(([id, style]) => ({
      id,
      name: id,
      provider: 'google-gemini-audio-speech',
      description: style,
      languages: [{ code: 'auto', title: 'Auto' }],
      compatibleModels: [...googleGeminiTtsModels],
    })),
  },
})
