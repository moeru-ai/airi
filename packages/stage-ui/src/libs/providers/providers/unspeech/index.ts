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

type MicrosoftSpeechConfig = z.input<typeof microsoftSpeechConfigSchema>
type UnspeechConfig = z.input<typeof unspeechConfigSchema>
type VolcengineSpeechConfig = z.input<typeof volcengineSpeechConfigSchema>

function createUnspeechConfigSchema(schema: typeof volcengineSpeechConfigSchema, t: ComposerTranslation): typeof volcengineSpeechConfigSchema
function createUnspeechConfigSchema(schema: typeof microsoftSpeechConfigSchema, t: ComposerTranslation): typeof microsoftSpeechConfigSchema
function createUnspeechConfigSchema(schema: typeof unspeechConfigSchema, t: ComposerTranslation): typeof unspeechConfigSchema
function createUnspeechConfigSchema(
  schema: typeof microsoftSpeechConfigSchema | typeof unspeechConfigSchema | typeof volcengineSpeechConfigSchema,
  t: ComposerTranslation,
) {
  return schema.extend({
    apiKey: schema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: schema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  })
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

export const providerDeepgramTts = defineProvider<UnspeechConfig>({
  createProvider: config => createUnDeepgram(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(unspeechConfigSchema, t),
  description: 'deepgram.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.deepgram-tts.description'),
  extraMethods: {
    listModels: async () => [
      { deprecated: false, description: 'Latest generation Aura model', id: 'aura-2', name: 'Aura 2', provider: 'deepgram-tts' },
      { deprecated: false, description: 'First generation Aura model', id: 'aura-1', name: 'Aura 1', provider: 'deepgram-tts' },
      { deprecated: true, description: 'Original Aura model', id: 'aura', name: 'Aura (Legacy)', provider: 'deepgram-tts' },
    ],
    listVoices: async (config) => {
      const provider = createUnDeepgram(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnDeepgramOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      return voices.map(voice => ({
        description: voice.description,
        gender: voice.labels?.gender,
        id: voice.id,
        languages: voice.languages,
        name: voice.name,
        provider: 'deepgram-tts',
      }))
    },
  },
  icon: 'i-simple-icons:deepgram',
  id: 'deepgram-tts',
  name: 'Deepgram',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.deepgram-tts.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createUnspeechValidators('deepgram-tts'),
})

export const providerMicrosoftSpeech = defineProvider<MicrosoftSpeechConfig>({
  createProvider: config => createUnMicrosoft(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(microsoftSpeechConfigSchema, t),
  description: 'speech.microsoft.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.microsoft-speech.description'),
  extraMethods: {
    listModels: async () => [{ deprecated: false, description: '', id: 'v1', name: 'v1', provider: 'microsoft-speech' }],
    listVoices: async (config) => {
      const provider = createUnMicrosoft(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnMicrosoftOptions>
      const voices = await listVoices(toListVoicesOptions(provider, { region: config.region ?? '' }))
      return voices.map(voice => ({
        gender: voice.labels?.gender,
        id: voice.id,
        languages: voice.languages,
        name: voice.name,
        previewURL: voice.preview_audio_url,
        provider: 'microsoft-speech',
      }))
    },
  },
  iconColor: 'i-lobe-icons:microsoft',
  id: 'microsoft-speech',
  name: 'Microsoft / Azure Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.microsoft-speech.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createUnspeechValidators('microsoft-speech'),
})

export const providerAlibabaCloudModelStudio = defineProvider<UnspeechConfig>({
  createProvider: config => createUnAlibabaCloud(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(unspeechConfigSchema, t),
  description: 'bailian.console.aliyun.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-model-studio.description'),
  extraMethods: {
    listModels: async () => [
      { deprecated: false, description: '', id: 'cosyvoice-v1', name: 'CosyVoice', provider: 'alibaba-cloud-model-studio' },
      { deprecated: false, description: '', id: 'cosyvoice-v2', name: 'CosyVoice (New)', provider: 'alibaba-cloud-model-studio' },
    ],
    listVoices: async (config) => {
      const provider = createUnAlibabaCloud(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnAlibabaCloudOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      return voices.map(voice => ({
        compatibleModels: voice.compatible_models,
        gender: voice.labels?.gender,
        id: voice.id,
        languages: voice.languages,
        name: voice.name,
        previewURL: voice.preview_audio_url,
        provider: 'alibaba-cloud-model-studio',
      }))
    },
  },
  iconColor: 'i-lobe-icons:alibabacloud',
  id: 'alibaba-cloud-model-studio',
  name: 'Alibaba Cloud Model Studio',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.alibaba-cloud-model-studio.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createUnspeechValidators('alibaba-cloud-model-studio'),
})

export const providerVolcengineSpeech = defineProvider<VolcengineSpeechConfig>({
  createProvider: config => createUnVolcengine(config.apiKey.trim(), config.baseUrl?.trim() ?? ''),
  createProviderConfig: ({ t }) => createUnspeechConfigSchema(volcengineSpeechConfigSchema, t),
  description: 'volcengine.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine.description'),
  extraMethods: {
    listModels: async () => [{ deprecated: false, description: '', id: 'v1', name: 'v1', provider: 'volcano-engine' }],
    listVoices: async (config) => {
      const provider = createUnVolcengine(config.apiKey.trim(), config.baseUrl?.trim() ?? '') as VoiceProviderWithExtraOptions<UnVolcengineOptions>
      const voices = await listVoices(toListVoicesOptions(provider))
      return voices.map(voice => ({
        gender: voice.labels?.gender,
        id: voice.id,
        languages: voice.languages,
        name: voice.name,
        previewURL: voice.preview_audio_url,
        provider: 'volcano-engine',
      }))
    },
  },
  iconColor: 'i-lobe-icons:volcengine',
  id: 'volcengine',
  name: 'Volcengine',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim() && config.app?.appId.trim()),
  validators: createUnspeechValidators<VolcengineSpeechConfig>('volcengine', true),
})
