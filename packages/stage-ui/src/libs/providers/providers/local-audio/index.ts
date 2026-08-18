import type { ComposerTranslation } from 'vue-i18n'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { isWebGPUSupported } from '@proj-airi/stage-shared/webgpu'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const localAudioConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional().default(''),
})

type LocalAudioConfig = z.input<typeof localAudioConfigSchema>

function createLocalAudioConfigSchema(t: ComposerTranslation) {
  return localAudioConfigSchema.extend({
    apiKey: localAudioConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: localAudioConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  })
}

function normalizeBaseUrl(baseUrl: string | undefined) {
  const normalized = baseUrl?.trim() ?? ''
  return normalized && !normalized.endsWith('/') ? `${normalized}/` : normalized
}

function createLocalAudioProvider(config: LocalAudioConfig) {
  return createOpenAI(config.apiKey?.trim() ?? '', normalizeBaseUrl(config.baseUrl))
}

function createLocalTranscriptionProvider(config: LocalAudioConfig) {
  const provider = createLocalAudioProvider(config)
  const transcription = provider.transcription.bind(provider)
  provider.transcription = (model: string, extraOptions?: Record<string, unknown>) => ({
    ...transcription(model),
    ...extraOptions,
  })
  return provider
}

function createLocalAudioValidators() {
  return {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'local-audio:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: LocalAudioConfig) => {
          const valid = Boolean(config.baseUrl)
          const reason = valid
            ? ''
            : 'Base URL is required. This is likely a bug, report to developers on https://github.com/moeru-ai/airi/issues.'
          return {
            errors: valid ? [] : [{ error: new Error('Base URL is required.') }],
            reason,
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  }
}

async function isBrowserAndMemoryEnough() {
  if (isStageTamagotchi())
    return false

  if (await isWebGPUSupported())
    return true

  if ('navigator' in globalThis && globalThis.navigator != null && 'deviceMemory' in globalThis.navigator && typeof globalThis.navigator.deviceMemory === 'number') {
    // The browser model needs at least 8 GB of system memory without WebGPU.
    return globalThis.navigator.deviceMemory >= 8
  }

  return false
}

export const providerAppLocalAudioSpeech = defineProvider<LocalAudioConfig>({
  id: 'app-local-audio-speech',
  name: 'App (Local)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.app-local-audio-speech.title'),
  description: 'https://github.com/huggingface/candle',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.app-local-audio-speech.description'),
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-lobe-icons:huggingface',
  isAvailableBy: isStageTamagotchi,
  createProviderConfig: ({ t }) => createLocalAudioConfigSchema(t),
  createProvider: createLocalAudioProvider,
  validators: createLocalAudioValidators(),
})

export const providerAppLocalAudioTranscription = defineProvider<LocalAudioConfig>({
  id: 'app-local-audio-transcription',
  name: 'App (Local)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.app-local-audio-transcription.title'),
  description: 'https://github.com/huggingface/candle',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.app-local-audio-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:huggingface',
  isAvailableBy: isStageTamagotchi,
  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
    },
  },
  createProviderConfig: ({ t }) => createLocalAudioConfigSchema(t),
  createProvider: createLocalTranscriptionProvider,
  validators: createLocalAudioValidators(),
})

export const providerBrowserLocalAudioSpeech = defineProvider<LocalAudioConfig>({
  id: 'browser-local-audio-speech',
  name: 'Browser (Local)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.browser-local-audio-speech.title'),
  description: 'https://github.com/moeru-ai/xsai-transformers',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.browser-local-audio-speech.description'),
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-lobe-icons:huggingface',
  isAvailableBy: isBrowserAndMemoryEnough,
  createProviderConfig: ({ t }) => createLocalAudioConfigSchema(t),
  createProvider: createLocalAudioProvider,
  validators: createLocalAudioValidators(),
})

export const providerBrowserLocalAudioTranscription = defineProvider<LocalAudioConfig>({
  id: 'browser-local-audio-transcription',
  name: 'Browser (Local)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.browser-local-audio-transcription.title'),
  description: 'https://github.com/moeru-ai/xsai-transformers',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.browser-local-audio-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:huggingface',
  isAvailableBy: isBrowserAndMemoryEnough,
  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
    },
  },
  createProviderConfig: ({ t }) => createLocalAudioConfigSchema(t),
  createProvider: createLocalTranscriptionProvider,
  validators: createLocalAudioValidators(),
})
