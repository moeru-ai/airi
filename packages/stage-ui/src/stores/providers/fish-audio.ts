import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { ListVoicesOptions, UnSpeechOptions, VoiceProviderWithExtraOptions } from 'unspeech'

import type { ModelInfo, ProviderMetadata, VoiceInfo } from '../providers'

import { merge } from '@xsai-ext/providers/utils'
import { listVoices } from 'unspeech'

const PROVIDER_ID = 'fish-audio'
const DEFAULT_BASE_URL = 'https://unspeech.hyp3r.link/v1/'
const DEFAULT_MODEL = 's1'

// Model generations selectable on Fish Audio, sent as `fishaudio/<model>`
// through unSpeech.
// https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
const FISH_AUDIO_TTS_MODELS: { id: string, name: string, description: string }[] = [
  { id: 's1', name: 'S1', description: 'Flagship voice cloning and TTS model' },
  { id: 's2-pro', name: 'S2 Pro', description: 'Multi-speaker dialogue capable model' },
  { id: 's2.1-pro', name: 'S2.1 Pro', description: 'Latest generation pro model' },
  { id: 's2.1-pro-free', name: 'S2.1 Pro (Free)', description: 'Free tier variant of S2.1 Pro' },
]

/** Options accepted by the Fish Audio TTS endpoint through unSpeech. */
export interface UnFishAudioOptions {
  /** Text segment length used when splitting long input, 100 to 300. */
  chunkLength?: number
  /** `balanced` reduces latency at a slight cost to stability. */
  latency?: 'balanced' | 'normal'
  /** Normalize text (e.g. spell out numbers) for better stability. */
  normalize?: boolean
  /** Speech pacing controls. */
  prosody?: {
    /** Speed multiplier, 1.0 is normal speed. */
    speed?: number
    /** Volume gain in dB, 0 is unchanged. */
    volume?: number
  }
  /** Sampling temperature; lower is more deterministic. */
  temperature?: number
  /** Nucleus sampling threshold. */
  topP?: number
}

function toUnSpeechOptions(options: UnFishAudioOptions): UnSpeechOptions {
  // Only known Fish Audio options are forwarded: provider configs are spread
  // into speech() calls wholesale, so unrelated keys (apiKey, baseUrl, model,
  // voice) must not leak into extra_body.
  const extraBody: Record<string, unknown> = {}

  if (options.chunkLength !== undefined)
    extraBody.chunk_length = options.chunkLength
  if (options.latency !== undefined)
    extraBody.latency = options.latency
  if (options.normalize !== undefined)
    extraBody.normalize = options.normalize
  if (options.prosody !== undefined)
    extraBody.prosody = options.prosody
  if (options.temperature !== undefined)
    extraBody.temperature = options.temperature
  if (options.topP !== undefined)
    extraBody.top_p = options.topP

  return { extraBody }
}

// NOTICE:
// Local stand-in for `createUnFishAudio` from the unspeech SDK.
// The fishaudio backend was contributed to moeru-ai/unspeech together with
// this provider, but the published `unspeech` npm package does not export the
// factory yet.
// Source/context: https://github.com/moeru-ai/unspeech (sdk/typescript/src/backend/fishaudio.ts).
// Removal condition: once `unspeech` publishes a release including
// `createUnFishAudio`, bump the catalog version and import it instead.
export function createUnFishAudio(apiKey: string, baseURL = DEFAULT_BASE_URL) {
  // UnSpeechOptions is part of the options type so the returned request
  // options expose the mapped `extraBody` to callers and tests.
  const speechProvider: SpeechProviderWithExtraOptions<string, UnFishAudioOptions & UnSpeechOptions> = {
    speech: (model, options) => ({
      ...(options ? toUnSpeechOptions(options) : {}),
      apiKey,
      baseURL,
      model: `fishaudio/${model || DEFAULT_MODEL}`,
    }),
  }

  const voiceProvider: VoiceProviderWithExtraOptions<UnFishAudioOptions> = {
    voice: (options) => {
      // unSpeech serves /v1/audio/speech but /voices lives at the server
      // root, so the version suffix is stripped for voice listing.
      if (baseURL.endsWith('v1/'))
        baseURL = baseURL.slice(0, -3)
      else if (baseURL.endsWith('v1'))
        baseURL = baseURL.slice(0, -2)

      return {
        query: 'provider=fishaudio',
        ...(options ? toUnSpeechOptions(options) : {}),
        apiKey,
        baseURL,
      }
    },
  }

  return merge(speechProvider, voiceProvider)
}

function toListVoicesOptions(provider: VoiceProviderWithExtraOptions<UnFishAudioOptions>): ListVoicesOptions {
  const { fetch: _fetch, ...voiceOptions } = provider.voice()
  return voiceOptions
}

function normalizeApiKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBaseUrl(value: unknown): string {
  const base = typeof value === 'string' ? value.trim() : ''
  return base || DEFAULT_BASE_URL
}

function listModels(): ModelInfo[] {
  return FISH_AUDIO_TTS_MODELS.map(model => ({
    id: model.id,
    name: model.name,
    provider: PROVIDER_ID,
    description: model.description,
    capabilities: ['text-to-speech'],
  } satisfies ModelInfo))
}

export function buildFishAudioProvider(
  baseUrlValidator: (baseUrl: unknown) => { errors: unknown[], reason: string, valid: boolean } | null | undefined,
): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    category: 'speech',
    tasks: ['text-to-speech'],
    nameKey: 'settings.pages.providers.provider.fish-audio.title',
    name: 'Fish Audio',
    descriptionKey: 'settings.pages.providers.provider.fish-audio.description',
    description: 'fish.audio',
    icon: 'i-lobe-icons:fishaudio',
    defaultOptions: () => ({
      baseUrl: DEFAULT_BASE_URL,
    }),
    createProvider: async (config: Record<string, unknown>) => {
      return createUnFishAudio(normalizeApiKey(config.apiKey), normalizeBaseUrl(config.baseUrl))
    },
    capabilities: {
      listModels: async () => listModels(),
      listVoices: async (config: Record<string, unknown>) => {
        const provider = createUnFishAudio(normalizeApiKey(config.apiKey), normalizeBaseUrl(config.baseUrl))
        const voices = await listVoices(toListVoicesOptions(provider))

        if (!voices || !Array.isArray(voices))
          return []

        return voices.map(voice => ({
          id: voice.id,
          name: voice.name,
          provider: PROVIDER_ID,
          description: voice.description,
          previewURL: voice.preview_audio_url,
          languages: voice.languages,
        } satisfies VoiceInfo))
      },
    },
    validators: {
      chatPingCheckAvailable: false,
      validateProviderConfig: (config: Record<string, unknown>) => {
        const errors: Error[] = []
        if (!normalizeApiKey(config.apiKey))
          errors.push(new Error('API key is required.'))
        if (!config.baseUrl)
          errors.push(new Error('Base URL is required.'))

        if (config.baseUrl) {
          const res = baseUrlValidator(config.baseUrl)
          if (res)
            return res
        }

        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: errors.length === 0,
        }
      },
    },
  }
}
