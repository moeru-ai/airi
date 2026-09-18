import type { AIRIStreamTranscriptionResult, StreamTranscriptionOptions } from '../../stream-transcription'

import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'
import { z } from 'zod'

import { defineProvider } from '../registry'
import { sherpawModels } from './models'

export const SHERPAW_TRANSCRIPTION_PROVIDER_ID = 'sherpaw-transcription'

const configSchema = z.object({
  model: z.enum(Object.values(sherpawModels).map(model => model.id)).default('paraformer-zh-en'),
})

/** Persisted model selection. Recognition detects one of its supported languages. */
export type SherpawConfig = z.input<typeof configSchema>

/** Runs the local request created by the Sherpaw Provider. */
export function executeSherpawStream(options: StreamTranscriptionOptions): AIRIStreamTranscriptionResult {
  if (!('startSherpaw' in options) || typeof options.startSherpaw !== 'function')
    throw new TypeError('Sherpaw transcription requires a local Provider request.')
  return options.startSherpaw(options)
}

export const providerSherpawTranscription = defineProvider<SherpawConfig, typeof SHERPAW_TRANSCRIPTION_PROVIDER_ID>({
  id: SHERPAW_TRANSCRIPTION_PROVIDER_ID,
  name: 'Sherpaw',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.sherpaw-transcription.title'),
  description: 'Local speech recognition with bundled models. No API key is required.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.sherpaw-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  requiresCredentials: false,
  isAvailableBy: () => Object.keys(assets).length > 0 && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined',
  views: {
    hearing: () => import('./hearing-settings.vue'),
  },
  capabilities: {
    transcription: {
      protocol: 'native',
      generateOutput: false,
      streamInput: true,
      streamOutput: true,
    },
  },
  createProviderConfig: ({ t }) => configSchema.extend({
    model: configSchema.shape.model.meta({
      type: 'select',
      labelLocalized: t('settings.pages.providers.provider.sherpaw-transcription.model.label'),
      descriptionLocalized: t('settings.pages.providers.provider.sherpaw-transcription.model.description'),
      options: Object.keys(sherpawModels).map(value => ({
        value,
        label: t(`settings.pages.providers.provider.sherpaw-transcription.model.${value}`),
      })),
    }),
  }),
  async createProvider(config) {
    const { createProvider } = await import('./runtime')
    return createProvider(configSchema.parse(config))
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async () => [{
      id: 'sherpaw',
      name: 'Sherpaw',
      provider: SHERPAW_TRANSCRIPTION_PROVIDER_ID,
      description: 'Bundled model selected in Hearing settings.',
    }],
  },
})
