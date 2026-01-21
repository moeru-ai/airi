import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnElevenLabs, listVoices } from 'unspeech'
import { z } from 'zod'

import { models as elevenLabsModels } from '../../../../stores/providers/elevenlabs/list-models'
import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const elevenLabsConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').optional().default('https://unspeech.hyp3r.link/v1/'),
  voiceSettings: z.object({
    similarityBoost: z.number('Similarity Boost').optional().default(0.75),
    stability: z.number('Stability').optional().default(0.5),
  }).optional(),
})

type ElevenLabsConfig = z.input<typeof elevenLabsConfigSchema>

/**
 * ElevenLabs Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for ElevenLabs text-to-speech API.
 */
export const providerElevenLabsSpeech = defineProvider<ElevenLabsConfig>({
  id: 'elevenlabs',
  order: 2,
  name: 'ElevenLabs',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.elevenlabs.title'),
  description: 'elevenlabs.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.elevenlabs.description'),
  tasks: ['text-to-speech'],
  icon: 'i-simple-icons:elevenlabs',

  createProviderConfig: ({ t }) => elevenLabsConfigSchema.extend({
    apiKey: elevenLabsConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: elevenLabsConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createUnElevenLabs(apiKey, baseUrl) as SpeechProvider | SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'elevenlabs:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.elevenlabs.check-config.title'),
        validator: async (config: ElevenLabsConfig, _contextOptions: { t: ComposerTranslation }): Promise<ProviderValidationResult> => {
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
            reasonKey: errors.length > 0 ? 'elevenlabs:check-config:invalid' : '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
      return elevenLabsModels.map((model) => {
        return {
          id: model.model_id,
          name: model.name,
          provider: 'elevenlabs',
          description: model.description,
          contextLength: 0,
          deprecated: false,
        }
      })
    },

    async listVoices(_config, provider): Promise<VoiceInfo[]> {
      const voiceProvider = provider as unknown as VoiceProviderWithExtraOptions<UnElevenLabsOptions>

      const voices = await listVoices({
        ...voiceProvider.voice(),
      })

      // Find indices of Aria and Bill
      const ariaIndex = voices.findIndex(voice => voice.name.includes('Aria'))
      const billIndex = voices.findIndex(voice => voice.name.includes('Bill'))

      // Determine the range to move (ensure valid indices and proper order)
      const startIndex = ariaIndex !== -1 ? ariaIndex : 0
      const endIndex = billIndex !== -1 ? billIndex : voices.length - 1
      const lowerIndex = Math.min(startIndex, endIndex)
      const higherIndex = Math.max(startIndex, endIndex)

      // Rearrange voices: voices outside the range first, then voices within the range
      const rearrangedVoices = [
        ...voices.slice(0, lowerIndex),
        ...voices.slice(higherIndex + 1),
        ...voices.slice(lowerIndex, higherIndex + 1),
      ]

      return rearrangedVoices.map((voice) => {
        return {
          id: voice.id,
          name: voice.name,
          provider: 'elevenlabs',
          previewURL: voice.preview_audio_url,
          languages: voice.languages,
        }
      })
    },
  },
})

// Keep export for backward compatibility during migration
export const elevenLabsSpeechProvider = providerElevenLabsSpeech
