import { z } from 'zod'

import { defineProvider } from '../registry'

const minimaxSpeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.minimax.io'),
})

type MinimaxSpeechConfig = z.input<typeof minimaxSpeechConfigSchema>

export const providerMinimaxSpeech = defineProvider<MinimaxSpeechConfig>({
  createProvider(config) {
    const apiKey = config.apiKey.trim()
    const baseUrl = (config.baseUrl || 'https://api.minimax.io').replace(/\/$/, '')

    return {
      speech: () => ({
        baseURL: `${baseUrl}/v1/`,
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (!init?.body || typeof init.body !== 'string')
            throw new Error('Invalid request body')

          const body = JSON.parse(init.body) as { input?: string, model?: string, voice?: string }
          const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
            body: JSON.stringify({
              audio_setting: {
                bitrate: 128000,
                channel: 1,
                format: 'mp3',
                sample_rate: 32000,
              },
              model: body.model || 'speech-2.8-hd',
              stream: true,
              text: body.input ?? '',
              voice_setting: {
                pitch: 0,
                speed: 1,
                voice_id: body.voice || 'English_Graceful_Lady',
                vol: 1,
              },
            }),
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
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
            headers: { 'Content-Type': 'audio/mpeg' },
            status: 200,
          })
        },
        model: 'speech-2.8-hd',
      }),
    }
  },
  createProviderConfig: () => minimaxSpeechConfigSchema,
  description: 'minimax.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-speech.description'),
  extraMethods: {
    listModels: async () => [
      { deprecated: false, description: 'High-definition TTS model with natural prosody', id: 'speech-2.8-hd', name: 'Speech 2.8 HD', provider: 'minimax-speech' },
      { deprecated: false, description: 'Fast TTS model for low-latency scenarios', id: 'speech-2.8-turbo', name: 'Speech 2.8 Turbo', provider: 'minimax-speech' },
    ],
    listVoices: async () => [
      { gender: 'female', id: 'English_Graceful_Lady', languages: [{ code: 'en', title: 'English' }], name: 'Graceful Lady', provider: 'minimax-speech' },
      { gender: 'male', id: 'English_Insightful_Speaker', languages: [{ code: 'en', title: 'English' }], name: 'Insightful Speaker', provider: 'minimax-speech' },
      { gender: 'female', id: 'English_radiant_girl', languages: [{ code: 'en', title: 'English' }], name: 'Radiant Girl', provider: 'minimax-speech' },
      { gender: 'male', id: 'English_Persuasive_Man', languages: [{ code: 'en', title: 'English' }], name: 'Persuasive Man', provider: 'minimax-speech' },
      { gender: 'neutral', id: 'English_Lucky_Robot', languages: [{ code: 'en', title: 'English' }], name: 'Lucky Robot', provider: 'minimax-speech' },
      { gender: 'neutral', id: 'English_expressive_narrator', languages: [{ code: 'en', title: 'English' }], name: 'Expressive Narrator', provider: 'minimax-speech' },
      { gender: 'female', id: 'Mandarin_Gentle_Woman', languages: [{ code: 'zh', title: 'Chinese' }], name: 'Gentle Woman', provider: 'minimax-speech' },
      { gender: 'male', id: 'Mandarin_Steadfast_Man', languages: [{ code: 'zh', title: 'Chinese' }], name: 'Steadfast Man', provider: 'minimax-speech' },
      { gender: 'female', id: 'Mandarin_Sweet_Girl', languages: [{ code: 'zh', title: 'Chinese' }], name: 'Sweet Girl', provider: 'minimax-speech' },
      { gender: 'male', id: 'Mandarin_Magnetic_Gentleman', languages: [{ code: 'zh', title: 'Chinese' }], name: 'Magnetic Gentleman', provider: 'minimax-speech' },
    ],
  },
  icon: 'i-lobe-icons:minimax',
  iconColor: 'i-lobe-icons:minimax-color',
  id: 'minimax-speech',
  name: 'MiniMax Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-speech.title'),
  tasks: ['text-to-speech'],
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
})
