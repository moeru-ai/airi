import type { SherpawModel } from './models'
import type { SherpawStreamOptions, SherpawStreamResult } from './runtime'

import { z } from 'zod'

import { defineProvider } from '../../registry'
import { formatSherpawLanguageName, formatSherpawModelName, paraformerBilingualZhEn, selectSherpawModel, sherpawModels } from './models'

export const SHERPAW_TRANSCRIPTION_PROVIDER_ID = 'sherpaw-transcription'

const configSchema = z.object({
  model: z.enum(Object.values(sherpawModels).map(model => model.id)).default('paraformer-zh-en'),
  modelLanguageFilter: z.enum(['all', ...new Set(Object.values(sherpawModels).flatMap(model => model.supportedLanguages))]).optional(),
})

/** Persisted model selection. Recognition detects one of its supported languages. */
export type SherpawConfig = z.input<typeof configSchema>

/** One model and the URLs exposed by the host application. */
export interface SherpawModelResource {
  model: SherpawModel
  files: {
    data: string
    metadata: string
    source: 'bundled' | 'remote'
  }
}

/** Browser resources supplied by the application that owns model loading. */
export interface SherpawTranscriptionHost {
  models: readonly SherpawModelResource[]
  workerURL: string
  fetchModel: typeof fetch
  /** Reads the interface language when a new configuration is created. */
  getInterfaceLanguage: () => string
  /** Reports whether the host is running on a mobile surface. */
  isMobile: () => boolean
}

/** Runs the local request created by the Sherpaw provider. */
export function executeSherpawStream(options: SherpawStreamOptions): SherpawStreamResult {
  if (typeof options.startSherpaw !== 'function')
    throw new TypeError('Sherpaw transcription requires a local Provider request.')
  return options.startSherpaw(options)
}

/** Defines Sherpaw recognition with the model resources supplied by one host. */
export function createSherpawTranscriptionDefinition(host: SherpawTranscriptionHost) {
  return defineProvider<SherpawConfig, typeof SHERPAW_TRANSCRIPTION_PROVIDER_ID>({
    id: SHERPAW_TRANSCRIPTION_PROVIDER_ID,
    name: 'Sherpaw',
    nameLocalize: ({ t }) => t('settings.pages.providers.provider.sherpaw-transcription.title'),
    description: 'Local speech recognition with bundled or on-demand models. No API key is required.',
    descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.sherpaw-transcription.description'),
    tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
    requiresCredentials: false,
    isAvailableBy: () => host.models.length > 0 && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined',
    capabilities: {
      transcription: {
        protocol: 'native',
        generateOutput: false,
        streamInput: true,
        streamOutput: true,
      },
    },
    createProviderConfig: ({ t }) => {
      const language = host.getInterfaceLanguage().split('-')[0].toLowerCase()
      const models = host.models.map(({ model }) => model)
      const preferredModel: SherpawModel = selectSherpawModel(models, language, { isMobile: host.isMobile() }) ?? paraformerBilingualZhEn
      const preferredLanguage = preferredModel.supportedLanguages.includes(language) ? language : 'all'

      return configSchema.extend({
        model: configSchema.shape.model.default(configSchema.shape.model.parse(preferredModel.id)).meta({
          type: 'select',
          labelLocalized: t('settings.pages.providers.provider.sherpaw-transcription.model.label'),
          descriptionLocalized: t('settings.pages.providers.provider.sherpaw-transcription.model.description'),
          options: host.models.map(({ model }) => ({
            value: model.id,
            label: formatSherpawModelName(model, globalThis.navigator?.language ?? 'en'),
          })),
        }),
        modelLanguageFilter: configSchema.shape.modelLanguageFilter.default(configSchema.shape.modelLanguageFilter.parse(preferredLanguage) ?? 'all').meta({
          type: 'select',
          labelLocalized: t('settings.pages.providers.provider.sherpaw-transcription.language.label'),
          descriptionLocalized: t('settings.pages.providers.provider.sherpaw-transcription.language.description'),
          options: [
            { value: 'all', label: t('settings.pages.providers.provider.sherpaw-transcription.language.all') },
            ...[...new Set(host.models.flatMap(({ model }) => model.supportedLanguages))].map(language => ({
              value: language,
              label: formatSherpawLanguageName(language, globalThis.navigator?.language ?? 'en'),
            })),
          ],
        }),
      })
    },
    async createProvider(config) {
      const { createProvider } = await import('./runtime')
      return createProvider(configSchema.parse(config), host)
    },
    validationRequiredWhen: () => false,
    extraMethods: {
      listModels: async () => [{
        id: 'sherpaw',
        name: 'Sherpaw',
        provider: SHERPAW_TRANSCRIPTION_PROVIDER_ID,
        description: 'Model selected in Hearing settings.',
      }],
    },
  })
}
