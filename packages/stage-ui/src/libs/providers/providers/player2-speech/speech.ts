import type {
  SpeechProvider,
} from '@xsai-ext/providers/utils'
import type { ComposerTranslation } from 'vue-i18n'

import type { VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../../base-types'

import { isUrl } from '@proj-airi/stage-shared'
import { createPlayer2 } from '@xsai-ext/providers/special/create'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const player2ConfigSchema = z.object({
  baseUrl: z.string('Base URL').optional().default('http://localhost:4315/v1/'),
})

type Player2Config = z.input<typeof player2ConfigSchema>

const languageMap: Record<string, { code: string, title: string }> = {
  american_english: { code: 'en', title: 'English' },
  british_english: { code: 'en', title: 'English' },
  japanese: { code: 'ja', title: 'Japanese' },
  mandarin_chinese: { code: 'zh', title: 'Chinese' },
  spanish: { code: 'es', title: 'Spanish' },
  french: { code: 'fr', title: 'French' },
  hindi: { code: 'hi', title: 'Hindi' },
  italian: { code: 'it', title: 'Italian' },
  brazilian_portuguese: { code: 'pt', title: 'Portuguese' },
}

/**
 * Player2 Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for Player2 text-to-speech API.
 */
export const providerPlayer2Speech = defineProvider<Player2Config>({
  id: 'player2-speech',
  order: 9,
  name: 'Player2 Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.player2.title'),
  description: 'player2.game',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.player2.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:player2',

  createProviderConfig: ({ t }) => player2ConfigSchema.extend({
    baseUrl: player2ConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

    return createPlayer2(baseUrl, 'airi') as SpeechProvider
  },

  validationRequiredWhen(config) {
    return !!config.baseUrl?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'player2-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.player2-speech.check-config.title'),
        validator: async (config: Player2Config): Promise<ProviderValidationResult> => {
          const errors: Error[] = []
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl) {
            errors.push(new Error('Base URL is required. Default to http://localhost:4315/v1/'))
          }

          if (baseUrl) {
            if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0) {
              errors.push(new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).'))
            }
            else if (!baseUrl.endsWith('/')) {
              errors.push(new Error('Base URL must end with a trailing slash (/).'))
            }
          }

          return {
            errors,
            reason: errors.length > 0 ? errors.map(e => e.message).join(', ') : '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },

  extraMethods: {
    async listVoices(config, _provider): Promise<VoiceInfo[]> {
      const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

      const response = await fetch(`${normalizedUrl}/tts/voices`)
      const { voices } = await response.json()

      const voiceList = voices as Array<{
        id: string
        language: keyof typeof languageMap
        name: string
        gender: string
      }>

      return voiceList.map(({ id, language, name, gender }) => ({
        id,
        name,
        provider: 'player2-speech',
        gender,
        languages: languageMap[language] ? [languageMap[language]] : [],
      }))
    },
  },
})

// Keep export for backward compatibility during migration
export const player2SpeechProvider = providerPlayer2Speech
