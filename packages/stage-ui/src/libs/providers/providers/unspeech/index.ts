import type {
  ListVoicesOptions,
  UnAlibabaCloudOptions,
  UnDeepgramOptions,
  UnMicrosoftOptions,
  UnVolcengineOptions,
  VoiceProviderWithExtraOptions,
} from 'unspeech'
import type { ComposerTranslation } from 'vue-i18n'

import {
  createUnAlibabaCloud,
  createUnDeepgram,
  createUnMicrosoft,
  createUnVolcengine,
  listVoices,
} from 'unspeech'
import { z } from 'zod'

import { defineProvider } from '../registry'

const unspeechConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://unspeech.hyp3r.link/v1/'),
})

const microsoftSpeechConfigSchema = unspeechConfigSchema.extend({
  region: z.string().optional(),
})

const volcengineSpeechConfigSchema = unspeechConfigSchema.extend({
  app: z.object({ appId: z.string() }),
})

type UnspeechConfig = z.input<typeof unspeechConfigSchema>
type MicrosoftSpeechConfig = z.input<typeof microsoftSpeechConfigSchema>
type VolcengineSpeechConfig = z.input<typeof volcengineSpeechConfigSchema>

function createUnspeechConfigSchema(schema: typeof volcengineSpeechConfigSchema, t: ComposerTranslation): typeof volcengineSpeechConfigSchema
function createUnspeechConfigSchema(schema: typeof microsoftSpeechConfigSchema, t: ComposerTranslation): typeof microsoftSpeechConfigSchema
function createUnspeechConfigSchema(schema: typeof unspeechConfigSchema, t: ComposerTranslation): typeof unspeechConfigSchema
function createUnspeechConfigSchema(
  schema: typeof unspeechConfigSchema | typeof microsoftSpeechConfigSchema | typeof volcengineSpeechConfigSchema,
  t: ComposerTranslation,
) {
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

function toListVoicesOptions<T>(provider: VoiceProviderWithExtraOptions<T>, options?: T): ListVoicesOptions {
  const { fetch: _fetch, ...voiceOptions } = provider.voice(options)
  return voiceOptions
}

function validateUnspeechConfig(config: UnspeechConfig, requireAppId = false) {
  const errors: Array<{ error: unknown }> = []
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = config.baseUrl?.trim() ?? ''

  if (!apiKey)
    errors.push({ error: new Error('API key is required.') })
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

  if (requireAppId) {
    const appId = 'app' in config && config.app && typeof config.app === 'object' && 'appId' in config.app
      ? String(config.app.appId).trim()
      : ''
    if (!appId)
      errors.push({ error: new Error('App ID is required.') })
  }

  return {
    errors,
    reason: errors.map(item => (item.error as Error).message).join(', '),
    reasonKey: '',
    valid: errors.length === 0,
  }
}

function createUnspeechValidators<TConfig extends UnspeechConfig>(id: string, requireAppId = false) {
  return {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: `${id}:check-config`,
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: TConfig) => validateUnspeechConfig(config, requireAppId),
      }),
    ],
  }
}

export const providerDeepgramTts = defineProvider<UnspeechConfig>({
  id: 'deepgram-tts',
  name: 'Deepgram',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.deepgram-tts.title'),
  description: 'deepgram.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.deepgram-tts.description'),
  tasks: ['text-to-speech'],
  icon: 'i-simple-icons:deepgram',
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(unspeechConfigSchema, t),
  createProvider: config => createUnDeepgram(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createUnspeechValidators('deepgram-tts'),
  extraMethods: {
    listModels: async () => [
      { id: 'aura-2', name: 'Aura 2', provider: 'deepgram-tts', description: 'Latest generation Aura model', deprecated: false },
      { id: 'aura-1', name: 'Aura 1', provider: 'deepgram-tts', description: 'First generation Aura model', deprecated: false },
      { id: 'aura', name: 'Aura (Legacy)', provider: 'deepgram-tts', description: 'Original Aura model', deprecated: true },
    ],
    listVoices: async (config) => {
      const provider = createUnDeepgram(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnDeepgramOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      return voices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'deepgram-tts',
        description: voice.description,
        languages: voice.languages,
        gender: voice.labels?.gender,
      }))
    },
  },
})

export const providerMicrosoftSpeech = defineProvider<MicrosoftSpeechConfig>({
  id: 'microsoft-speech',
  name: 'Microsoft / Azure Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.microsoft-speech.title'),
  description: 'speech.microsoft.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.microsoft-speech.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:microsoft',
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(microsoftSpeechConfigSchema, t),
  createProvider: config => createUnMicrosoft(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createUnspeechValidators('microsoft-speech'),
  extraMethods: {
    listModels: async () => [{ id: 'v1', name: 'v1', provider: 'microsoft-speech', description: '', deprecated: false }],
    listVoices: async (config) => {
      const provider = createUnMicrosoft(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnMicrosoftOptions>
      const voices = await listVoices(toListVoicesOptions(provider, { region: config.region ?? '' }))
      return voices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'microsoft-speech',
        previewURL: voice.preview_audio_url,
        languages: voice.languages,
        gender: voice.labels?.gender,
      }))
    },
  },
})

export const providerAlibabaCloudModelStudio = defineProvider<UnspeechConfig>({
  id: 'alibaba-cloud-model-studio',
  name: 'Alibaba Cloud Model Studio',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-model-studio.title'),
  description: 'bailian.console.aliyun.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-model-studio.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:alibabacloud',
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(unspeechConfigSchema, t),
  createProvider: config => createUnAlibabaCloud(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createUnspeechValidators('alibaba-cloud-model-studio'),
  extraMethods: {
    listModels: async () => [
      { id: 'cosyvoice-v1', name: 'CosyVoice', provider: 'alibaba-cloud-model-studio', description: '', deprecated: false },
      { id: 'cosyvoice-v2', name: 'CosyVoice (New)', provider: 'alibaba-cloud-model-studio', description: '', deprecated: false },
    ],
    listVoices: async (config) => {
      const provider = createUnAlibabaCloud(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnAlibabaCloudOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      return voices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'alibaba-cloud-model-studio',
        compatibleModels: voice.compatible_models,
        previewURL: voice.preview_audio_url,
        languages: voice.languages,
        gender: voice.labels?.gender,
      }))
    },
  },
})

export const providerVolcengineSpeech = defineProvider<VolcengineSpeechConfig>({
  id: 'volcengine',
  name: 'Volcengine',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine.title'),
  description: 'volcengine.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:volcengine',
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(volcengineSpeechConfigSchema, t),
  createProvider: config => createUnVolcengine(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim() && config.app?.appId.trim()),
  validators: createUnspeechValidators<VolcengineSpeechConfig>('volcengine', true),
  extraMethods: {
    listModels: async () => [{ id: 'v1', name: 'v1', provider: 'volcano-engine', description: '', deprecated: false }],
    listVoices: async (config) => {
      const provider = createUnVolcengine(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnVolcengineOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      return voices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'volcano-engine',
        previewURL: voice.preview_audio_url,
        languages: voice.languages,
        gender: voice.labels?.gender,
      }))
    },
  },
})
