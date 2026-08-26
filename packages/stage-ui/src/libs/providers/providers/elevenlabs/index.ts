import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { ListVoicesOptions, UnElevenLabsOptions, VoiceProviderWithExtraOptions } from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import { createUnElevenLabs, listVoices } from 'unspeech'
import { z } from 'zod'

import { defineProvider } from '../registry'
import { models as elevenLabsModels } from './list-models'

const elevenLabsConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://unspeech.hyp3r.link/v1/'),
  voiceSettings: z.object({
    similarityBoost: z.number().default(0.75),
    stability: z.number().default(0.5),
  }).default({ similarityBoost: 0.75, stability: 0.5 }),
})

type ElevenLabsConfig = z.input<typeof elevenLabsConfigSchema>

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

function toListVoicesOptions(provider: VoiceProviderWithExtraOptions<UnElevenLabsOptions>): ListVoicesOptions {
  const { fetch: _fetch, ...voiceOptions } = provider.voice()
  return voiceOptions
}

export const providerElevenLabs = defineProvider<ElevenLabsConfig>({
  createProvider(config) {
    return createUnElevenLabs(config.apiKey.trim(), config.baseUrl?.trim() ?? 'https://unspeech.hyp3r.link/v1/') as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  },
  createProviderConfig: ({ t }) => elevenLabsConfigSchema.extend({
    apiKey: elevenLabsConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: elevenLabsConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'elevenlabs.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.elevenlabs.description'),
  extraMethods: {
    listModels: async () => elevenLabsModels.map(model => ({
      contextLength: 0,
      deprecated: false,
      description: model.description,
      id: model.model_id,
      name: model.name,
      provider: 'elevenlabs',
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
        languages: voice.languages,
        name: voice.name,
        previewURL: voice.preview_audio_url,
        provider: 'elevenlabs',
      }))
    },
  },
  icon: 'i-simple-icons:elevenlabs',
  id: 'elevenlabs',

  name: 'ElevenLabs',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.elevenlabs.title'),

  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createElevenLabsValidators(),
})
