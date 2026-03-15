import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ProgressInfo } from '@xsai-transformers/shared/types'
import type {
  UnAlibabaCloudOptions,
  UnDeepgramOptions,
  UnElevenLabsOptions,
  UnMicrosoftOptions,
  UnVolcengineOptions,
  VoiceProviderWithExtraOptions,
} from 'unspeech'

import type { AliyunRealtimeSpeechExtraOptions } from './providers/aliyun/stream-transcription'

import { isStageTamagotchi, isUrl } from '@proj-airi/stage-shared'
import { computedAsync, useLocalStorage } from '@vueuse/core'
import {
  createCerebras,
  createFireworks,
  createMistral,
  createMoonshotai,
  createNovitaAi,
  createOllama,
  createOpenAI,
  createPerplexity,
  createTogetherAI,
  createXai,
} from '@xsai-ext/providers/create'
import {
  createAzure,
  createPlayer2,
  createWorkersAI,
} from '@xsai-ext/providers/special/create'
import {
  createChatProvider,
  createModelProvider,
  createSpeechProvider,
  createTranscriptionProvider,
  merge,
} from '@xsai-ext/providers/utils'
import { listModels } from '@xsai/model'
import { debounce, uniqBy } from 'es-toolkit'
import { isWebGPUSupported } from 'gpuu/webgpu'
import { defineStore } from 'pinia'
import {
  createUnAlibabaCloud,
  createUnDeepgram,
  createUnMicrosoft,
  createUnVolcengine,
  listVoices,
} from 'unspeech'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { listProviders as listDefinedProviders } from '../libs/providers'
import { getProviderValidationIntervalMs } from '../libs/providers/validators/run'
import { getKokoroWorker } from '../workers/kokoro'
import { getDefaultKokoroModel, KOKORO_MODELS, kokoroModelsToModelInfo } from '../workers/kokoro/constants'
import { createAliyunNLSProvider as createAliyunNlsStreamProvider } from './providers/aliyun/stream-transcription'
import { convertProviderDefinitionsToMetadata } from './providers/converters'
import { models as elevenLabsModels } from './providers/elevenlabs/list-models'
import { createNativeElevenLabsProvider } from './providers/elevenlabs/native'
import { buildOpenAICompatibleProvider } from './providers/openai-compatible-builder'
import { createWebSpeechAPIProvider } from './providers/web-speech-api'

function logWarn(...args: unknown[]) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('airi:debug') === '1') {
      console.warn(...args)
    }
  }
  catch {
    // Ignore
  }
}

function normalizeProviderBaseUrl(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed)
    return ''

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function toV1SpeechBaseUrl(value: unknown): string {
  const normalized = normalizeProviderBaseUrl(value)
  if (!normalized)
    return ''

  return normalized.endsWith('/v1/') ? normalized : `${normalized}v1/`
}

function toProviderRootBaseUrl(value: unknown): string {
  return toV1SpeechBaseUrl(value).replace(/\/v1\/$/, '/')
}

const ALIYUN_NLS_REGIONS = [
  'cn-shanghai',
  'cn-shanghai-internal',
  'cn-beijing',
  'cn-beijing-internal',
  'cn-shenzhen',
  'cn-shenzhen-internal',
] as const

type AliyunNlsRegion = typeof ALIYUN_NLS_REGIONS[number]

export interface ProviderMetadata {
  id: string
  order?: number
  category: 'chat' | 'embed' | 'speech' | 'transcription'
  tasks: string[]
  nameKey: string // i18n key for provider name
  name: string // Default name (fallback)
  localizedName?: string
  descriptionKey: string // i18n key for description
  description: string // Default description (fallback)
  localizedDescription?: string
  configured?: boolean
  /**
   * Indicates whether the provider is available.
   * If not specified, the provider is always available.
   *
   * May be specified when any of the following criteria is required:
   *
   * Platform requirements:
   *
   * - app-* providers are only available on desktop, this is responsible for Tauri runtime checks
   * - web-* providers are only available on web, this means Node.js and Tauri should not be imported or used
   *
   * System spec requirements:
   *
   * - may requires WebGPU / NVIDIA / other types of GPU,
   *   on Web, WebGPU will automatically compiled to use targeting GPU hardware
   * - may requires significant amount of GPU memory to run, especially for
   *   using of small language models within browser or Tauri app
   * - may requires significant amount of memory to run, especially for those
   *   non-WebGPU supported environments.
   */
  isAvailableBy?: () => Promise<boolean> | boolean
  /**
   * Iconify JSON icon name for the provider.
   *
   * Icons are available for most of the AI provides under @proj-airi/lobe-icons.
   */
  icon?: string
  iconColor?: string
  /**
   * In case of having image instead of icon, you can specify the image URL here.
   */
  iconImage?: string
  defaultOptions?: () => Record<string, unknown>
  createProvider: (
    config: Record<string, unknown>,
  ) =>
    | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions
    | Promise<ChatProvider>
    | Promise<ChatProviderWithExtraOptions>
    | Promise<EmbedProvider>
    | Promise<EmbedProviderWithExtraOptions>
    | Promise<SpeechProvider>
    | Promise<SpeechProviderWithExtraOptions>
    | Promise<TranscriptionProvider>
    | Promise<TranscriptionProviderWithExtraOptions>
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>) => Promise<VoiceInfo[]>
    loadModel?: (config: Record<string, unknown>, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => Promise<void>
  }
  validators: {
    validateProviderConfig: (config: Record<string, unknown>) => Promise<{
      errors: unknown[]
      reason: string
      valid: boolean
    }> | {
      errors: unknown[]
      reason: string
      valid: boolean
    }
  }
  transcriptionFeatures?: {
    supportsGenerate: boolean
    supportsStreamOutput: boolean
    supportsStreamInput: boolean
  }
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  capabilities?: string[]
  contextLength?: number
  deprecated?: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  provider: string
  compatibleModels?: string[]
  description?: string
  gender?: string
  deprecated?: boolean
  previewURL?: string
  languages: {
    code: string
    title: string
  }[]
}

export interface ProviderRuntimeState {
  isConfigured: boolean
  validatedCredentialHash?: string
  models: ModelInfo[]
  isLoadingModels: boolean
  modelLoadError: string | null
}

export const useProvidersStore = defineStore('providers', () => {
  const providerCredentials = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})
  const addedProviders = useLocalStorage<Record<string, boolean>>('settings/providers/added', {})
  const providerInstanceCache = ref<Record<string, unknown>>({})
  const { t } = useI18n()
  const baseUrlValidator = computed(() => (baseUrl: unknown) => {
    let msg = ''
    if (!baseUrl) {
      msg = 'Base URL is required.'
    }
    else if (typeof baseUrl !== 'string') {
      msg = 'Base URL must be a string.'
    }
    else if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0) {
      msg = 'Base URL is not absolute. Try to include a scheme (http:// or https://).'
    }
    else if (!baseUrl.endsWith('/')) {
      msg = 'Base URL must end with a trailing slash (/).'
    }
    if (msg) {
      return {
        errors: [new Error(msg)],
        reason: msg,
        valid: false,
      }
    }
    return null
  })

  async function isBrowserAndMemoryEnough() {
    if (isStageTamagotchi())
      return false

    const webGPUAvailable = await isWebGPUSupported()
    if (webGPUAvailable) {
      return true
    }

    if ('navigator' in globalThis && globalThis.navigator != null && 'deviceMemory' in globalThis.navigator && typeof globalThis.navigator.deviceMemory === 'number') {
      const memory = globalThis.navigator.deviceMemory
      // Check if the device has at least 8GB of RAM
      if (memory >= 8) {
        return true
      }
    }

    return false
  }

  // Centralized provider metadata with provider factory functions
  const providerMetadata: Record<string, ProviderMetadata> = {
    'speech-noop': {
      id: 'speech-noop',
      category: 'speech',
      tasks: ['text-to-speech', 'tts'],
      nameKey: 'settings.pages.providers.provider.speech-noop.title',
      name: 'None',
      descriptionKey: 'settings.pages.providers.provider.speech-noop.description',
      description: 'No speech output.',
      icon: 'i-solar:volume-cross-bold-duotone',
      defaultOptions: () => ({}),
      createProvider: async () => ({
        speech: () => ({
          baseURL: 'http://speech-noop.invalid/v1/',
          model: 'noop',
        }),
      }),
      capabilities: {
        listModels: async () => [],
        listVoices: async () => [],
      },
      validators: {
        validateProviderConfig: () => ({
          errors: [],
          reason: '',
          valid: true,
        }),
      },
    },
    'app-local-audio-speech': buildOpenAICompatibleProvider({
      id: 'app-local-audio-speech',
      name: 'App (Local)',
      nameKey: 'settings.pages.providers.provider.app-local-audio-speech.title',
      descriptionKey: 'settings.pages.providers.provider.app-local-audio-speech.description',
      icon: 'i-lobe-icons:huggingface',
      description: 'https://github.com/huggingface/candle',
      category: 'speech',
      tasks: ['text-to-speech', 'tts'],
      isAvailableBy: isStageTamagotchi,
      creator: createOpenAI,
      validation: [],
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. This is likely a bug, report to developers on https://github.com/moeru-ai/airi/issues.',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    }),
    'app-local-audio-transcription': buildOpenAICompatibleProvider({
      id: 'app-local-audio-transcription',
      name: 'App (Local)',
      nameKey: 'settings.pages.providers.provider.app-local-audio-transcription.title',
      descriptionKey: 'settings.pages.providers.provider.app-local-audio-transcription.description',
      icon: 'i-lobe-icons:huggingface',
      description: 'https://github.com/huggingface/candle',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
      isAvailableBy: isStageTamagotchi,
      creator: createOpenAI,
      validation: [],
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. This is likely a bug, report to developers on https://github.com/moeru-ai/airi/issues.',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    }),
    'browser-local-audio-speech': buildOpenAICompatibleProvider({
      id: 'browser-local-audio-speech',
      name: 'Browser (Local)',
      nameKey: 'settings.pages.providers.provider.browser-local-audio-speech.title',
      descriptionKey: 'settings.pages.providers.provider.browser-local-audio-speech.description',
      icon: 'i-lobe-icons:huggingface',
      description: 'https://github.com/moeru-ai/xsai-transformers',
      category: 'speech',
      tasks: ['text-to-speech', 'tts'],
      isAvailableBy: isBrowserAndMemoryEnough,
      creator: createOpenAI,
      validation: [],
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. This is likely a bug, report to developers on https://github.com/moeru-ai/airi/issues.',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    }),
    'browser-local-audio-transcription': buildOpenAICompatibleProvider({
      id: 'browser-local-audio-transcription',
      name: 'Browser (Local)',
      nameKey: 'settings.pages.providers.provider.browser-local-audio-transcription.title',
      descriptionKey: 'settings.pages.providers.provider.browser-local-audio-transcription.description',
      icon: 'i-lobe-icons:huggingface',
      description: 'https://github.com/moeru-ai/xsai-transformers',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
      isAvailableBy: isBrowserAndMemoryEnough,
      creator: createOpenAI,
      validation: [],
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. This is likely a bug, report to developers on https://github.com/moeru-ai/airi/issues.',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    }),
    'openai-audio-speech': buildOpenAICompatibleProvider({
      id: 'openai-audio-speech',
      name: 'OpenAI',
      nameKey: 'settings.pages.providers.provider.openai.title',
      descriptionKey: 'settings.pages.providers.provider.openai.description',
      icon: 'i-lobe-icons:openai',
      description: 'openai.com',
      category: 'speech',
      tasks: ['text-to-speech'],
      defaultBaseUrl: 'https://api.openai.com/v1/',
      creator: createOpenAI,
      validation: ['health'],
      capabilities: {
        // NOTE: OpenAI does not provide an API endpoint to retrieve available voices.
        // Voices are hardcoded here - this is a provider limitation, not an application limitation.
        // Voice compatibility per https://platform.openai.com/docs/api-reference/audio/createSpeech:
        // - tts-1 and tts-1-hd support: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer (9 voices)
        // - gpt-4o-mini-tts supports all 13 voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar
        listVoices: async (_config: Record<string, unknown>) => {
          return [
            {
              id: 'alloy',
              name: 'Alloy',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'ash',
              name: 'Ash',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'ballad',
              name: 'Ballad',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'coral',
              name: 'Coral',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'echo',
              name: 'Echo',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'fable',
              name: 'Fable',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'onyx',
              name: 'Onyx',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'nova',
              name: 'Nova',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'sage',
              name: 'Sage',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'shimmer',
              name: 'Shimmer',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'verse',
              name: 'Verse',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'marin',
              name: 'Marin',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
            {
              id: 'cedar',
              name: 'Cedar',
              provider: 'openai-audio-speech',
              languages: [],
              compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
            },
          ] satisfies VoiceInfo[]
        },
        listModels: async () => {
          // TESTING NOTES: All 4 models tested and confirmed working with fable voice:
          // - tts-1: {model: "tts-1", input: "test", voice: "fable"} ✓
          // - tts-1-hd: {model: "tts-1-hd", input: "test", voice: "fable"} ✓
          // - gpt-4o-mini-tts: {model: "gpt-4o-mini-tts", input: "test", voice: "fable"} ✓
          // - gpt-4o-mini-tts-2025-12-15: {model: "gpt-4o-mini-tts-2025-12-15", input: "test", voice: "fable"} ✓
          return [
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
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API Key is required'),
            !config.baseUrl && new Error('Base URL is required. Default to https://api.openai.com/v1/ for official OpenAI API.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    }),
    'openai-compatible-audio-speech': buildOpenAICompatibleProvider({
      id: 'openai-compatible-audio-speech',
      name: 'OpenAI Compatible',
      nameKey: 'settings.pages.providers.provider.openai-compatible.title',
      descriptionKey: 'settings.pages.providers.provider.openai-compatible.description',
      icon: 'i-lobe-icons:openai',
      description: 'Connect to any API that follows the OpenAI specification.',
      category: 'speech',
      tasks: ['text-to-speech'],
      capabilities: {
        listVoices: async (config: Record<string, unknown>) => {
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl.endsWith('/'))
            baseUrl += '/'

          if (!baseUrl) {
            return []
          }

          // Attempt to fetch voices from /v1/voices or /voices
          // Try /v1/voices first
          const tryFetchVoices = async (url: string) => {
            try {
              const response = await fetch(url, {
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
              })
              if (response.ok) {
                const data = await response.json()
                // Standard un-speech / openai-like voices response
                const voices = data.voices || data.data || (Array.isArray(data) ? data : null)
                if (Array.isArray(voices)) {
                  return voices.map((v: any) => ({
                    id: v.id || v.voice_id || v.name,
                    name: v.name || v.id,
                    provider: 'openai-compatible-audio-speech',
                    previewURL: v.preview_url || v.preview_audio_url,
                    languages: v.languages || [],
                    gender: v.gender || v.labels?.gender,
                  }))
                }
              }
            }
            catch (e) {
              logWarn(`Failed to fetch voices from ${url}:`, e)
            }
            return null
          }

          const voices = await tryFetchVoices(`${baseUrl}voices`) || await tryFetchVoices(`${baseUrl.replace(/\/v1\/$/, '/')}/voices`)

          return voices || []
        },
        listModels: async (config: Record<string, unknown>) => {
          // Filter models to only include TTS models
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl.endsWith('/'))
            baseUrl += '/'

          if (!apiKey || !baseUrl) {
            return []
          }

          const provider = await createOpenAI(apiKey, baseUrl)
          if (!provider || typeof provider.model !== 'function') {
            return []
          }

          const models = await listModels({
            apiKey,
            baseURL: baseUrl,
          })

          // Filter for TTS/Speech/Audio models
          return models
            .filter((model: any) => {
              const modelId = model.id.toLowerCase()
              // Include models that contain "tts", "speech", "audio", or "kokoro" in their ID
              return modelId.includes('tts') || modelId.includes('speech') || modelId.includes('audio') || modelId.includes('kokoro')
            })
            .map((model: any) => {
              return {
                id: model.id,
                name: model.name || model.display_name || model.id,
                provider: 'openai-compatible-audio-speech',
                description: model.description || '',
                contextLength: model.context_length || 0,
                deprecated: false,
              } satisfies ModelInfo
            })
        },
      },
      creator: createOpenAI,
    }),
    'chatterbox': buildOpenAICompatibleProvider({
      id: 'chatterbox',
      name: 'Chatterbox',
      nameKey: 'settings.pages.providers.provider.chatterbox.title',
      descriptionKey: 'settings.pages.providers.provider.chatterbox.description',
      icon: 'i-solar:microphone-3-bold-duotone',
      description: 'Local Chatterbox TTS server with preset-aware voice management.',
      category: 'speech',
      tasks: ['text-to-speech'],
      defaultBaseUrl: 'http://127.0.0.1:8090/v1/',
      capabilities: {
        listVoices: async (config: Record<string, unknown>) => {
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const apiBaseUrl = toV1SpeechBaseUrl(config.baseUrl)
          if (!apiBaseUrl)
            return []

          try {
            const response = await fetch(`${apiBaseUrl}voices`, {
              headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            })
            if (!response.ok)
              return []

            const data = await response.json()
            const voices = Array.isArray(data?.voices) ? data.voices : []
            return voices.map((voice: any) => ({
              id: voice.voice_id || voice.id || voice.name,
              name: voice.name || voice.voice_id || voice.id,
              provider: 'chatterbox',
              description: voice.type === 'virtual' ? 'Preset voice' : 'Native voice',
              previewURL: voice.preview_url || voice.preview_audio_url,
              languages: [{ code: 'en', title: 'English' }],
              gender: voice.gender || voice.labels?.gender,
            }) satisfies VoiceInfo)
          }
          catch (error) {
            logWarn('Failed to fetch Chatterbox voices:', error)
            return []
          }
        },
        listModels: async (config: Record<string, unknown>) => {
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const apiBaseUrl = toV1SpeechBaseUrl(config.baseUrl)
          if (!apiBaseUrl) {
            return [{
              id: 'chatterbox',
              name: 'Chatterbox',
              provider: 'chatterbox',
              description: 'Chatterbox speech generation',
              contextLength: 0,
              deprecated: false,
            }]
          }

          try {
            const response = await fetch(`${apiBaseUrl}models`, {
              headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            })
            if (!response.ok)
              throw new Error(`HTTP ${response.status}`)

            const data = await response.json()
            const models = Array.isArray(data?.data) ? data.data : []
            if (models.length > 0) {
              return models.map((model: any) => ({
                id: model.id,
                name: model.name || model.display_name || model.id,
                provider: 'chatterbox',
                description: model.description || 'Chatterbox speech generation',
                contextLength: model.context_length || 0,
                deprecated: false,
              }) satisfies ModelInfo)
            }
          }
          catch (error) {
            logWarn('Failed to fetch Chatterbox models:', error)
          }

          return [{
            id: 'chatterbox',
            name: 'Chatterbox',
            provider: 'chatterbox',
            description: 'Chatterbox speech generation',
            contextLength: 0,
            deprecated: false,
          }]
        },
      },
      validators: {
        validateProviderConfig: async (config: Record<string, unknown>) => {
          const errors: Error[] = []
          const baseUrl = toV1SpeechBaseUrl(config.baseUrl)
          const rootBaseUrl = toProviderRootBaseUrl(config.baseUrl)
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''

          if (!baseUrl) {
            errors.push(new Error('Base URL is required'))
          }
          else if (!isUrl(baseUrl)) {
            errors.push(new Error('Base URL is invalid. It must be an absolute URL.'))
          }

          if (errors.length > 0) {
            return {
              errors,
              reason: errors.map(error => error.message).join(', '),
              valid: false,
            }
          }

          try {
            const response = await fetch(`${rootBaseUrl}chatterbox/capabilities`, {
              headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            })
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`)
            }
          }
          catch (error) {
            const connectivityError = new Error(`Capabilities check failed: ${(error as Error).message}`)
            return {
              errors: [connectivityError],
              reason: connectivityError.message,
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
      creator: createOpenAI,
    }),
    'openai-audio-transcription': buildOpenAICompatibleProvider({
      id: 'openai-audio-transcription',
      name: 'OpenAI',
      nameKey: 'settings.pages.providers.provider.openai.title',
      descriptionKey: 'settings.pages.providers.provider.openai.description',
      icon: 'i-lobe-icons:openai',
      description: 'openai.com',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
      defaultBaseUrl: 'https://api.openai.com/v1/',
      creator: createOpenAI,
      validation: ['health'],
      capabilities: {
        listModels: async () => {
          // OpenAI transcription models are hardcoded (no API endpoint to list them)
          return [
            {
              id: 'gpt-4o-transcribe',
              name: 'GPT-4o Transcribe',
              provider: 'openai-audio-transcription',
              description: 'High-quality transcription model',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'gpt-4o-mini-transcribe',
              name: 'GPT-4o Mini Transcribe',
              provider: 'openai-audio-transcription',
              description: 'Faster, cost-effective transcription model',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'gpt-4o-mini-transcribe-2025-12-15',
              name: 'GPT-4o Mini Transcribe (2025-12-15)',
              provider: 'openai-audio-transcription',
              description: 'GPT-4o Mini Transcribe snapshot from 2025-12-15',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'whisper-1',
              name: 'Whisper-1',
              provider: 'openai-audio-transcription',
              description: 'Powered by our open source Whisper V2 model',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'gpt-4o-transcribe-diarize',
              name: 'GPT-4o Transcribe Diarize',
              provider: 'openai-audio-transcription',
              description: 'Transcription with speaker diarization',
              contextLength: 0,
              deprecated: false,
            },
          ] satisfies ModelInfo[]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API Key is required'),
            !config.baseUrl && new Error('Base URL is required. Default to https://api.openai.com/v1/ for official OpenAI API.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    }),
    'openai-compatible-audio-transcription': buildOpenAICompatibleProvider({
      id: 'openai-compatible-audio-transcription',
      name: 'OpenAI Compatible',
      nameKey: 'settings.pages.providers.provider.openai-compatible.title',
      descriptionKey: 'settings.pages.providers.provider.openai-compatible.description',
      icon: 'i-lobe-icons:openai',
      description: 'Connect to any API that follows the OpenAI specification.',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
      creator: createOpenAI,
      capabilities: {
        listModels: async (config: Record<string, unknown>) => {
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl.endsWith('/'))
            baseUrl += '/'

          if (!apiKey || !baseUrl) {
            return []
          }

          try {
            const models = await listModels({
              apiKey,
              baseURL: baseUrl,
            })

            // Filter for transcription models (whisper, stt, asr, transcription)
            return models
              .filter((model: any) => {
                const modelId = model.id.toLowerCase()
                return modelId.includes('whisper') || modelId.includes('stt') || modelId.includes('asr') || modelId.includes('transcription')
              })
              .map((model: any) => {
                return {
                  id: model.id,
                  name: model.name || model.display_name || model.id,
                  provider: 'openai-compatible-audio-transcription',
                  description: model.description || '',
                  contextLength: 0,
                  deprecated: false,
                } satisfies ModelInfo
              })
          }
          catch (e) {
            logWarn('Failed to list transcription models:', e)
            return []
          }
        },
      },
    }),
    'aliyun-nls-transcription': {
      id: 'aliyun-nls-transcription',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
      nameKey: 'settings.pages.providers.provider.aliyun-nls.title',
      name: 'Aliyun NLS',
      descriptionKey: 'settings.pages.providers.provider.aliyun-nls.description',
      description: 'nls-console.aliyun.com',
      icon: 'i-lobe-icons:alibabacloud',
      defaultOptions: () => ({
        accessKeyId: '',
        accessKeySecret: '',
        appKey: '',
        region: 'cn-shanghai',
      }),
      transcriptionFeatures: {
        supportsGenerate: false,
        supportsStreamOutput: true,
        supportsStreamInput: true,
      },
      createProvider: async (config) => {
        const toString = (value: unknown) => typeof value === 'string' ? value.trim() : ''

        const accessKeyId = toString(config.accessKeyId)
        const accessKeySecret = toString(config.accessKeySecret)
        const appKey = toString(config.appKey)
        const region = toString(config.region)
        const resolvedRegion = ALIYUN_NLS_REGIONS.includes(region as AliyunNlsRegion) ? region as AliyunNlsRegion : 'cn-shanghai'

        if (!accessKeyId || !accessKeySecret || !appKey)
          throw new Error('Aliyun NLS credentials are incomplete.')

        const provider = createAliyunNlsStreamProvider(accessKeyId, accessKeySecret, appKey, { region: resolvedRegion })

        return {
          transcription: (model: string, extraOptions?: AliyunRealtimeSpeechExtraOptions) => provider.speech(model, {
            ...extraOptions,
            sessionOptions: {
              format: 'pcm',
              sample_rate: 16000,
              enable_punctuation_prediction: true,
              enable_intermediate_result: true,
              enable_words: true,
              ...extraOptions?.sessionOptions,
            },
          }),
        } as TranscriptionProviderWithExtraOptions<string, AliyunRealtimeSpeechExtraOptions>
      },
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'aliyun-nls-v1',
              name: 'Aliyun NLS Realtime',
              provider: 'aliyun-nls-transcription',
              description: 'Realtime streaming transcription using Aliyun NLS.',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors: Error[] = []
          const toString = (value: unknown) => typeof value === 'string' ? value.trim() : ''

          const accessKeyId = toString(config.accessKeyId)
          const accessKeySecret = toString(config.accessKeySecret)
          const appKey = toString(config.appKey)
          const region = toString(config.region)

          if (!accessKeyId)
            errors.push(new Error('Access Key ID is required.'))
          if (!accessKeySecret)
            errors.push(new Error('Access Key Secret is required.'))
          if (!appKey)
            errors.push(new Error('App Key is required.'))
          if (region && !ALIYUN_NLS_REGIONS.includes(region as AliyunNlsRegion))
            errors.push(new Error('Region is invalid.'))

          return {
            errors,
            reason: errors.length > 0 ? errors.map(error => error.message).join(', ') : '',
            valid: errors.length === 0,
          }
        },
      },
    },
    'browser-web-speech-api': {
      id: 'browser-web-speech-api',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
      nameKey: 'settings.pages.providers.provider.browser-web-speech-api.title',
      name: 'Web Speech API (Browser)',
      descriptionKey: 'settings.pages.providers.provider.browser-web-speech-api.description',
      description: 'Browser-native speech recognition. No API keys.',
      icon: 'i-solar:microphone-bold-duotone',
      defaultOptions: () => ({
        language: 'en-US',
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
      }),
      transcriptionFeatures: {
        supportsGenerate: false,
        supportsStreamOutput: true,
        supportsStreamInput: true,
      },
      isAvailableBy: async () => {
        // Web Speech API is only available in browser contexts, NOT in Electron
        // Even though Electron uses Chromium, Web Speech API requires Google's embedded API keys
        // which are not available in Electron, causing it to fail at runtime
        if (typeof window === 'undefined')
          return false

        // Explicitly exclude Electron - Web Speech API doesn't work there
        if (isStageTamagotchi())
          return false

        // Check if API is available in browser
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
      },
      createProvider: async (_config) => {
        // Web Speech API doesn't need config, but we accept it for consistency
        return createWebSpeechAPIProvider()
      },
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'web-speech-api',
              name: 'Web Speech API',
              provider: 'browser-web-speech-api',
              description: 'Browser-native speech recognition (no API keys required)',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: () => {
          // Web Speech API requires no configuration, just browser support
          // Always return valid if browser supports it, so it auto-configures
          const isAvailable = typeof window !== 'undefined'
            && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

          if (!isAvailable) {
            return {
              errors: [new Error('Web Speech API is not available. It requires a browser context with SpeechRecognition support (Chrome, Edge, Safari).')],
              reason: 'Web Speech API is not available in this environment.',
              valid: false,
            }
          }

          // Auto-configure if available (no credentials needed)
          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    },
    'elevenlabs': {
      id: 'elevenlabs',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.elevenlabs.title',
      name: 'ElevenLabs',
      descriptionKey: 'settings.pages.providers.provider.elevenlabs.description',
      description: 'elevenlabs.io',
      icon: 'i-simple-icons:elevenlabs',
      defaultOptions: () => ({
        baseUrl: 'https://api.elevenlabs.io/v1/',
        voiceSettings: {
          similarityBoost: 0.75,
          stability: 0.5,
        },
      }),
      createProvider: async (config) => {
        const apiKey = (config.apiKey as string).trim()
        const baseUrl = (config.baseUrl as string).trim().replace(/\/$/, '')
        const voiceSettings = (config as any).voiceSettings ?? { similarityBoost: 0.75, stability: 0.5 }

        // We bypass the unspeech proxy and call ElevenLabs' native API directly across
        // all platforms. Previously this was Desktop-only due to CORS issues, but
        // ElevenLabs now returns 'Access-Control-Allow-Origin: *'. This avoids the
        // HTTP 401 errors caused by many users sharing the public unspeech proxy IP.
        return createNativeElevenLabsProvider(apiKey, baseUrl, voiceSettings) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
      },
      capabilities: {
        listModels: async () => {
          return elevenLabsModels.map((model) => {
            return {
              id: model.model_id,
              name: model.name,
              provider: 'elevenlabs',
              description: model.description,
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
        listVoices: async (config) => {
          const apiKey = (config.apiKey as string).trim()
          const baseUrl = (config.baseUrl as string).trim().replace(/\/$/, '')

          // Fetch ElevenLabs native GET /v1/voices directly.
          // The unspeech SDK's listVoices() constructs {baseURL}/api/voices?provider=elevenlabs
          // which does not exist on api.elevenlabs.io. We bypass it and call the real endpoint.
          const res = await fetch(`${baseUrl}/voices`, { headers: { 'xi-api-key': apiKey } })
          if (!res.ok)
            throw new Error(`ElevenLabs voices: ${res.status} ${res.statusText}`)

          const { voices: raw } = await res.json() as { voices: { voice_id: string, name: string, preview_url?: string, labels?: Record<string, string>, fine_tuning?: { language?: string } }[] }
          const voices = (raw ?? []).map(v => ({
            id: v.voice_id,
            name: v.name,
            provider: 'elevenlabs' as const,
            previewURL: v.preview_url,
            languages: v.fine_tuning?.language ? [{ code: v.fine_tuning.language, title: v.fine_tuning.language }] : [],
            gender: v.labels?.gender,
          }))

          if (!voices || !Array.isArray(voices)) {
            return []
          }

          // Rearrange — move Aria & Bill range to the end
          const lo = Math.min(...['Aria', 'Bill'].map((n) => {
            const i = voices.findIndex(v => v.name.includes(n))
            return i !== -1 ? i : voices.length - 1
          }))
          const hi = Math.max(...['Aria', 'Bill'].map((n) => {
            const i = voices.findIndex(v => v.name.includes(n))
            return i !== -1 ? i : 0
          }))
          return [...voices.slice(0, lo), ...voices.slice(hi + 1), ...voices.slice(lo, hi + 1)]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API key is required.'),
            !config.baseUrl && new Error('Base URL is required.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    },
    'deepgram-tts': {
      id: 'deepgram-tts',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.deepgram-tts.title',
      name: 'Deepgram',
      descriptionKey: 'settings.pages.providers.provider.deepgram-tts.description',
      description: 'deepgram.com',
      icon: 'i-simple-icons:deepgram',
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
      createProvider: async (config) => {
        const provider = createUnDeepgram((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as SpeechProviderWithExtraOptions<string, UnDeepgramOptions>
        return provider
      },
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'aura-2',
              name: 'Aura 2',
              provider: 'deepgram-tts',
              description: 'Latest generation Aura model',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'aura-1',
              name: 'Aura 1',
              provider: 'deepgram-tts',
              description: 'First generation Aura model',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'aura',
              name: 'Aura (Legacy)',
              provider: 'deepgram-tts',
              description: 'Original Aura model',
              contextLength: 0,
              deprecated: true,
            },
          ]
        },
        listVoices: async (config) => {
          const provider = createUnDeepgram((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as VoiceProviderWithExtraOptions<UnDeepgramOptions>

          const voices = await listVoices({
            ...provider.voice(),
          })

          return voices.map((voice) => {
            return {
              id: voice.id,
              name: voice.name,
              provider: 'deepgram-tts',
              description: voice.description,
              languages: voice.languages,
              gender: voice.labels?.gender,
            }
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors: Error[] = []
          if (!config.apiKey) {
            errors.push(new Error('API key is required.'))
          }

          const baseUrlValidationResult = baseUrlValidator.value(config.baseUrl)
          if (baseUrlValidationResult) {
            errors.push(...(baseUrlValidationResult.errors as Error[]))
          }

          return {
            errors,
            reason: errors.map(e => e.message).join(', '),
            valid: errors.length === 0,
          }
        },
      },
    },
    'microsoft-speech': {
      id: 'microsoft-speech',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.microsoft-speech.title',
      name: 'Microsoft / Azure Speech',
      descriptionKey: 'settings.pages.providers.provider.microsoft-speech.description',
      description: 'speech.microsoft.com',
      iconColor: 'i-lobe-icons:microsoft',
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
      createProvider: async config => createUnMicrosoft((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as SpeechProviderWithExtraOptions<string, UnMicrosoftOptions>,
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'v1',
              name: 'v1',
              provider: 'microsoft-speech',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
        listVoices: async (config) => {
          const provider = createUnMicrosoft((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as VoiceProviderWithExtraOptions<UnMicrosoftOptions>

          const voices = await listVoices({
            ...provider.voice({ region: config.region as string }),
          })

          return voices.map((voice) => {
            return {
              id: voice.id,
              name: voice.name,
              provider: 'microsoft-speech',
              previewURL: voice.preview_audio_url,
              languages: voice.languages,
              gender: voice.labels?.gender,
            }
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API key is required.'),
            !config.baseUrl && new Error('Base URL is required.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    },
    'index-tts-vllm': {
      id: 'index-tts-vllm',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.index-tts-vllm.title',
      name: 'Index-TTS by Bilibili',
      descriptionKey: 'settings.pages.providers.provider.index-tts-vllm.description',
      description: 'index-tts.github.io',
      iconColor: 'i-lobe-icons:bilibiliindex',
      defaultOptions: () => ({
        baseUrl: 'http://localhost:11996/tts/',
        model: 'IndexTTS-1.5',
      }),
      createProvider: async (config) => {
        const provider: SpeechProvider = {
          speech: () => {
            const req = {
              baseURL: config.baseUrl as string,
              model: (config.model as string) || 'IndexTTS-1.5',
            }
            return req
          },
        }
        return provider
      },
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'IndexTTS-1.5',
              name: 'IndexTTS-1.5',
              provider: 'index-tts-vllm',
              description: 'Default model for Index-TTS vLLM deployment',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
        listVoices: async (config) => {
          const voicesUrl = config.baseUrl as string
          const response = await fetch(`${voicesUrl}audio/voices`)
          if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.statusText}`)
          }
          const voices = await response.json()
          return Object.keys(voices).map((voice: any) => {
            return {
              id: voice,
              name: voice,
              provider: 'index-tts-vllm',
              // previewURL: voice.preview_audio_url,
              languages: [{ code: 'cn', title: 'Chinese' }, { code: 'en', title: 'English' }],
            }
          })
        },
      },
      validators: {
        validateProviderConfig: async (config) => {
          const errors = [
            !config.baseUrl && new Error('Base URL is required. Default to http://localhost:11996/tts/ for Index-TTS.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const response = await fetch(`${config.baseUrl as string}audio/voices`, { signal: controller.signal })
            clearTimeout(timeout)

            if (!response.ok) {
              const reason = `IndexTTS unreachable: HTTP ${response.status} ${response.statusText}`
              return { errors: [new Error(reason)], reason, valid: false }
            }
          }
          catch (err) {
            const reason = `IndexTTS connection failed: ${String(err)}`
            return { errors: [err as Error], reason, valid: false }
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: errors.length === 0,
          }
        },
      },
    },
    'alibaba-cloud-model-studio': {
      id: 'alibaba-cloud-model-studio',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.alibaba-cloud-model-studio.title',
      name: 'Alibaba Cloud Model Studio',
      descriptionKey: 'settings.pages.providers.provider.alibaba-cloud-model-studio.description',
      description: 'bailian.console.aliyun.com',
      iconColor: 'i-lobe-icons:alibabacloud',
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
      createProvider: async config => createUnAlibabaCloud((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listVoices: async (config) => {
          const provider = createUnAlibabaCloud((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as VoiceProviderWithExtraOptions<UnAlibabaCloudOptions>

          const voices = await listVoices({
            ...provider.voice(),
          })

          return voices.map((voice) => {
            return {
              id: voice.id,
              name: voice.name,
              provider: 'alibaba-cloud-model-studio',
              compatibleModels: voice.compatible_models,
              previewURL: voice.preview_audio_url,
              languages: voice.languages,
              gender: voice.labels?.gender,
            }
          })
        },
        listModels: async () => {
          return [
            {
              id: 'cosyvoice-v1',
              name: 'CosyVoice',
              provider: 'alibaba-cloud-model-studio',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'cosyvoice-v2',
              name: 'CosyVoice (New)',
              provider: 'alibaba-cloud-model-studio',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API key is required.'),
            !config.baseUrl && new Error('Base URL is required.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    },
    'volcengine': {
      id: 'volcengine',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.volcengine.title',
      name: 'settings.pages.providers.provider.volcengine.title',
      descriptionKey: 'settings.pages.providers.provider.volcengine.description',
      description: 'volcengine.com',
      iconColor: 'i-lobe-icons:volcengine',
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
      createProvider: async config => createUnVolcengine((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listVoices: async (config) => {
          const provider = createUnVolcengine((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as VoiceProviderWithExtraOptions<UnVolcengineOptions>

          const voices = await listVoices({
            ...provider.voice(),
          })

          return voices.map((voice) => {
            return {
              id: voice.id,
              name: voice.name,
              provider: 'volcano-engine',
              previewURL: voice.preview_audio_url,
              languages: voice.languages,
              gender: voice.labels?.gender,
            }
          })
        },
        listModels: async () => {
          return [
            {
              id: 'v1',
              name: 'v1',
              provider: 'volcano-engine',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API key is required.'),
            !config.baseUrl && new Error('Base URL is required.'),
            !((config.app as any)?.appId) && new Error('App ID is required.'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl && !!config.app && !!(config.app as any).appId,
          }
        },
      },
    },
    'openrouter-audio-speech': {
      id: 'openrouter-audio-speech',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.openrouter-audio-speech.title',
      name: 'OpenRouter',
      descriptionKey: 'settings.pages.providers.provider.openrouter-audio-speech.description',
      description: 'openrouter.ai',
      icon: 'i-lobe-icons:openrouter',
      defaultOptions: () => ({
        baseUrl: 'https://openrouter.ai/api/v1/',
      }),
      createProvider: async (config) => {
        const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
        let baseUrl = (typeof config.baseUrl === 'string' && config.baseUrl.trim()) || 'https://openrouter.ai/api/v1/'
        if (!baseUrl.endsWith('/'))
          baseUrl += '/'

        const provider: SpeechProvider = {
          speech: (model?: string) => ({
            baseURL: baseUrl,
            model: model || 'openai/gpt-audio-mini',
            fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
              if (!init?.body || typeof init.body !== 'string')
                throw new Error('Invalid request body')

              const body = JSON.parse(init.body)
              const text = body.input
              const voice = body.voice

              const sseResponse = await globalThis.fetch(new URL('chat/completions', baseUrl), {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: model || 'openai/gpt-audio-mini',
                  messages: [
                    { role: 'user', content: `Read this text aloud exactly as written, without any commentary or extra words:\n\n${text}` },
                  ],
                  modalities: ['text', 'audio'],
                  audio: { voice, format: 'pcm16' },
                  stream: true,
                }),
              })

              if (!sseResponse.ok) {
                const errorText = await sseResponse.text()
                throw new Error(`OpenRouter audio request failed: ${sseResponse.status} ${errorText}`)
              }

              const reader = sseResponse.body!.getReader()
              const decoder = new TextDecoder()
              const audioDataChunks: string[] = []
              let buffer = ''

              while (true) {
                const { done, value } = await reader.read()
                if (done)
                  break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()!

                for (const line of lines) {
                  if (!line.startsWith('data: '))
                    continue
                  const data = line.slice('data: '.length).trim()
                  if (data === '[DONE]')
                    break

                  try {
                    const chunk = JSON.parse(data)
                    const audio = chunk.choices?.[0]?.delta?.audio
                    if (audio?.data)
                      audioDataChunks.push(audio.data)
                  }
                  catch (e) {
                    // skip malformed chunks, but log them for debugging
                    console.warn('Skipping malformed SSE chunk from OpenRouter audio stream:', data, e)
                  }
                }
              }

              // Decode base64 PCM16 data
              const fullBase64 = audioDataChunks.join('')
              const binaryString = atob(fullBase64)
              const pcmBytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++)
                pcmBytes[i] = binaryString.charCodeAt(i)

              // Wrap raw PCM16 in a WAV header so the browser can play it
              const sampleRate = 24000
              const numChannels = 1
              const bitsPerSample = 16
              const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
              const blockAlign = numChannels * (bitsPerSample / 8)
              const wavHeader = new ArrayBuffer(44)
              const view = new DataView(wavHeader)
              const writeStr = (offset: number, str: string) => {
                for (let i = 0; i < str.length; i++)
                  view.setUint8(offset + i, str.charCodeAt(i))
              }

              // RIFF chunk descriptor
              writeStr(0, 'RIFF') // ChunkID
              view.setUint32(4, 36 + pcmBytes.length, true) // ChunkSize
              writeStr(8, 'WAVE') // Format

              // "fmt " sub-chunk
              writeStr(12, 'fmt ') // Subchunk1ID
              view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
              view.setUint16(20, 1, true) // AudioFormat (1 for PCM)
              view.setUint16(22, numChannels, true) // NumChannels
              view.setUint32(24, sampleRate, true) // SampleRate
              view.setUint32(28, byteRate, true) // ByteRate
              view.setUint16(32, blockAlign, true) // BlockAlign
              view.setUint16(34, bitsPerSample, true) // BitsPerSample

              // "data" sub-chunk
              writeStr(36, 'data') // Subchunk2ID
              view.setUint32(40, pcmBytes.length, true) // Subchunk2Size

              const wavBytes = new Uint8Array(44 + pcmBytes.length)
              wavBytes.set(new Uint8Array(wavHeader), 0)
              wavBytes.set(pcmBytes, 44)

              return new Response(wavBytes.buffer, {
                status: 200,
                headers: { 'Content-Type': 'audio/wav' },
              })
            },
          }),
        }
        return provider
      },
      capabilities: {
        listModels: async (config: Record<string, unknown>) => {
          let baseUrl = (typeof config.baseUrl === 'string' && config.baseUrl.trim()) || 'https://openrouter.ai/api/v1/'
          if (!baseUrl.endsWith('/'))
            baseUrl += '/'

          try {
            const res = await fetch(`${baseUrl}models?output_modality=audio`)
            if (!res.ok)
              return []

            const json = await res.json()
            const models = json.data || []
            return models.map((m: any) => ({
              id: m.id,
              name: m.name || m.id,
              provider: 'openrouter-audio-speech',
              description: m.description || '',
              contextLength: m.context_length || 0,
              deprecated: false,
            } satisfies ModelInfo))
          }
          catch {
            return []
          }
        },
        listVoices: async () => {
          // OpenRouter audio models support standard OpenAI voices
          return [
            'alloy',
            'ash',
            'ballad',
            'coral',
            'echo',
            'fable',
            'onyx',
            'nova',
            'sage',
            'shimmer',
            'verse',
          ].map(id => ({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            provider: 'openrouter-audio-speech',
            languages: [],
          } satisfies VoiceInfo))
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors: Error[] = []
          if (!config.apiKey)
            errors.push(new Error('API Key is required.'))

          if (config.baseUrl) {
            const res = baseUrlValidator.value(config.baseUrl)
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
    },
    'comet-api-speech': buildOpenAICompatibleProvider({
      id: 'comet-api-speech',
      name: 'CometAPI Speech',
      nameKey: 'settings.pages.providers.provider.comet-api.title',
      descriptionKey: 'settings.pages.providers.provider.comet-api.description',
      icon: 'i-lobe-icons:cometapi',
      description: 'cometapi.com',
      category: 'speech',
      tasks: ['text-to-speech'],
      defaultBaseUrl: 'https://api.cometapi.com/v1/',
      creator: (apiKey, baseURL = 'https://api.cometapi.com/v1/') => merge(
        createModelProvider({ apiKey, baseURL }),
        createSpeechProvider({ apiKey, baseURL }),
      ),
      validation: ['model_list'],
    }),
    'comet-api-transcription': buildOpenAICompatibleProvider({
      id: 'comet-api-transcription',
      name: 'CometAPI Transcription',
      nameKey: 'settings.pages.providers.provider.comet-api.title',
      descriptionKey: 'settings.pages.providers.provider.comet-api.description',
      icon: 'i-lobe-icons:cometapi',
      description: 'cometapi.com',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
      defaultBaseUrl: 'https://api.cometapi.com/v1/',
      creator: (apiKey, baseURL = 'https://api.cometapi.com/v1/') => merge(
        createModelProvider({ apiKey, baseURL }),
        createTranscriptionProvider({ apiKey, baseURL }),
      ),
      validation: ['model_list'],
    }),

    'cerebras-ai': buildOpenAICompatibleProvider({
      id: 'cerebras-ai',
      name: 'Cerebras',
      nameKey: 'settings.pages.providers.provider.cerebras.title',
      descriptionKey: 'settings.pages.providers.provider.cerebras.description',
      icon: 'i-lobe-icons:cerebras',
      description: 'cerebras.ai',
      defaultBaseUrl: 'https://api.cerebras.ai/v1/',
      creator: createCerebras,
      validation: ['health', 'model_list'],
      iconColor: 'i-lobe-icons:cerebras-color',
    }),
    'together-ai': buildOpenAICompatibleProvider({
      id: 'together-ai',
      name: 'Together.ai',
      nameKey: 'settings.pages.providers.provider.together.title',
      descriptionKey: 'settings.pages.providers.provider.together.description',
      icon: 'i-lobe-icons:together',
      description: 'together.ai',
      defaultBaseUrl: 'https://api.together.xyz/v1/',
      creator: createTogetherAI,
      validation: ['health', 'model_list'],
      iconColor: 'i-lobe-icons:together',
    }),
    'azure-ai-foundry': {
      id: 'azure-ai-foundry',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.azure-ai-foundry.title',
      name: 'Azure AI Foundry',
      descriptionKey: 'settings.pages.providers.provider.azure-ai-foundry.description',
      description: 'azure.com',
      icon: 'i-lobe-icons:microsoft',
      defaultOptions: () => ({}),
      createProvider: async (config) => {
        return await createAzure({
          apiKey: async () => (config.apiKey as string).trim(),
          resourceName: config.resourceName as string,
          apiVersion: config.apiVersion as string,
        })
      },
      capabilities: {
        listModels: async (config) => {
          return [{ id: config.modelId }].map((model) => {
            return {
              id: model.id as string,
              name: model.id as string,
              provider: 'azure-ai-foundry',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          // return !!config.apiKey && !!config.resourceName && !!config.modelId

          const errors = [
            !config.apiKey && new Error('API key is required'),
            !config.resourceName && new Error('Resource name is required'),
            !config.modelId && new Error('Model ID is required'),
          ]

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.resourceName && !!config.modelId,
          }
        },
      },
    },
    'xai': buildOpenAICompatibleProvider({
      id: 'xai',
      name: 'xAI',
      nameKey: 'settings.pages.providers.provider.xai.title',
      descriptionKey: 'settings.pages.providers.provider.xai.description',
      icon: 'i-lobe-icons:xai',
      description: 'x.ai',
      defaultBaseUrl: 'https://api.x.ai/v1/',
      creator: createXai,
      validation: ['health', 'model_list'],
    }),
    'xai-audio-speech': buildOpenAICompatibleProvider({
      id: 'xai-audio-speech',
      name: 'xAI',
      nameKey: 'settings.pages.providers.provider.xai-audio-speech.title',
      descriptionKey: 'settings.pages.providers.provider.xai-audio-speech.description',
      icon: 'i-lobe-icons:xai',
      description: 'x.ai',
      category: 'speech',
      tasks: ['text-to-speech'],
      defaultBaseUrl: 'https://api.x.ai/v1/',
      creator: (apiKey, baseURL = 'https://api.x.ai/v1/') => merge(
        createModelProvider({ apiKey, baseURL }),
        createSpeechProvider({ apiKey, baseURL }),
      ),
      validation: ['health'],
      capabilities: {
        // xAI provides 6 voices for TTS
        // Per https://docs.x.ai/docs/guides/voice documentation
        listVoices: async (_config: Record<string, unknown>) => {
          return [
            {
              id: 'Ara',
              name: 'Ara',
              provider: 'xai-audio-speech',
              description: 'Female voice (default)',
              gender: 'female',
              languages: [],
            },
            {
              id: 'Rex',
              name: 'Rex',
              provider: 'xai-audio-speech',
              description: 'Male voice',
              gender: 'male',
              languages: [],
            },
            {
              id: 'Sal',
              name: 'Sal',
              provider: 'xai-audio-speech',
              description: 'Voice',
              languages: [],
            },
            {
              id: 'Eve',
              name: 'Eve',
              provider: 'xai-audio-speech',
              description: 'Female voice',
              gender: 'female',
              languages: [],
            },
            {
              id: 'Una',
              name: 'Una',
              provider: 'xai-audio-speech',
              description: 'Female voice',
              gender: 'female',
              languages: [],
            },
            {
              id: 'Leo',
              name: 'Leo',
              provider: 'xai-audio-speech',
              description: 'Male voice',
              gender: 'male',
              languages: [],
            },
          ] satisfies VoiceInfo[]
        },
        listModels: async () => {
          // xAI uses a single TTS endpoint without specific model selection
          return [
            {
              id: 'grok-2-tts',
              name: 'Grok 2 TTS',
              provider: 'xai-audio-speech',
              description: 'xAI Grok text-to-speech model',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API Key is required'),
            !config.baseUrl && new Error('Base URL is required. Default to https://api.x.ai/v1/ for xAI API.'),
          ].filter(Boolean)

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    }),
    'xai-audio-transcription': buildOpenAICompatibleProvider({
      id: 'xai-audio-transcription',
      name: 'xAI',
      nameKey: 'settings.pages.providers.provider.xai-audio-transcription.title',
      descriptionKey: 'settings.pages.providers.provider.xai-audio-transcription.description',
      icon: 'i-lobe-icons:xai',
      description: 'x.ai',
      category: 'transcription',
      tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
      defaultBaseUrl: 'https://api.x.ai/v1/',
      creator: (apiKey, baseURL = 'https://api.x.ai/v1/') => merge(
        createModelProvider({ apiKey, baseURL }),
        createTranscriptionProvider({ apiKey, baseURL }),
      ),
      validation: ['health'],
      transcriptionFeatures: {
        supportsGenerate: true,
        supportsStreamOutput: false,
        supportsStreamInput: false,
      },
      capabilities: {
        listModels: async () => {
          // xAI uses a single transcription endpoint
          return [
            {
              id: 'grok-2-transcribe',
              name: 'Grok 2 Transcribe',
              provider: 'xai-audio-transcription',
              description: 'xAI Grok speech-to-text model',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API Key is required'),
            !config.baseUrl && new Error('Base URL is required. Default to https://api.x.ai/v1/ for xAI API.'),
          ].filter(Boolean)

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.baseUrl,
          }
        },
      },
    }),
    'vllm': {
      id: 'vllm',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.vllm.title',
      name: 'vLLM',
      descriptionKey: 'settings.pages.providers.provider.vllm.description',
      description: 'vllm.ai',
      iconColor: 'i-lobe-icons:vllm',
      createProvider: async config => createOllama((config.baseUrl as string).trim()),
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'llama-2-7b',
              name: 'Llama 2 (7B)',
              provider: 'vllm',
              description: 'Meta\'s Llama 2 7B parameter model',
              contextLength: 4096,
            },
            {
              id: 'llama-2-13b',
              name: 'Llama 2 (13B)',
              provider: 'vllm',
              description: 'Meta\'s Llama 2 13B parameter model',
              contextLength: 4096,
            },
            {
              id: 'llama-2-70b',
              name: 'Llama 2 (70B)',
              provider: 'vllm',
              description: 'Meta\'s Llama 2 70B parameter model',
              contextLength: 4096,
            },
            {
              id: 'mistral-7b',
              name: 'Mistral (7B)',
              provider: 'vllm',
              description: 'Mistral AI\'s 7B parameter model',
              contextLength: 8192,
            },
            {
              id: 'mixtral-8x7b',
              name: 'Mixtral (8x7B)',
              provider: 'vllm',
              description: 'Mistral AI\'s Mixtral 8x7B MoE model',
              contextLength: 32768,
            },
            {
              id: 'custom',
              name: 'Custom Model',
              provider: 'vllm',
              description: 'Specify a custom model name',
              contextLength: 0,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. Default to http://localhost:8000/v1/ for vLLM.',
              valid: false,
            }
          }

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          // Check if the vLLM is reachable
          return fetch(`${(config.baseUrl as string).trim()}models`, { headers: (config.headers as HeadersInit) || undefined })
            .then((response) => {
              const errors = [
                !response.ok && new Error(`vLLM returned non-ok status code: ${response.statusText}`),
              ].filter(Boolean)

              return {
                errors,
                reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
                valid: response.ok,
              }
            })
            .catch((err) => {
              return {
                errors: [err],
                reason: `Failed to reach vLLM, error: ${String(err)} occurred.`,
                valid: false,
              }
            })
        },
      },
    },
    'novita-ai': buildOpenAICompatibleProvider({
      id: 'novita-ai',
      name: 'Novita',
      nameKey: 'settings.pages.providers.provider.novita.title',
      descriptionKey: 'settings.pages.providers.provider.novita.description',
      icon: 'i-lobe-icons:novita',
      description: 'novita.ai',
      defaultBaseUrl: 'https://api.novita.ai/openai/',
      creator: createNovitaAi,
      validation: ['health', 'model_list'],
      iconColor: 'i-lobe-icons:novita',
    }),
    'fireworks-ai': buildOpenAICompatibleProvider({
      id: 'fireworks-ai',
      name: 'Fireworks.ai',
      nameKey: 'settings.pages.providers.provider.fireworks.title',
      descriptionKey: 'settings.pages.providers.provider.fireworks.description',
      icon: 'i-lobe-icons:fireworks',
      description: 'fireworks.ai',
      defaultBaseUrl: 'https://api.fireworks.ai/inference/v1/',
      creator: createFireworks,
      validation: ['health', 'model_list'],
    }),
    'featherless-ai': buildOpenAICompatibleProvider({
      id: 'featherless-ai',
      name: 'Featherless.ai',
      nameKey: 'settings.pages.providers.provider.featherless.title',
      descriptionKey: 'settings.pages.providers.provider.featherless.description',
      icon: 'i-lobe-icons:featherless-ai',
      description: 'featherless.ai',
      defaultBaseUrl: 'https://api.featherless.ai/v1/',
      creator: createOpenAI,
      validation: ['health', 'model_list'],
    }),
    'cloudflare-workers-ai': {
      id: 'cloudflare-workers-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.cloudflare-workers-ai.title',
      name: 'Cloudflare Workers AI',
      descriptionKey: 'settings.pages.providers.provider.cloudflare-workers-ai.description',
      description: 'cloudflare.com',
      iconColor: 'i-lobe-icons:cloudflare',
      createProvider: async config => createWorkersAI((config.apiKey as string).trim(), config.accountId as string),
      capabilities: {
        listModels: async () => {
          return []
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          const errors = [
            !config.apiKey && new Error('API key is required.'),
            !config.accountId && new Error('Account ID is required.'),
          ].filter(Boolean)

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: !!config.apiKey && !!config.accountId,
          }
        },
      },
    },
    'comet-api': buildOpenAICompatibleProvider({
      id: 'comet-api',
      name: 'CometAPI',
      nameKey: 'settings.pages.providers.provider.comet-api.title',
      descriptionKey: 'settings.pages.providers.provider.comet-api.description',
      icon: 'i-lobe-icons:cometapi',
      description: 'cometapi.com',
      defaultBaseUrl: 'https://api.cometapi.com/v1/',
      creator: (apiKey, baseURL = 'https://api.cometapi.com/v1/') => merge(
        createChatProvider({ apiKey, baseURL }),
        createModelProvider({ apiKey, baseURL }),
      ),
      validation: ['model_list'],
    }),
    'perplexity-ai': buildOpenAICompatibleProvider({
      id: 'perplexity-ai',
      name: 'Perplexity',
      nameKey: 'settings.pages.providers.provider.perplexity.title',
      descriptionKey: 'settings.pages.providers.provider.perplexity.description',
      icon: 'i-lobe-icons:perplexity',
      description: 'perplexity.ai',
      defaultBaseUrl: 'https://api.perplexity.ai/',
      creator: createPerplexity,
      validation: ['health', 'model_list'],
    }),
    'mistral-ai': buildOpenAICompatibleProvider({
      id: 'mistral-ai',
      name: 'Mistral',
      nameKey: 'settings.pages.providers.provider.mistral.title',
      descriptionKey: 'settings.pages.providers.provider.mistral.description',
      icon: 'i-lobe-icons:mistral',
      description: 'mistral.ai',
      defaultBaseUrl: 'https://api.mistral.ai/v1/',
      creator: createMistral,
      validation: ['health', 'model_list'],
      iconColor: 'i-lobe-icons:mistral',
    }),
    'moonshot-ai': buildOpenAICompatibleProvider({
      id: 'moonshot-ai',
      name: 'Moonshot AI',
      nameKey: 'settings.pages.providers.provider.moonshot.title',
      descriptionKey: 'settings.pages.providers.provider.moonshot.description',
      icon: 'i-lobe-icons:moonshot',
      description: 'moonshot.ai',
      defaultBaseUrl: 'https://api.moonshot.ai/v1/',
      creator: createMoonshotai,
      validation: ['health', 'model_list'],
    }),
    'modelscope': buildOpenAICompatibleProvider({
      id: 'modelscope',
      name: 'ModelScope',
      nameKey: 'settings.pages.providers.provider.modelscope.title',
      descriptionKey: 'settings.pages.providers.provider.modelscope.description',
      icon: 'i-lobe-icons:modelscope',
      description: 'modelscope',
      defaultBaseUrl: 'https://api-inference.modelscope.cn/v1/',
      creator: createOpenAI,
      validation: ['health', 'model_list'],
      iconColor: 'i-lobe-icons:modelscope',
    }),
    'player2': {
      id: 'player2',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.player2.title',
      name: 'Player2',
      descriptionKey: 'settings.pages.providers.provider.player2.description',
      description: 'player2.game',
      icon: 'i-lobe-icons:player2',
      defaultOptions: () => ({
        baseUrl: 'http://localhost:4315/v1/',
      }),
      createProvider: (config) => {
        return createPlayer2((config.baseUrl as string).trim())
      },
      capabilities: {
        listModels: async () => [
          {
            id: 'player2-model',
            name: 'Player2 Model',
            provider: 'player2',
          },
        ],
      },
      validators: {
        validateProviderConfig: async (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. Default to http://localhost:4315/v1/',
              valid: false,
            }
          }

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          // Check if the local running Player 2 is reachable
          return await fetch(`${config.baseUrl}health`, {
            method: 'GET',
            headers: {
              'player2-game-key': 'airi',
            },
          })
            .then((response) => {
              const errors = [
                !response.ok && new Error(`Player 2 returned non-ok status code: ${response.statusText}`),
              ].filter(Boolean)

              return {
                errors,
                reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
                valid: response.ok,
              }
            })
            .catch((err) => {
              return {
                errors: [err],
                reason: `Failed to reach Player 2, error: ${String(err)} occurred. If you do not have Player 2 running, please start it and try again.`,
                valid: false,
              }
            })
        },
      },
    },

    'player2-speech': {
      id: 'player2-speech',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.player2.title',
      name: 'Player2 Speech',
      descriptionKey: 'settings.pages.providers.provider.player2.description',
      description: 'player2.game',
      icon: 'i-lobe-icons:player2',
      defaultOptions: () => ({
        baseUrl: 'http://localhost:4315/v1/',
      }),
      createProvider: async config => createPlayer2((config.baseUrl as string).trim(), 'airi'),
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'player2-tts',
              name: 'Player2 Speech',
              provider: 'player2-speech',
              description: 'Default model for Player2 speech endpoint',
              contextLength: 0,
              deprecated: false,
            },
          ]
        },
        listVoices: async (config) => {
          const baseUrl = (config.baseUrl as string).endsWith('/') ? (config.baseUrl as string).slice(0, -1) : config.baseUrl as string
          return await fetch(`${baseUrl}/tts/voices`).then(res => res.json()).then(({ voices }) => (voices as { id: string, language: 'american_english' | 'british_english' | 'japanese' | 'mandarin_chinese' | 'spanish' | 'french' | 'hindi' | 'italian' | 'brazilian_portuguese', name: string, gender: string }[]).map(({ id, language, name, gender }) => (
            {

              id,
              name,
              provider: 'player2-speech',
              gender,
              languages: [{
                american_english: {
                  code: 'en',
                  title: 'English',
                },
                british_english: {
                  code: 'en',
                  title: 'English',
                },
                japanese: {
                  code: 'ja',
                  title: 'Japanese',
                },
                mandarin_chinese: {
                  code: 'zh',
                  title: 'Chinese',
                },
                spanish: {
                  code: 'es',
                  title: 'Spanish',
                },
                french: {
                  code: 'fr',
                  title: 'French',
                },
                hindi: {
                  code: 'hi',
                  title: 'Hindi',
                },

                italian: {
                  code: 'it',
                  title: 'Italian',
                },
                brazilian_portuguese:
                {
                  code: 'pt',
                  title: 'Portuguese',
                },

              }[language]],
            }
          )))
        },
      },
      validators: {
        validateProviderConfig: async (config) => {
          const errors = [
            !config.baseUrl && new Error('Base URL is required. Default to http://localhost:4315/v1/'),
          ].filter(Boolean)

          const res = baseUrlValidator.value(config.baseUrl)
          if (res)
            return res

          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const response = await fetch(`${config.baseUrl as string}health`, {
              method: 'GET',
              headers: {
                'player2-game-key': 'airi',
              },
              signal: controller.signal,
            })
            clearTimeout(timeout)

            if (!response.ok) {
              const reason = `Player2 speech unreachable: HTTP ${response.status} ${response.statusText}`
              return { errors: [new Error(reason)], reason, valid: false }
            }
          }
          catch (err) {
            const reason = `Player2 speech connection failed: ${String(err)}`
            return { errors: [err as Error], reason, valid: false }
          }

          return {
            errors,
            reason: errors.filter(e => e).map(e => String(e)).join(', ') || '',
            valid: errors.length === 0,
          }
        },
      },
    },
    'kokoro-local': {
      id: 'kokoro-local',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.kokoro-local.title',
      name: 'Kokoro TTS',
      descriptionKey: 'settings.pages.providers.provider.kokoro-local.description',
      description: 'Local text-to-speech using Kokoro-82M.',
      icon: 'i-lobe-icons:speaker',

      defaultOptions: () => {
        const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
        const model = getDefaultKokoroModel(hasWebGPU)
        return {
          model,
          voiceId: '',
        }
      },

      createProvider: async (_config) => {
        // Import the worker manager
        const workerManagerPromise = getKokoroWorker()

        const provider: SpeechProvider = {
          speech: () => {
            return {
              baseURL: 'http://kokoro-local/v1/',
              model: 'kokoro-82m',
              fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
                try {
                  // Parse OpenAI-compatible request body
                  if (!init?.body || typeof init.body !== 'string') {
                    throw new Error('Invalid request body')
                  }
                  const body = JSON.parse(init.body)
                  const text = body.input
                  const voice = body.voice

                  if (!voice) {
                    throw new Error('Voice parameter is required')
                  }

                  // Generate audio in the worker thread
                  const buffer = await (await workerManagerPromise).generate(text, voice)

                  return new Response(buffer, {
                    status: 200,
                    headers: {
                      'Content-Type': 'audio/wav',
                    },
                  })
                }
                catch (error) {
                  console.error('Kokoro TTS generation failed:', error)
                  throw error
                }
              },
            }
          },
        }

        return provider
      },

      capabilities: {
        listModels: async (_config: Record<string, unknown>) => {
          const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
          return kokoroModelsToModelInfo(hasWebGPU, t)
        },

        loadModel: async (config: Record<string, unknown>, _hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => {
          const modelId = config.model as string

          if (!modelId) {
            throw new Error('No model specified')
          }

          const modelDef = KOKORO_MODELS.find(m => m.id === modelId)
          if (!modelDef) {
            throw new Error(`Invalid model: ${modelId}. Must be one of: ${KOKORO_MODELS.map(m => m.id).join(', ')}`)
          }

          // Validate platform requirements
          if (modelDef.platform === 'webgpu') {
            const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
            if (!hasWebGPU) {
              throw new Error('WebGPU is required for this model but is not available in your browser')
            }
          }

          try {
            const workerManager = await getKokoroWorker()
            await workerManager.loadModel(modelDef.quantization, modelDef.platform, { onProgress: _hooks?.onProgress })
          }
          catch (error) {
            console.error('Failed to load Kokoro model:', error)
            throw error
          }
        },

        listVoices: async (config: Record<string, unknown>) => {
          try {
            // Reload the model before fetching voices
            const modelId = config.model as string
            if (modelId) {
              const modelDef = KOKORO_MODELS.find(m => m.id === modelId)
              if (modelDef) {
                // Validate platform requirements
                if (modelDef.platform === 'webgpu') {
                  const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
                  if (!hasWebGPU) {
                    throw new Error('WebGPU is required for this model but is not available in your browser')
                  }
                }

                // Load the model
                const workerManager = await getKokoroWorker()
                await workerManager.loadModel(modelDef.quantization, modelDef.platform)
              }
            }

            // Get worker manager and fetch voices from the model
            const workerManager = await getKokoroWorker()
            const modelVoices = workerManager.getVoices()

            // Language code mapping
            const languageMap: Record<string, { code: string, title: string }> = {
              'en-us': { code: 'en-US', title: 'English (US)' },
              'en-gb': { code: 'en-GB', title: 'English (UK)' },
              'ja': { code: 'ja', title: 'Japanese' },
              'zh-cn': { code: 'zh-CN', title: 'Chinese (Mandarin)' },
              'es': { code: 'es', title: 'Spanish' },
              'fr': { code: 'fr', title: 'French' },
              'hi': { code: 'hi', title: 'Hindi' },
              'it': { code: 'it', title: 'Italian' },
              'pt-br': { code: 'pt-BR', title: 'Portuguese (Brazil)' },
            }

            // Transform the voices object to the expected array format
            return Object.entries(modelVoices).map(([id, voice]: [string, { language: string, name: string, gender: string }]) => {
              const languageCode = voice.language.toLowerCase()
              const languageInfo = languageMap[languageCode] || { code: languageCode, title: voice.language }

              return {
                id,
                name: `${voice.name} (${voice.gender}, ${languageInfo.title.split('(')[0].trim()})`,
                provider: 'kokoro-local',
                languages: [languageInfo],
                gender: voice.gender.toLowerCase(),
              }
            })
          }
          catch (error) {
            console.error('Failed to fetch Kokoro voices:', error)
            // Return empty array if model not loaded yet
            return []
          }
        },
      },

      validators: {
        validateProviderConfig: async (config: any) => {
          const model = config.model as string

          if (!model) {
            return {
              errors: [new Error('No model selected')],
              reason: 'Please select a model from the dropdown menu',
              valid: false,
            }
          }

          if (!KOKORO_MODELS.some(m => m.id === model)) {
            return {
              errors: [new Error(`Invalid model: ${model}`)],
              reason: `Invalid model. Must be one of: ${KOKORO_MODELS.map(m => m.id).join(', ')}`,
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    },
  }

  // Progressive migration bridge:
  // translate unified provider definitions from libs/providers to legacy store metadata.
  // Existing metadata remains as fallback for providers not yet migrated.
  const definedProviders = listDefinedProviders()

  const translatedProviderMetadata = convertProviderDefinitionsToMetadata(
    definedProviders,
    t,
    providerMetadata,
  )

  const providerValidationIntervalMsById = new Map<string, number>()
  for (const definition of definedProviders) {
    const intervalMs = getProviderValidationIntervalMs({
      definition,
      contextOptions: { t },
    })
    if (intervalMs && intervalMs > 0) {
      providerValidationIntervalMsById.set(definition.id, intervalMs)
    }
  }

  // Keep only legacy ASR/TTS providers as hand-written metadata.
  // All other categories are sourced from unified definitions in libs/providers.
  for (const [providerId, existing] of Object.entries(providerMetadata)) {
    if (existing.category !== 'speech' && existing.category !== 'transcription') {
      delete providerMetadata[providerId]
    }
  }

  // Populate non-speech providers from unified registry translation.
  for (const [providerId, translated] of Object.entries(translatedProviderMetadata)) {
    if (translated.category === 'speech' || translated.category === 'transcription') {
      continue
    }
    providerMetadata[providerId] = translated
  }

  // const validatedCredentials = ref<Record<string, string>>({})
  const providerRuntimeState = ref<Record<string, ProviderRuntimeState>>({})
  const providerValidationInFlight = new Map<string, Promise<boolean>>()

  const configuredProviders = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isConfigured
    }

    return result
  })

  function markProviderAdded(providerId: string) {
    addedProviders.value[providerId] = true
  }

  function unmarkProviderAdded(providerId: string) {
    delete addedProviders.value[providerId]
  }

  // Configuration validation functions
  async function validateProvider(providerId: string, options: { force?: boolean } = {}): Promise<boolean> {
    const metadata = providerMetadata[providerId]
    if (!metadata)
      return false

    if (!metadata)
      return false

    const config = providerCredentials.value[providerId]
    if (!config && providerId !== 'browser-web-speech-api')
      return false

    const configString = JSON.stringify(config || {})
    const runtimeState = providerRuntimeState.value[providerId]
    const cacheKey = `${providerId}:${configString}`
    const forceValidation = options.force === true

    if (!forceValidation && runtimeState?.validatedCredentialHash === configString && typeof runtimeState.isConfigured === 'boolean')
      return runtimeState.isConfigured

    if (!forceValidation) {
      const pending = providerValidationInFlight.get(cacheKey)
      if (pending) {
        return pending
      }
    }

    const runValidation = async () => {
      const validationResult = await metadata.validators.validateProviderConfig(config || {})

      // Suppress logging and toasts for unconfigured providers unless forced
      const configObj = (config || {}) as Record<string, any>
      const hasKey = !!configObj.apiKey?.trim()
      const defaultUrl = (metadata.defaultOptions?.() as any)?.baseUrl || ''
      const hasCustomUrl = !!configObj.baseUrl?.trim() && configObj.baseUrl !== defaultUrl
      const isConfigured = hasKey || hasCustomUrl
      const isUnconfigured = !validationResult.valid && !isConfigured

      if ((window as any).electron?.ipcRenderer) {
        // Only send results to the main process if it's NOT unconfigured.
        // Even if forced (periodic check), we don't want terminal spam for things that aren't set up.
        if (!isUnconfigured) {
          try {
            // Use safe cloning to prevent "object could not be cloned" errors with Vue/Pinia Proxies
            const safeConfig = config ? JSON.parse(JSON.stringify({ ...config, apiKey: config.apiKey ? '***' : undefined })) : undefined

            ;(window as any).electron.ipcRenderer.send('provider-validation-result', {
              providerId,
              valid: validationResult.valid,
              reason: validationResult.reason,
              config: safeConfig,
            })
          }
          catch (e) {
            console.error('[Provider Validation] IPC send failed:', e)
          }
        }
      }

      if (!validationResult.valid && options.force && !isUnconfigured) {
        const localizedName = t(metadata.nameKey, metadata.name)
        toast.error(`Provider "${localizedName}" validation failed`, {
          description: validationResult.reason || 'Check your configuration in Settings > Providers.',
        })
      }

      if (providerRuntimeState.value[providerId]) {
        providerRuntimeState.value[providerId].isConfigured = validationResult.valid
        providerRuntimeState.value[providerId].validatedCredentialHash = configString
        // Auto-mark Web Speech API as added if valid and available
        if (validationResult.valid && ['browser-web-speech-api', 'player2'].includes(providerId)) {
          markProviderAdded(providerId)
        }
      }

      return validationResult.valid
    }

    if (forceValidation) {
      return runValidation()
    }

    const task = runValidation()
    providerValidationInFlight.set(cacheKey, task)
    return task.finally(() => {
      providerValidationInFlight.delete(cacheKey)
    })
  }

  // Create computed properties for each provider's configuration status

  function getDefaultProviderConfig(providerId: string) {
    const metadata = providerMetadata[providerId]
    const defaultOptions = metadata?.defaultOptions?.() || {}
    return {
      ...defaultOptions,
      ...(Object.prototype.hasOwnProperty.call(defaultOptions, 'baseUrl') ? {} : { baseUrl: '' }),
    }
  }

  // Initialize provider configurations
  function initializeProvider(providerId: string) {
    if (!providerCredentials.value[providerId]) {
      providerCredentials.value[providerId] = getDefaultProviderConfig(providerId)
    }
    if (!providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId] = {
        isConfigured: false,
        models: [],
        isLoadingModels: false,
        modelLoadError: null,
      }
    }
  }

  // Object.keys(providerMetadata).forEach(initializeProvider)

  // Update configuration status for all configured providers
  const updateConfigurationStatus = debounce(async () => {
    await Promise.all(Object.entries(providerMetadata)
      // TODO: ignore un-configured provider
      // .filter(([_, provider]) => provider.configured)
      .map(async ([providerId]) => {
        try {
          if (providerRuntimeState.value[providerId]) {
            const isValid = await validateProvider(providerId)
            providerRuntimeState.value[providerId].isConfigured = isValid
          }
        }
        catch {
          if (providerRuntimeState.value[providerId]) {
            providerRuntimeState.value[providerId].isConfigured = false
          }
        }
      }))
  }, 250)

  // Call initially and watch for changes
  watch(providerCredentials, updateConfigurationStatus, { deep: true, immediate: false })

  // Initialize all providers
  Object.keys(providerMetadata).forEach(initializeProvider)

  // Initial validation run
  void updateConfigurationStatus()

  // Available providers (only those that are properly configured)
  const availableProviders = computed(() => Object.keys(providerMetadata).filter(providerId => providerRuntimeState.value[providerId]?.isConfigured))

  // Store available models for each provider
  const availableModels = computed(() => {
    const result: Record<string, ModelInfo[]> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.models
    }
    return result
  })

  const isLoadingModels = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isLoadingModels
    }
    return result
  })

  const modelLoadError = computed(() => {
    const result: Record<string, string | null> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelLoadError
    }
    return result
  })

  function deleteProvider(providerId: string) {
    delete providerCredentials.value[providerId]
    delete providerRuntimeState.value[providerId]
    unmarkProviderAdded(providerId)
  }

  function forceProviderConfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = true
      // Also cache the current config to prevent re-validation from overwriting
      const config = providerCredentials.value[providerId]
      if (config) {
        providerRuntimeState.value[providerId].validatedCredentialHash = JSON.stringify(config)
      }
    }
    markProviderAdded(providerId)
  }

  async function resetProviderSettings() {
    providerCredentials.value = {}
    addedProviders.value = {}
    providerRuntimeState.value = {}

    Object.keys(providerMetadata).forEach(initializeProvider)
    await updateConfigurationStatus()
  }

  // Function to fetch models for a specific provider
  async function fetchModelsForProvider(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return []

    const metadata = providerMetadata[providerId]
    if (!metadata)
      return []

    const runtimeState = providerRuntimeState.value[providerId]
    if (runtimeState) {
      runtimeState.isLoadingModels = true
      runtimeState.modelLoadError = null
    }

    try {
      const models = metadata.capabilities.listModels ? await metadata.capabilities.listModels(config) : []

      // Transform and store the models
      if (runtimeState) {
        runtimeState.models = uniqBy(models.filter(model => !!model.id), m => m.id)
          .map(model => ({
            id: model.id,
            name: model.name,
            description: model.description,
            contextLength: model.contextLength,
            deprecated: model.deprecated,
            provider: providerId,
          }))
        return runtimeState.models
      }
      return []
    }
    catch (error) {
      console.error(`Error fetching models for ${providerId}:`, error)
      if (runtimeState) {
        runtimeState.modelLoadError = error instanceof Error ? error.message : 'Unknown error'
      }
      return []
    }
    finally {
      if (runtimeState) {
        runtimeState.isLoadingModels = false
      }
    }
  }

  // Get models for a specific provider
  function getModelsForProvider(providerId: string) {
    return providerRuntimeState.value[providerId]?.models || []
  }

  // Get all available models across all configured providers
  const allAvailableModels = computed(() => {
    const models: ModelInfo[] = []
    for (const providerId of availableProviders.value) {
      models.push(...(providerRuntimeState.value[providerId]?.models || []))
    }
    return models
  })

  // Load models for all configured providers
  async function loadModelsForConfiguredProviders() {
    for (const providerId of availableProviders.value) {
      if (providerMetadata[providerId].capabilities.listModels) {
        await fetchModelsForProvider(providerId)
      }
    }
  }
  const previousCredentialHashes = ref<Record<string, string>>({})

  // Watch for credential changes and refetch models accordingly
  watch(providerCredentials, (newCreds) => {
    const changedProviders: string[] = []

    for (const providerId in newCreds) {
      const currentConfig = newCreds[providerId]
      const currentHash = JSON.stringify(currentConfig)
      const previousHash = previousCredentialHashes.value[providerId]

      if (currentHash !== previousHash) {
        changedProviders.push(providerId)
        previousCredentialHashes.value[providerId] = currentHash
      }
    }

    for (const providerId of changedProviders) {
      // Since credentials changed, dispose the cached instance so new creds take effect.
      void disposeProviderInstance(providerId)

      // If the provider is configured and has the capability, refetch its models
      if (providerRuntimeState.value[providerId]?.isConfigured && providerMetadata[providerId]?.capabilities.listModels) {
        fetchModelsForProvider(providerId)
      }
    }
  }, { deep: true, immediate: true })

  // Function to get localized provider metadata
  function getProviderMetadata(providerId: string) {
    const metadata = providerMetadata[providerId]

    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    return {
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
    }
  }

  // Get all providers metadata (for settings page)
  const allProvidersMetadata = computed(() => {
    return Object.values(providerMetadata).map(metadata => ({
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
      configured: providerRuntimeState.value[metadata.id]?.isConfigured || false,
    }))
  })

  function getTranscriptionFeatures(providerId: string) {
    const metadata = providerMetadata[providerId]
    const features = metadata?.transcriptionFeatures

    return {
      supportsGenerate: features?.supportsGenerate ?? true,
      supportsStreamOutput: features?.supportsStreamOutput ?? false,
      supportsStreamInput: features?.supportsStreamInput ?? false,
    }
  }

  // Function to get provider object by provider id
  async function getProviderInstance<R extends
  | ChatProvider
  | ChatProviderWithExtraOptions
  | EmbedProvider
  | EmbedProviderWithExtraOptions
  | SpeechProvider
  | SpeechProviderWithExtraOptions
  | TranscriptionProvider
  | TranscriptionProviderWithExtraOptions,
  >(providerId: string): Promise<R> {
    const cached = providerInstanceCache.value[providerId] as R | undefined
    if (cached)
      return cached

    const metadata = providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    // Web Speech API doesn't require credentials - use empty config
    let config = providerCredentials.value[providerId]
    if (!config && providerId === 'browser-web-speech-api') {
      config = getDefaultProviderConfig(providerId)
      providerCredentials.value[providerId] = config
    }

    if (!config && providerId !== 'browser-web-speech-api')
      throw new Error(`Provider credentials for ${providerId} not found`)

    try {
      const instance = await metadata.createProvider(config || {}) as R
      providerInstanceCache.value[providerId] = instance
      return instance
    }
    catch (error) {
      console.error(`Error creating provider instance for ${providerId}:`, error)
      throw error
    }
  }

  async function disposeProviderInstance(providerId: string) {
    const instance = providerInstanceCache.value[providerId] as { dispose?: () => Promise<void> | void } | undefined
    if (instance?.dispose)
      await instance.dispose()

    delete providerInstanceCache.value[providerId]
  }

  const availableProvidersMetadata = computedAsync<ProviderMetadata[]>(async () => {
    const providers: ProviderMetadata[] = []

    for (const provider of allProvidersMetadata.value) {
      const p = getProviderMetadata(provider.id)
      const isAvailableBy = p.isAvailableBy || (() => true)

      const isAvailable = await isAvailableBy()
      if (isAvailable) {
        providers.push(provider)
      }
    }

    return providers
  }, [])

  const allChatProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  const allAudioSpeechProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'speech')
  })

  const allAudioTranscriptionProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'transcription')
  })

  const configuredChatProvidersMetadata = computed(() => {
    return allChatProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id] || shouldListProvider(metadata.id))
  })

  const configuredSpeechProvidersMetadata = computed(() => {
    return allAudioSpeechProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id] || shouldListProvider(metadata.id))
  })

  const configuredTranscriptionProvidersMetadata = computed(() => {
    return allAudioTranscriptionProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id] || shouldListProvider(metadata.id))
  })

  function isProviderConfigDirty(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return false

    const defaultOptions = getDefaultProviderConfig(providerId)
    return JSON.stringify(config) !== JSON.stringify(defaultOptions)
  }

  function shouldListProvider(providerId: string) {
    return !!addedProviders.value[providerId] || isProviderConfigDirty(providerId)
  }

  const persistedProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => shouldListProvider(metadata.id))
  })

  const persistedChatProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  const persistedSpeechProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'speech')
  })

  const persistedTranscriptionProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'transcription')
  })

  function getProviderConfig(providerId: string) {
    return providerCredentials.value[providerId]
  }

  return {
    providers: providerCredentials,
    getProviderConfig,
    addedProviders,
    markProviderAdded,
    unmarkProviderAdded,
    deleteProvider,
    availableProviders,
    configuredProviders,
    providerRuntimeState,
    providerMetadata,
    getProviderMetadata,
    getTranscriptionFeatures,
    allProvidersMetadata,
    initializeProvider,
    validateProvider,
    availableModels,
    isLoadingModels,
    modelLoadError,
    fetchModelsForProvider,
    getModelsForProvider,
    allAvailableModels,
    loadModelsForConfiguredProviders,
    getProviderInstance,
    disposeProviderInstance,
    resetProviderSettings,
    forceProviderConfigured,
    availableProvidersMetadata,
    allChatProvidersMetadata,
    allAudioSpeechProvidersMetadata,
    allAudioTranscriptionProvidersMetadata,
    configuredChatProvidersMetadata,
    configuredSpeechProvidersMetadata,
    configuredTranscriptionProvidersMetadata,
    persistedProvidersMetadata,
    persistedChatProvidersMetadata,
    persistedSpeechProvidersMetadata,
    persistedTranscriptionProvidersMetadata,
  }
})
