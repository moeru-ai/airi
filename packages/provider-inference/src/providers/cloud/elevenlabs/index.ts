import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { ProviderContext, VoiceInfo } from '../../../types'

import { z } from 'zod'

import { defineProvider } from '../../registry'
import { models as elevenLabsModels } from './list-models'

type ElevenLabsVoiceSettings = Partial<NonNullable<UnElevenLabsOptions['voiceSettings']>>

export interface ElevenLabsSpeechOptions {
  voiceSettings?: ElevenLabsVoiceSettings
}

/** The ElevenLabs API root. The adapter calls it directly, without the unspeech proxy. */
const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1/'

/** ElevenLabs applies these values when a request names no voice settings. */
const DEFAULT_ELEVENLABS_VOICE_SETTINGS = {
  similarityBoost: 0.75,
  stability: 0.5,
} satisfies ElevenLabsVoiceSettings

interface ElevenLabsVoiceEntry {
  voice_id: string
  name: string
  description?: string | null
  preview_url?: string | null
  labels?: Record<string, string> | null
  fine_tuning?: { language?: string | null } | null
  verified_languages?: Array<{ language?: string | null, locale?: string | null }> | null
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '')
}

/** Reads a readable language name, for example `American English` for `en-US`. */
function languageTitle(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  }
  catch {
    return code
  }
}

/**
 * Collects the locales of a voice. Premade voices report them in
 * `verified_languages`. Fine-tuned voices report one in `fine_tuning.language`.
 */
function resolveVoiceLanguages(entry: ElevenLabsVoiceEntry): VoiceInfo['languages'] {
  const codes = [
    ...(entry.verified_languages ?? []).map(item => item.locale || item.language),
    entry.fine_tuning?.language,
    entry.labels?.language,
  ].filter((code): code is string => !!code)

  return [...new Set(codes)].map(code => ({ code, title: languageTitle(code) }))
}

/**
 * Creates an ElevenLabs speech provider that calls the native API directly.
 *
 * The public unspeech proxy sends the requests of all users from one IP
 * address. ElevenLabs then flags Free Tier keys behind that address as unusual
 * activity and answers HTTP 401. A direct call uses the IP address of the user.
 *
 * xsai's `generateSpeech` sends the OpenAI `/audio/speech` JSON shape. The
 * native API is different:
 * 1. `{voice_id}` is in the URL instead of the JSON body.
 * 2. The body uses `text` instead of `input`, and `model_id` instead of `model`.
 * 3. The body carries the ElevenLabs `voice_settings` for tuning.
 *
 * The custom `fetch` rewrites the request to the native shape.
 *
 * NOTICE: The web build depends on ElevenLabs CORS headers. As of 2026-10-06,
 * `api.elevenlabs.io` answers with `Access-Control-Allow-Origin: *`. The
 * Electron renderer does not need them.
 */
function createNativeElevenLabsProvider(
  apiKey: string,
  baseUrl: string,
  baseVoiceSettings?: ElevenLabsVoiceSettings,
): SpeechProviderWithExtraOptions<string, ElevenLabsSpeechOptions> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  return {
    speech: (model: string, options?: ElevenLabsSpeechOptions) => {
      const nativeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Invalid request body')

        const body = JSON.parse(init.body) as { input?: string, voice?: string }

        // Priority: per-request options > provider-level config > defaults
        const voiceSettings: ElevenLabsVoiceSettings = options?.voiceSettings ?? baseVoiceSettings ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS

        return globalThis.fetch(`${normalizedBaseUrl}/text-to-speech/${encodeURIComponent(body.voice ?? '')}`, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'content-type': 'application/json',
            'accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: body.input ?? '',
            model_id: model,
            voice_settings: {
              stability: voiceSettings.stability ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability,
              similarity_boost: voiceSettings.similarityBoost ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarityBoost,
              style: voiceSettings.style,
              use_speaker_boost: voiceSettings.useSpeakerBoost,
            },
          }),
          // The caller aborts the signal when it interrupts the speech segment.
          signal: init.signal,
        })
      }

      return {
        apiKey,
        baseURL: `${normalizedBaseUrl}/`,
        model,
        fetch: nativeFetch,
      }
    },
  }
}

/** Reads the voices of the account from `GET /v1/voices`. */
async function listNativeElevenLabsVoices(apiKey: string, baseUrl: string, signal?: AbortSignal): Promise<VoiceInfo[]> {
  const response = await globalThis.fetch(`${normalizeBaseUrl(baseUrl)}/voices`, {
    headers: { 'xi-api-key': apiKey },
    signal,
  })
  if (!response.ok)
    throw new Error(`ElevenLabs voices request failed: ${response.status} ${response.statusText} ${await response.text().catch(() => '')}`.trim())

  const { voices } = await response.json() as { voices?: ElevenLabsVoiceEntry[] }

  return (voices ?? []).map(voice => ({
    id: voice.voice_id,
    name: voice.name,
    provider: 'elevenlabs',
    description: voice.description ?? undefined,
    gender: voice.labels?.gender,
    previewURL: voice.preview_url ?? undefined,
    languages: resolveVoiceLanguages(voice),
  }))
}

const elevenLabsConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(ELEVENLABS_API_BASE_URL),
  voiceSettings: z.object({
    similarityBoost: z.number().default(DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarityBoost),
    stability: z.number().default(DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability),
  }).default(DEFAULT_ELEVENLABS_VOICE_SETTINGS),
})

type ElevenLabsConfig = z.input<typeof elevenLabsConfigSchema>

function createElevenLabsValidators() {
  return {
    validateConfig: [
      ({ t }: ProviderContext) => ({
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

export const providerElevenLabs = defineProvider<ElevenLabsConfig, 'elevenlabs'>({
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
    // NOTICE: Calls the ElevenLabs API directly instead of the unspeech proxy. See `createNativeElevenLabsProvider`.
    return createNativeElevenLabsProvider(config.apiKey.trim(), config.baseUrl?.trim() || ELEVENLABS_API_BASE_URL, config.voiceSettings)
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
    voiceCatalogConfig: ({ apiKey, baseUrl }) => ({ apiKey, baseUrl }),
    listVoices: async (config, _provider, _model, signal) => {
      const voices = await listNativeElevenLabsVoices(config.apiKey.trim(), config.baseUrl?.trim() || ELEVENLABS_API_BASE_URL, signal)

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

      return rearrangedVoices
    },
  },
})
