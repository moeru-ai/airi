import type { ComposerTranslation } from 'vue-i18n'

import { createOpenAI } from '@xsai-ext/providers/create'
import { listModels } from '@xsai/model'
import { z } from 'zod'

import { defineProvider } from '../registry'

const OPENAI_BASE_URL = 'https://api.openai.com/v1/'

const openAIAudioConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(OPENAI_BASE_URL),
})

const openAICompatibleAudioConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(''),
})

type OpenAIAudioConfig = z.input<typeof openAIAudioConfigSchema>
type OpenAICompatibleAudioConfig = z.input<typeof openAICompatibleAudioConfigSchema>
type AudioConfig = OpenAIAudioConfig | OpenAICompatibleAudioConfig

function createAudioConfigSchema<T extends typeof openAIAudioConfigSchema | typeof openAICompatibleAudioConfigSchema>(schema: T, t: ComposerTranslation) {
  return schema.extend({
    apiKey: schema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: schema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  })
}

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() ?? ''
  return value && !value.endsWith('/') ? `${value}/` : value
}

function createAudioProvider(config: AudioConfig) {
  return createOpenAI(config.apiKey.trim(), normalizeBaseUrl(config.baseUrl))
}

function createTranscriptionProvider(config: AudioConfig) {
  const provider = createAudioProvider(config)
  const transcription = provider.transcription.bind(provider)
  provider.transcription = (model: string, extraOptions?: Record<string, unknown>) => ({
    ...transcription(model),
    ...extraOptions,
  })
  return provider
}

function createAudioValidators<TConfig extends AudioConfig>() {
  return {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'openai-audio:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: TConfig) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = config.apiKey?.trim() ?? ''
          const baseUrl = config.baseUrl?.trim() ?? ''

          if (!apiKey)
            errors.push({ error: new Error('API Key is required') })
          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })

          if (baseUrl) {
            try {
              const url = new URL(baseUrl)
              if (!url.host)
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

const openAISpeechModels = [
  {
    id: 'tts-1',
    name: 'TTS-1',
    provider: 'openai-audio-speech',
    description: 'Optimized for real-time text-to-speech tasks',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'tts-1-hd',
    name: 'TTS-1-HD',
    provider: 'openai-audio-speech',
    description: 'Higher fidelity audio output',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'gpt-4o-mini-tts',
    name: 'GPT-4o Mini TTS',
    provider: 'openai-audio-speech',
    description: 'GPT-4o Mini optimized for text-to-speech',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'gpt-4o-mini-tts-2025-12-15',
    name: 'GPT-4o Mini TTS (2025-12-15)',
    provider: 'openai-audio-speech',
    description: 'GPT-4o Mini TTS snapshot from 2025-12-15',
    contextLength: 0,
    deprecated: false,
  },
]

// OpenAI does not provide a voice-list endpoint. This list follows the
// create-speech API. The TTS-1 models support nine voices. GPT-4o Mini TTS
// also supports ballad, verse, marin, and cedar.
const openAISpeechVoices = [
  { id: 'alloy', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'ash', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'ballad', models: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'coral', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'echo', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'fable', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'onyx', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'nova', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'sage', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'shimmer', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'verse', models: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'marin', models: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
  { id: 'cedar', models: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'] },
].map(voice => ({
  id: voice.id,
  name: `${voice.id[0].toUpperCase()}${voice.id.slice(1)}`,
  provider: 'openai-audio-speech',
  languages: [],
  compatibleModels: voice.models,
}))

const openAITranscriptionModels = [
  ['gpt-4o-transcribe', 'GPT-4o Transcribe', 'High-quality transcription model'],
  ['gpt-4o-mini-transcribe', 'GPT-4o Mini Transcribe', 'Faster, cost-effective transcription model'],
  ['gpt-4o-mini-transcribe-2025-12-15', 'GPT-4o Mini Transcribe (2025-12-15)', 'GPT-4o Mini Transcribe snapshot from 2025-12-15'],
  ['whisper-1', 'Whisper-1', 'Powered by our open source Whisper V2 model'],
  ['gpt-4o-transcribe-diarize', 'GPT-4o Transcribe Diarize', 'Transcription with speaker diarization'],
].map(([id, name, description]) => ({
  id,
  name,
  provider: 'openai-audio-transcription',
  description,
  contextLength: 0,
  deprecated: false,
}))

export const providerOpenAIAudioSpeech = defineProvider<OpenAIAudioConfig>({
  id: 'openai-audio-speech',
  name: 'OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai.title'),
  description: 'openai.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:openai',
  createProviderConfig: ({ t }) => createAudioConfigSchema(openAIAudioConfigSchema, t),
  createProvider: createAudioProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createAudioValidators<OpenAIAudioConfig>(),
  extraMethods: {
    listModels: async () => openAISpeechModels,
    listVoices: async () => openAISpeechVoices,
  },
})

export const providerOpenAICompatibleAudioSpeech = defineProvider<OpenAICompatibleAudioConfig>({
  id: 'openai-compatible-audio-speech',
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),
  description: 'Connect to any API that follows the OpenAI specification.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:openai',
  createProviderConfig: ({ t }) => createAudioConfigSchema(openAICompatibleAudioConfigSchema, t),
  createProvider: createAudioProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createAudioValidators<OpenAICompatibleAudioConfig>(),
  extraMethods: {
    listVoices: async () => [],
    listModels: async (config) => {
      const apiKey = config.apiKey?.trim() ?? ''
      const baseUrl = normalizeBaseUrl(config.baseUrl)
      if (!apiKey || !baseUrl)
        return []

      const models = await listModels({ apiKey, baseURL: baseUrl })
      return models
        .filter(model => model.id.toLowerCase().includes('tts'))
        .map(model => ({
          id: model.id,
          name: model.id,
          provider: 'openai-compatible-audio-speech',
          description: '',
          contextLength: 0,
          deprecated: false,
        }))
    },
  },
})

export const providerOpenAIAudioTranscription = defineProvider<OpenAIAudioConfig>({
  id: 'openai-audio-transcription',
  name: 'OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai.title'),
  description: 'openai.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:openai',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: ({ t }) => createAudioConfigSchema(openAIAudioConfigSchema, t),
  createProvider: createTranscriptionProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createAudioValidators<OpenAIAudioConfig>(),
  extraMethods: {
    listModels: async () => openAITranscriptionModels,
  },
})

export const providerOpenAICompatibleAudioTranscription = defineProvider<OpenAICompatibleAudioConfig>({
  id: 'openai-compatible-audio-transcription',
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),
  description: 'Connect to any API that follows the OpenAI specification.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:openai',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: ({ t }) => createAudioConfigSchema(openAICompatibleAudioConfigSchema, t),
  createProvider: createTranscriptionProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createAudioValidators<OpenAICompatibleAudioConfig>(),
  // Transcription model names are not reliably available from /v1/models.
  extraMethods: { listModels: async () => [] },
})
