import { errorMessageFrom } from '@moeru/std'
import { createPlayer2 } from '@xsai-ext/providers/special/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const player2ConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:4315/v1/'),
})

type Player2Config = z.input<typeof player2ConfigSchema>
type Player2VoiceLanguage = keyof typeof player2VoiceLanguages

const player2VoiceLanguages = {
  american_english: { code: 'en', title: 'English' },
  british_english: { code: 'en', title: 'English' },
  japanese: { code: 'ja', title: 'Japanese' },
  mandarin_chinese: { code: 'zh', title: 'Chinese' },
  spanish: { code: 'es', title: 'Spanish' },
  french: { code: 'fr', title: 'French' },
  hindi: { code: 'hi', title: 'Hindi' },
  italian: { code: 'it', title: 'Italian' },
  brazilian_portuguese: { code: 'pt', title: 'Portuguese' },
} as const

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() ?? 'http://localhost:4315/v1/'
  return value.endsWith('/') ? value : `${value}/`
}

export const providerPlayer2Speech = defineProvider<Player2Config>({
  id: 'player2-speech',
  name: 'Player2 Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.player2.title'),
  description: 'player2.game',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.player2.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:player2',
  createProviderConfig: () => player2ConfigSchema,
  createProvider: config => createPlayer2(normalizeBaseUrl(config.baseUrl), 'airi'),
  validationRequiredWhen: config => Boolean(config.baseUrl?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'player2-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const valid = Boolean(config.baseUrl?.trim())
          const reason = valid ? '' : 'Base URL is required. Default to http://localhost:4315/v1/'
          return { errors: valid ? [] : [{ error: new Error(reason) }], reason, reasonKey: '', valid }
        },
      }),
    ],
    validateProvider: [
      ({ t }) => ({
        id: 'player2-speech:check-connectivity',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
        validator: async (config) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          try {
            const response = await fetch(new URL('health', normalizeBaseUrl(config.baseUrl)), {
              headers: { 'player2-game-key': 'airi' },
              signal: controller.signal,
            })
            if (!response.ok) {
              const reason = `Player2 speech unreachable: HTTP ${response.status} ${response.statusText}`
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }
          }
          catch (error) {
            const reason = `Player2 speech connection failed: ${errorMessageFrom(error) ?? 'Unknown error'}`
            return { errors: [{ error }], reason, reasonKey: '', valid: false }
          }
          finally {
            clearTimeout(timeout)
          }

          return { errors: [], reason: '', reasonKey: '', valid: true }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => [{
      id: 'player2-tts',
      name: 'Player2 Speech',
      provider: 'player2-speech',
      description: 'Default model for Player2 speech endpoint',
      contextLength: 0,
      deprecated: false,
    }],
    listVoices: async (config) => {
      const response = await fetch(new URL('tts/voices', normalizeBaseUrl(config.baseUrl)))
      const data = await response.json() as {
        voices?: Array<{ id: string, language: Player2VoiceLanguage, name: string, gender: string }>
      }
      return (data.voices ?? []).map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'player2-speech',
        gender: voice.gender,
        languages: [player2VoiceLanguages[voice.language]],
      }))
    },
  },
})
