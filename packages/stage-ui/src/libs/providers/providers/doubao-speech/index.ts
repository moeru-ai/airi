import type { DoubaoSpeechSessionConfig } from '@proj-airi/stage-shared/doubao-speech'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { VoiceInfo } from '../../types'

import { isElectronWindow, isStageTamagotchi } from '@proj-airi/stage-shared'
import { DOUBAO_SPEECH_ENDPOINT } from '@proj-airi/stage-shared/doubao-speech'
import { z } from 'zod'

import { defineProvider } from '../registry'
import { createDoubaoSpeechWebSocketFactory, synthesizeDoubaoSpeech } from './runtime'
import { doubaoOfficialVoices, findDoubaoOfficialVoice } from './voice-catalog'

const RESOURCE_IDS = ['seed-tts-2.0', 'seed-icl-2.0'] as const
const LANGUAGE_CODES = ['', 'zh-cn', 'en', 'ja', 'es-mx', 'id', 'pt-br', 'pt', 'ko', 'it', 'de', 'fr', 'th', 'vi', 'ru', 'fil', 'ms', 'ar', 'pl', 'tr', 'sv'] as const
const DIALECT_CODES = ['', 'beijing', 'dongbei', 'henan', 'shaanxi', 'shanghai', 'sichuan', 'tianjin', 'yue'] as const

const audioSchema = z.object({
  format: z.enum(['mp3', 'pcm', 'ogg_opus', 'wav']).default('mp3'),
  sampleRate: z.union([
    z.literal(8000),
    z.literal(16000),
    z.literal(22050),
    z.literal(24000),
    z.literal(32000),
    z.literal(44100),
    z.literal(48000),
  ]).default(24000),
  speechRate: z.number().int().min(-50).max(100).default(0),
  loudnessRate: z.number().int().min(-50).max(100).default(0),
  pitch: z.number().int().min(-12).max(12).default(0),
}).default({
  format: 'mp3',
  sampleRate: 24000,
  speechRate: 0,
  loudnessRate: 0,
  pitch: 0,
})

const baseConfigSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required.'),
  baseUrl: z.literal(DOUBAO_SPEECH_ENDPOINT).default(DOUBAO_SPEECH_ENDPOINT),
  resourceId: z.enum(RESOURCE_IDS).default('seed-tts-2.0'),
  speaker: z.string().trim().min(1, 'Voice ID is required.'),
  audio: audioSchema,
  explicitLanguage: z.enum(LANGUAGE_CODES).default(''),
  explicitDialect: z.enum(DIALECT_CODES).default(''),
  voiceInstruction: z.string().trim().max(2048).default(''),
})

function withDoubaoConfigConstraints<TSchema extends typeof baseConfigSchema>(schema: TSchema) {
  return schema
    .refine(
      config => config.audio.format !== 'ogg_opus' || config.audio.sampleRate === 48000,
      { message: 'The ogg_opus format requires a 48000 Hz sample rate.', path: ['audio', 'sampleRate'] },
    )
    .refine(
      config => config.resourceId !== 'seed-icl-2.0' || !findDoubaoOfficialVoice(config.speaker),
      { message: 'The clone resource requires a cloned voice ID.', path: ['speaker'] },
    )
}

const doubaoSpeechConfigSchema = withDoubaoConfigConstraints(baseConfigSchema)

/** Serializable settings for the Doubao Speech Provider. */
export type DoubaoSpeechConfig = z.input<typeof doubaoSpeechConfigSchema>
type NormalizedDoubaoSpeechConfig = z.output<typeof doubaoSpeechConfigSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeConfig(
  config: DoubaoSpeechConfig,
  overrides?: Record<string, unknown>,
  requestedModel?: string,
): NormalizedDoubaoSpeechConfig {
  const configured = doubaoSpeechConfigSchema.parse(config)
  const audioOverrides = isRecord(overrides?.audio) ? overrides.audio : undefined
  const resourceId = RESOURCE_IDS.find(value => value === requestedModel)

  return doubaoSpeechConfigSchema.parse({
    ...configured,
    ...overrides,
    audio: {
      ...configured.audio,
      ...audioOverrides,
    },
    resourceId: resourceId ?? overrides?.resourceId ?? configured.resourceId,
  })
}

function toSessionConfig(config: NormalizedDoubaoSpeechConfig): DoubaoSpeechSessionConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    resourceId: config.resourceId,
    speaker: config.speaker,
    audio: config.audio,
    explicitLanguage: config.explicitLanguage,
    explicitDialect: config.explicitDialect,
    voiceInstruction: config.voiceInstruction,
  }
}

function parseSpeechBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string')
    throw new TypeError('Doubao speech expected a JSON request body.')

  return z.object({
    input: z.string().min(1),
    voice: z.string().trim().min(1),
  }).parse(JSON.parse(body))
}

function audioContentType(format: NormalizedDoubaoSpeechConfig['audio']['format']) {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg'
    case 'ogg_opus':
      return 'audio/ogg'
    case 'wav':
      return 'audio/wav'
    case 'pcm':
      return 'audio/wav'
  }
}

function createDoubaoSpeechProvider(config: DoubaoSpeechConfig): SpeechProviderWithExtraOptions<string, Record<string, unknown>> {
  return {
    speech(model, extraOptions) {
      const resolved = normalizeConfig(config, extraOptions, model)
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        const request = parseSpeechBody(init?.body)
        const sessionConfig = toSessionConfig({ ...resolved, speaker: request.voice })
        const audio = await synthesizeDoubaoSpeech(sessionConfig, request.input, init?.signal ?? undefined)
        return new Response(audio, {
          headers: { 'Content-Type': audioContentType(sessionConfig.audio.format) },
          status: 200,
        })
      }

      return {
        baseURL: 'https://doubao-speech.invalid/v1/',
        model,
        fetch,
      }
    },
  }
}

function configuredVoiceInfo(speaker: string, resourceId: typeof RESOURCE_IDS[number]): VoiceInfo {
  return {
    id: speaker,
    name: speaker,
    provider: 'doubao-speech',
    compatibleModels: [resourceId],
    languages: [],
  }
}

function officialVoiceInfo(voice: typeof doubaoOfficialVoices[number]): VoiceInfo {
  return {
    id: voice.id,
    name: voice.name,
    provider: 'doubao-speech',
    compatibleModels: ['seed-tts-2.0'],
    description: `${voice.scene} · ${voice.languages}`,
    languages: [{ code: 'auto', title: voice.languages }],
  }
}

export const providerDoubaoSpeech = defineProvider<DoubaoSpeechConfig>({
  id: 'doubao-speech',
  name: 'Doubao Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.doubao-speech.title'),
  description: 'doubao.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.doubao-speech.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:doubao',
  iconColor: 'i-lobe-icons:doubao-color',
  isAvailableBy: () => isStageTamagotchi() && typeof window !== 'undefined' && isElectronWindow(window),

  capabilities: {
    speech: {
      transport: 'bidirectional-ws',
      createSession: ({ config, model, voice }) => {
        const configured = doubaoSpeechConfigSchema.safeParse(config)
        if (!configured.success)
          return null

        const resolved = doubaoSpeechConfigSchema.safeParse({
          ...configured.data,
          resourceId: RESOURCE_IDS.find(resourceId => resourceId === model) ?? configured.data.resourceId,
          speaker: voice?.id || configured.data.speaker,
        })
        if (!resolved.success)
          return null

        const sessionConfig = toSessionConfig(resolved.data)
        return {
          model: sessionConfig.resourceId,
          voice: sessionConfig.speaker,
          // Seed 2.0 audio frames do not align with subtitle boundaries, and
          // Stage currently decodes only complete encoded audio buffers.
          bufferEntireSession: true,
          extraBody: {},
          webSocketFactory: createDoubaoSpeechWebSocketFactory(sessionConfig),
        }
      },
    },
  },

  createProviderConfig: ({ t }) => withDoubaoConfigConstraints(baseConfigSchema.extend({
    apiKey: baseConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
  })),

  createProvider: createDoubaoSpeechProvider,
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'doubao-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: DoubaoSpeechConfig) => {
          const result = doubaoSpeechConfigSchema.safeParse(config)
          const errors = result.success
            ? []
            : result.error.issues.map(issue => ({ error: new Error(issue.message) }))

          return {
            errors,
            reason: errors.map(item => item.error.message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => RESOURCE_IDS.map(resourceId => ({
      id: resourceId,
      name: resourceId,
      provider: 'doubao-speech',
      description: resourceId === 'seed-tts-2.0' ? 'Official Doubao TTS 2.0 voices' : 'Doubao cloned voices 2.0',
    })),
    listVoices: async (config, _provider, model) => {
      const result = doubaoSpeechConfigSchema.safeParse({ ...config, resourceId: model ?? config.resourceId })
      if (!result.success)
        return []

      if (result.data.resourceId === 'seed-icl-2.0')
        return [configuredVoiceInfo(result.data.speaker, result.data.resourceId)]

      const selectedVoice = findDoubaoOfficialVoice(result.data.speaker)
      const voices = doubaoOfficialVoices.map(officialVoiceInfo)
      if (!selectedVoice)
        return [configuredVoiceInfo(result.data.speaker, result.data.resourceId), ...voices]

      if (voices[0]?.id === selectedVoice.id)
        return voices

      return [
        officialVoiceInfo(selectedVoice),
        ...voices.filter(voice => voice.id !== selectedVoice.id),
      ]
    },
  },
})
