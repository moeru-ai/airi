import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { UnAlibabaCloudOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnAlibabaCloud, listVoices } from 'unspeech'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const alibabaCloudModelStudioConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default('https://unspeech.hyp3r.link/v1/'),
})

type AlibabaCloudModelStudioConfig = z.input<typeof alibabaCloudModelStudioConfigSchema>

/**
 * Alibaba Cloud Model Studio Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for Alibaba Cloud Model Studio text-to-speech API.
 */
export const providerAlibabaCloudModelStudioSpeech = defineProvider<AlibabaCloudModelStudioConfig>({
  id: 'alibaba-cloud-model-studio',
  order: 7,
  name: 'Alibaba Cloud Model Studio',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-model-studio.title'),
  description: 'bailian.console.aliyun.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-model-studio.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:alibabacloud',

  createProviderConfig: ({ t }) => alibabaCloudModelStudioConfigSchema.extend({
    apiKey: alibabaCloudModelStudioConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: alibabaCloudModelStudioConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createUnAlibabaCloud(apiKey, baseUrl) as SpeechProvider | SpeechProviderWithExtraOptions<string, UnAlibabaCloudOptions>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'alibaba-cloud-model-studio:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.alibaba-cloud-model-studio.check-config.title'),
        validator: async (config: AlibabaCloudModelStudioConfig, _contextOptions: { t: ComposerTranslation }): Promise<ProviderValidationResult> => {
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
            reasonKey: errors.length > 0 ? 'alibaba-cloud-model-studio:check-config:invalid' : '',
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
          id: 'cosyvoice-v1',
          name: 'CosyVoice',
          provider: 'alibaba-cloud-model-studio',
          description: '',
          contextLength: 0,
          deprecated: false,
        },
        {
          id: 'cosyvoice-v2',
          name: 'CosyVoice (New)',
          provider: 'alibaba-cloud-model-studio',
          description: '',
          contextLength: 0,
          deprecated: false,
        },
      ]
    },

    async listVoices(_config, provider): Promise<VoiceInfo[]> {
      const voiceProvider = provider as unknown as VoiceProviderWithExtraOptions<UnAlibabaCloudOptions>

      const voices = await listVoices({
        ...voiceProvider.voice(),
      })

      return voices.map((voice) => {
        return {
          id: voice.id,
          name: voice.name,
          provider: 'alibaba-cloud-model-studio',
          compatibleModels: voice.compatible_models,
          previewURL: voice.preview_audio_url,
          languages: voice.languages,
          gender: voice.labels?.gender,
        }
      })
    },
  },
})

// Keep export for backward compatibility during migration
export const alibabaCloudModelStudioSpeechProvider = providerAlibabaCloudModelStudioSpeech
