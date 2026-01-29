import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { UnDeepgramOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import type { VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnDeepgram, listVoices } from 'unspeech'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const deepgramConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default('https://unspeech.hyp3r.link/v1/'),
})

type DeepgramConfig = z.input<typeof deepgramConfigSchema>

/**
 * Deepgram TTS Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for Deepgram text-to-speech API.
 */
export const providerDeepgramTTSSpeech = defineProvider<DeepgramConfig>({
  id: 'deepgram-tts',
  order: 4,
  name: 'Deepgram',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.deepgram-tts.title'),
  description: 'deepgram.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.deepgram-tts.description'),
  tasks: ['text-to-speech'],
  icon: 'i-simple-icons:deepgram',

  createProviderConfig: ({ t }) => deepgramConfigSchema.extend({
    apiKey: deepgramConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: deepgramConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createUnDeepgram(apiKey, baseUrl) as SpeechProvider | SpeechProviderWithExtraOptions<string, UnDeepgramOptions>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'deepgram-tts:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.deepgram-tts.check-config.title'),
        validator: async (config: DeepgramConfig, _contextOptions: { t: ComposerTranslation }): Promise<ProviderValidationResult> => {
          const errors: Array<{ error: unknown, errorKey?: string }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })

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
            reasonKey: errors.length > 0 ? 'deepgram-tts:check-config:invalid' : '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },

  extraMethods: {
    async listVoices(_config, provider): Promise<VoiceInfo[]> {
      const voiceProvider = provider as unknown as VoiceProviderWithExtraOptions<UnDeepgramOptions>

      const voices = await listVoices({
        ...voiceProvider.voice(),
      })

      return voices.map((voice) => {
        return {
          id: voice.id,
          name: voice.name,
          provider: 'deepgram-tts',
          description: voice.description,
          languages: voice.languages,
          gender: voice.labels?.gender,
        }
      })
    },
  },
})

// Keep export for backward compatibility during migration
export const deepgramTTSSpeechProvider = providerDeepgramTTSSpeech
