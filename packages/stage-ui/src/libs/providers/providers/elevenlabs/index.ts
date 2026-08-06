import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { ListVoicesOptions, UnElevenLabsOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import { createUnElevenLabs, listVoices } from 'unspeech'
import { z } from 'zod'

import { models as elevenLabsModels } from '../../../../stores/providers/elevenlabs/list-models'
import { defineProvider } from '../registry'

const elevenLabsConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://unspeech.hyp3r.link/v1/'),
  voiceSettings: z.object({
    similarityBoost: z.number().default(0.75),
    stability: z.number().default(0.5),
  }).default({ similarityBoost: 0.75, stability: 0.5 }),
})

type ElevenLabsConfig = z.input<typeof elevenLabsConfigSchema>

function toListVoicesOptions(provider: VoiceProviderWithExtraOptions<UnElevenLabsOptions>): ListVoicesOptions {
  const { fetch: _fetch, ...voiceOptions } = provider.voice()
  return voiceOptions
}

function createElevenLabsValidators() {
  return {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'elevenlabs:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: ElevenLabsConfig) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = config.apiKey?.trim() ?? ''
          const baseUrl = config.baseUrl?.trim() ?? ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })

          if (!baseUrl) {
            errors.push({ error: new Error('Base URL is required.') })
          }
          else {
            try {
              if (!new URL(baseUrl).host)
                errors.push({ error: new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).') })
              else if (!baseUrl.endsWith('/'))
                errors.push({ error: new Error('Base URL must end with a trailing slash (/).') })
            }
            catch {
              errors.push({ error: new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).') })
            }
          }

          return {
            errors,
            reason: errors.map(item => (item.error as Error).message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  }
}

export const providerElevenLabs = defineProvider<ElevenLabsConfig>({
  id: 'elevenlabs',
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
    return createUnElevenLabs(config.apiKey.trim(), config.baseUrl?.trim() ?? 'https://unspeech.hyp3r.link/v1/') as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  },

  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createElevenLabsValidators(),
  extraMethods: {
    listModels: async () => elevenLabsModels.map(model => ({
      id: model.model_id,
      name: model.name,
      provider: 'elevenlabs',
      description: model.description,
      contextLength: 0,
      deprecated: false,
    })),
    listVoices: async (config) => {
      const provider = createUnElevenLabs(config.apiKey.trim(), config.baseUrl?.trim() ?? 'https://unspeech.hyp3r.link/v1/') as VoiceProviderWithExtraOptions<UnElevenLabsOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      if (!Array.isArray(voices))
        return []

      // Keep the default ElevenLabs voices together at the end of the list.
      const ariaIndex = voices.findIndex(voice => voice.name.includes('Aria'))
      const billIndex = voices.findIndex(voice => voice.name.includes('Bill'))
      const startIndex = ariaIndex !== -1 ? ariaIndex : 0
      const endIndex = billIndex !== -1 ? billIndex : voices.length - 1
      const lowerIndex = Math.min(startIndex, endIndex)
      const higherIndex = Math.max(startIndex, endIndex)
      const rearrangedVoices = [
        ...voices.slice(0, lowerIndex),
        ...voices.slice(higherIndex + 1),
        ...voices.slice(lowerIndex, higherIndex + 1),
      ]

      return rearrangedVoices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'elevenlabs',
        previewURL: voice.preview_audio_url,
        languages: voice.languages,
      }))
    },
  },
})
