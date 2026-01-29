import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { UnVolcengineOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnVolcengine, listVoices } from 'unspeech'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const volcengineConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default('https://unspeech.hyp3r.link/v1/'),
  app: z.object({
    appId: z.string('App ID'),
  }).optional(),
})

type VolcengineConfig = z.input<typeof volcengineConfigSchema>

/**
 * Volcengine Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for Volcengine text-to-speech API.
 */
export const providerVolcengineSpeech = defineProvider<VolcengineConfig>({
  id: 'volcengine',
  order: 8,
  name: 'Volcengine',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine.title'),
  description: 'volcengine.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:volcengine',

  createProviderConfig: ({ t }) => volcengineConfigSchema.extend({
    apiKey: volcengineConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: volcengineConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    app: z.object({
      appId: z.string('App ID').meta({
        labelLocalized: t('settings.pages.providers.provider.volcengine.config.app.app-id.label'),
        descriptionLocalized: t('settings.pages.providers.provider.volcengine.config.app.app-id.description'),
        placeholderLocalized: t('settings.pages.providers.provider.volcengine.config.app.app-id.placeholder'),
      }),
    }).optional(),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createUnVolcengine(apiKey, baseUrl) as SpeechProvider | SpeechProviderWithExtraOptions<string, UnVolcengineOptions>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'volcengine:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.volcengine.check-config.title'),
        validator: async (config: VolcengineConfig, _contextOptions: { t: ComposerTranslation }): Promise<ProviderValidationResult> => {
          const errors: Array<{ error: unknown, errorKey?: string }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
          const app = config.app as { appId?: string } | undefined
          const appId = app?.appId

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })
          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })
          if (!appId)
            errors.push({ error: new Error('App ID is required.') })

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
            reasonKey: errors.length > 0 ? 'volcengine:check-config:invalid' : '',
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
          provider: 'volcano-engine',
          description: '',
          contextLength: 0,
          deprecated: false,
        },
      ]
    },

    async listVoices(_config, provider): Promise<VoiceInfo[]> {
      const voiceProvider = provider as unknown as VoiceProviderWithExtraOptions<UnVolcengineOptions>

      const voices = await listVoices({
        ...voiceProvider.voice(),
      })

      return voices.map((voice) => {
        return {
          id: voice.id,
          name: voice.name,
          provider: 'volcano-engine',
          previewURL: voice.preview_audio_url,
          languages: voice.languages,
          gender: voice.labels?.gender,
        }
      })
    },
  },
})

// Keep export for backward compatibility during migration
export const volcengineSpeechProvider = providerVolcengineSpeech
