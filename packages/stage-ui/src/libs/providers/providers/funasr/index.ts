import type { ComposerTranslation } from 'vue-i18n'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const FUNASR_BASE_URL = 'http://localhost:8000/v1/'

const funASRConfigSchema = z.object({
  apiKey: z.string().default('not-needed'),
  baseUrl: z.string().default(FUNASR_BASE_URL),
  model: z.string().default('sensevoice'),
  language: z.string().optional(),
  prompt: z.string().optional(),
})

type FunASRConfig = z.input<typeof funASRConfigSchema>

/** Fixed model choices exposed by the FunASR transcription provider. */
export const FUNASR_TRANSCRIPTION_MODELS = [
  {
    id: 'sensevoice',
    name: 'SenseVoice',
    provider: 'funasr-audio-transcription',
    description: 'Multilingual speech recognition with emotion and audio event detection.',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'fun-asr-nano',
    name: 'Fun-ASR-Nano',
    provider: 'funasr-audio-transcription',
    description: 'End-to-end multilingual speech recognition model.',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'paraformer',
    name: 'Paraformer',
    provider: 'funasr-audio-transcription',
    description: 'Fast non-autoregressive speech recognition model.',
    contextLength: 0,
    deprecated: false,
  },
]

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl === undefined ? FUNASR_BASE_URL : baseUrl.trim()
  if (!value)
    throw new Error('FunASR Base URL is required')
  return value.endsWith('/') ? value : `${value}/`
}

function createFunASRProvider(config: FunASRConfig) {
  const provider = createOpenAI(config.apiKey?.trim() || 'not-needed', normalizeBaseUrl(config.baseUrl))
  const transcription = provider.transcription.bind(provider)
  provider.transcription = (model: string, extraOptions?: Record<string, unknown>) => ({
    ...transcription(model),
    ...extraOptions,
  })
  return provider
}

function createFunASRValidators() {
  return {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'funasr-audio-transcription:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: FunASRConfig) => {
          const errors: Array<{ error: unknown }> = []
          const baseUrl = config.baseUrl?.trim() ?? ''
          const model = config.model?.trim() ?? ''

          if (!baseUrl) {
            errors.push({ error: new Error('Base URL is required') })
          }
          else {
            try {
              const url = new URL(baseUrl)
              if (url.protocol !== 'http:' && url.protocol !== 'https:')
                errors.push({ error: new Error('Base URL must use http:// or https://') })
            }
            catch {
              errors.push({ error: new Error('Base URL must be an absolute URL') })
            }
          }

          if (!model)
            errors.push({ error: new Error('Model is required') })

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

export const providerFunASRAudioTranscription = defineProvider<FunASRConfig>({
  id: 'funasr-audio-transcription',
  name: 'FunASR',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.funasr.title'),
  description: 'Local speech recognition with FunASR, SenseVoice, and Fun-ASR-Nano.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.funasr.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:modelscope',
  requiresCredentials: false,
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: ({ t }) => funASRConfigSchema.extend({
    apiKey: funASRConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: funASRConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    model: funASRConfigSchema.shape.model.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.model.label'),
    }),
  }),
  createProvider: createFunASRProvider,
  validationRequiredWhen: config => Boolean(config.baseUrl?.trim() && config.model?.trim()),
  validators: createFunASRValidators(),
  extraMethods: {
    listModels: async () => FUNASR_TRANSCRIPTION_MODELS.map(model => ({ ...model })),
  },
})
