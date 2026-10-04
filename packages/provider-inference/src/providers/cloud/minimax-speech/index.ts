import type { VoiceInfo } from '../../../types'

import { z } from 'zod'

import { defineProvider } from '../../registry'

const minimaxSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.minimax.io'),
})

type MinimaxSpeechConfig = z.input<typeof minimaxSpeechConfigSchema>

/**
 * The synthesis model used when the caller names none. The settings page and
 * the Speech module both name a model, so this covers a bare provider call.
 */
const DEFAULT_SPEECH_MODEL = 'speech-2.8-hd'

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
 * Reads the account voice catalog from `POST /v1/get_voice`. The account holds
 * every system voice, plus cloned and generated voices.
 * Returns an empty list when the API key is missing or the call fails.
 */
async function fetchMinimaxVoices(config: MinimaxSpeechConfig): Promise<VoiceInfo[]> {
  const apiKey = config.apiKey?.trim()
  if (!apiKey)
    return []

  const baseUrl = (config.baseUrl || 'https://api.minimax.io').replace(/\/$/, '')

  try {
    const response = await fetch(`${baseUrl}/v1/get_voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ voice_type: 'all' }),
    })

    if (!response.ok)
      return []

    const payload = await response.json() as {
      system_voice?: MinimaxVoiceEntry[]
      voice_cloning?: MinimaxVoiceEntry[]
      voice_generation?: MinimaxVoiceEntry[]
    }

    const entries = [
      ...(payload.system_voice ?? []),
      ...(payload.voice_cloning ?? []),
      ...(payload.voice_generation ?? []),
    ]

    return entries
      .filter(entry => !!entry.voice_id)
      .map(entry => ({
        id: entry.voice_id as string,
        name: entry.voice_name || entry.voice_id as string,
        provider: 'minimax-speech',
        description: entry.description?.join(' '),
        languages: [resolveVoiceLanguage(entry.voice_id as string)],
      }))
  }
  // The built-in voices keep the page usable when the account call fails.
  catch {
    return []
  }
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
    const apiKey = config.apiKey.trim()
    const baseUrl = (config.baseUrl || 'https://api.minimax.io').replace(/\/$/, '')

    return {
      // The caller owns the model choice. Returning a fixed one made the page
      // selector ineffective, because the request ignored the chosen model.
      speech: (model: string) => ({
        baseURL: `${baseUrl}/v1/`,
        model: model || DEFAULT_SPEECH_MODEL,
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (!init?.body || typeof init.body !== 'string')
            throw new Error('Invalid request body')

          const body = JSON.parse(init.body) as { input?: string, voice?: string, model?: string }
          const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: body.model || DEFAULT_SPEECH_MODEL,
              text: body.input ?? '',
              stream: true,
              voice_setting: {
                voice_id: body.voice || 'English_Graceful_Lady',
                speed: 1,
                vol: 1,
                pitch: 0,
              },
              audio_setting: {
                sample_rate: 32000,
                bitrate: 128000,
                format: 'mp3',
                channel: 1,
              },
            }),
          })

          if (!response.ok || !response.body)
            throw new Error(`MiniMax TTS request failed: ${response.status} ${response.statusText}`)

          // MiniMax streams SSE events that contain hex-encoded audio chunks.
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

              const json = line.slice(5).trim()
              if (!json || json === '[DONE]')
                continue

              try {
                const event = JSON.parse(json) as { data?: { audio?: string, status?: number } }
                // Status 2 is the final summary. Its audio duplicates prior chunks.
                if (event.data?.audio && event.data.status !== 2) {
                  const bytes = new Uint8Array(event.data.audio.length / 2)
                  for (let index = 0; index < event.data.audio.length; index += 2)
                    bytes[index / 2] = Number.parseInt(event.data.audio.slice(index, index + 2), 16)
                  audioChunks.push(bytes)
                }
              }
              catch {
                // A malformed SSE event does not invalidate earlier audio chunks.
              }
            }
          }

          const combined = new Uint8Array(audioChunks.reduce((sum, chunk) => sum + chunk.length, 0))
          let offset = 0
          for (const chunk of audioChunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }

          return new Response(combined.buffer, {
            status: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
          })
        },
      }),
    }
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
    listModels: async () => [
      { id: 'speech-2.8-hd', name: 'Speech 2.8 HD', provider: 'minimax-speech', description: 'High-definition TTS model with natural prosody', deprecated: false },
      { id: 'speech-2.8-turbo', name: 'Speech 2.8 Turbo', provider: 'minimax-speech', description: 'Fast TTS model for low-latency scenarios', deprecated: false },
    ],
    voiceCatalogConfig: () => ({}),
    listVoices: async (config) => {
      const voices = await fetchMinimaxVoices(config)
      return voices.length > 0 ? voices : builtinMinimaxVoices
    },
  },
})
