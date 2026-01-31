import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { UnMicrosoftOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnMicrosoft, listVoices } from 'unspeech'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const microsoftSpeechConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default('https://unspeech.hyp3r.link/v1/'),
  region: z.string('Region').optional(),
})

type MicrosoftSpeechConfig = z.input<typeof microsoftSpeechConfigSchema>

/**
 * Microsoft / Azure Speech Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for Microsoft Azure Speech Services.
 */
export const providerMicrosoftSpeech = defineProvider<MicrosoftSpeechConfig>({
  id: 'microsoft-speech',
  order: 5,
  name: 'Microsoft / Azure Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.microsoft-speech.title'),
  description: 'speech.microsoft.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.microsoft-speech.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:microsoft',
  iconColor: 'i-lobe-icons:microsoft',

  createProviderConfig: ({ t }) => microsoftSpeechConfigSchema.extend({
    apiKey: microsoftSpeechConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: microsoftSpeechConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    region: microsoftSpeechConfigSchema.shape.region.meta({
      labelLocalized: t('settings.pages.providers.provider.microsoft-speech.config.region.label'),
      descriptionLocalized: t('settings.pages.providers.provider.microsoft-speech.config.region.description'),
      placeholderLocalized: t('settings.pages.providers.provider.microsoft-speech.config.region.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createUnMicrosoft(apiKey, baseUrl) as SpeechProvider | SpeechProviderWithExtraOptions<string, UnMicrosoftOptions>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'microsoft-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.microsoft-speech.check-config.title'),
        validator: async (config: MicrosoftSpeechConfig, _contextOptions: { t: ComposerTranslation }): Promise<ProviderValidationResult> => {
          const errors: Array<{ error: unknown, errorKey?: string }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })
          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })

          if (baseUrl) {
            if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0) {
              errors.push({ error: new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).') })
            }
            else if (!baseUrl.endsWith('/')) {
              errors.push({ error: new Error('Base URL must end with a trailing slash (/).') })
            }
          }

          const reason = errors.length > 0 ? errors.map(e => e.error instanceof Error ? e.error.message : String(e.error)).join(', ') : ''

          return {
            errors,
            reason,
            reasonKey: errors.length > 0 ? 'microsoft-speech:check-config:invalid' : '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
      return [
        {
          id: 'v1',
          name: 'v1',
          provider: 'microsoft-speech',
          description: '',
          contextLength: 0,
          deprecated: false,
        },
      ]
    },

    async listVoices(config, provider): Promise<VoiceInfo[]> {
      const voiceProvider = provider as unknown as VoiceProviderWithExtraOptions<UnMicrosoftOptions>
      const region = typeof config.region === 'string' ? config.region : undefined

      const voices = await listVoices({
        ...voiceProvider.voice({ region: region || 'eastus' }),
      })

      return voices.map((voice) => {
        return {
          id: voice.id,
          name: voice.name,
          provider: 'microsoft-speech',
          previewURL: voice.preview_audio_url,
          languages: voice.languages,
          gender: voice.labels?.gender,
        }
      })
    },
  },
})

// Keep export for backward compatibility during migration
export const microsoftSpeechProvider = providerMicrosoftSpeech
