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
  createDeepSeek,
  createFireworks,
  createGoogleGenerativeAI,
  createMistral,
  createMoonshotai,
  createNovita,
  createOllama,
  createOpenAI,
  createOpenRouter,
  createPerplexity,
  createTogetherAI,
  createXai,
} from '@xsai-ext/providers/create'
import { createAzure, createPlayer2, createWorkersAI } from '@xsai-ext/providers/special/create'
import {
  createChatProvider,
  createEmbedProvider,
  createModelProvider,
  createSpeechProvider,
  createTranscriptionProvider,
  merge,
} from '@xsai-ext/providers/utils'
import { listModels } from '@xsai/model'
import { isWebGPUSupported } from 'gpuu/webgpu'
import { defineStore } from 'pinia'
import {
  createUnAlibabaCloud,
  createUnDeepgram,
  createUnElevenLabs,
  createUnMicrosoft,
  createUnVolcengine,
  listVoices,
} from 'unspeech'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { providerAlibabaCloudModelStudioSpeech } from '../libs/providers/providers/alibaba-cloud-model-studio/speech'
import { providerAliyunNlsTranscription } from '../libs/providers/providers/aliyun-nls-transcription/transcription'
import { providerBrowserWebSpeechAPITranscription } from '../libs/providers/providers/browser-web-speech-api/transcription'
import { providerDeepgramTTSSpeech } from '../libs/providers/providers/deepgram-tts/speech'
import { providerElevenLabsSpeech } from '../libs/providers/providers/elevenlabs/speech'
import { providerIndexTTSSpeech } from '../libs/providers/providers/index-tts-vllm/speech'
import { providerMicrosoftSpeech } from '../libs/providers/providers/microsoft-speech/speech'
import { providerOpenAICompatibleSpeech } from '../libs/providers/providers/openai-compatible/speech'
import { providerOpenAICompatibleTranscription } from '../libs/providers/providers/openai-compatible/transcription'
import { providerOpenAISpeech } from '../libs/providers/providers/openai/speech'
import { providerOpenAITranscription } from '../libs/providers/providers/openai/transcription'
import { providerPlayer2Speech } from '../libs/providers/providers/player2-speech/speech'
import { providerVolcengineSpeech } from '../libs/providers/providers/volcengine/speech'
import { convertProviderDefinitionToMetadata } from './providers/converters'
import { buildOpenAICompatibleProvider } from './providers/openai-compatible-builder'
import { createWebSpeechAPIProvider } from './providers/web-speech-api'

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

function createAnthropic(apiKey: string, baseURL: string = 'https://api.anthropic.com/v1/') {
  const anthropicFetch = async (input: any, init: any) => {
    init.headers ??= {}
    if (Array.isArray(init.headers))
      init.headers.push(['anthropic-dangerous-direct-browser-access', 'true'])
    else if (init.headers instanceof Headers)
      init.headers.append('anthropic-dangerous-direct-browser-access', 'true')
    else
      init.headers['anthropic-dangerous-direct-browser-access'] = 'true'
    return fetch(input, init)
  }

  return merge(
    /** @see {@link https://docs.anthropic.com/en/docs/about-claude/models/all-models} */
    createChatProvider({ apiKey, fetch: anthropicFetch, baseURL }),
    createModelProvider({ apiKey, fetch: anthropicFetch, baseURL }),
  )
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
    'openrouter-ai': buildOpenAICompatibleProvider({
      id: 'openrouter-ai',
      name: 'OpenRouter',
      nameKey: 'settings.pages.providers.provider.openrouter.title',
      descriptionKey: 'settings.pages.providers.provider.openrouter.description',
      icon: 'i-lobe-icons:openrouter',
      description: 'openrouter.ai',
      defaultBaseUrl: 'https://openrouter.ai/api/v1/',
      creator: createOpenRouter,
      validation: ['health', 'model_list'],
      validators: {
        validateProviderConfig: async (config) => {
          const errors: Error[] = []

          if (!config.apiKey) {
            errors.push(new Error('API Key is required'))
          }

          if (!config.baseUrl) {
            errors.push(new Error('Base URL is required'))
          }

          if (errors.length > 0) {
            return { errors, reason: errors.map(e => e.message).join(', '), valid: false }
          }

          if (!isUrl(config.baseUrl as string) || new URL(config.baseUrl as string).host.length === 0) {
            errors.push(new Error('Base URL is not absolute. Check your input.'))
          }

          if (!(config.baseUrl as string).endsWith('/')) {
            errors.push(new Error('Base URL must end with a trailing slash (/).'))
          }

          if (errors.length > 0) {
            return { errors, reason: errors.map(e => e.message).join(', '), valid: false }
          }

          const response = await fetch(`${config.baseUrl as string}chat/completions`, { headers: { Authorization: `Bearer ${config.apiKey}` }, method: 'POST', body: `{"model": "test","messages": [{"role": "user","content": "Hello, world"}],"stream": false}` })
          const responseJson = await response.json()

          if (!responseJson.user_id) {
            return {
              errors: [new Error(`OpenRouterError: ${responseJson.error.message}`)],
              reason: `OpenRouterError: ${responseJson.error.message}`,
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
    'ollama': {
      id: 'ollama',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.ollama.title',
      name: 'Ollama',
      descriptionKey: 'settings.pages.providers.provider.ollama.description',
      description: 'ollama.com',
      icon: 'i-lobe-icons:ollama',
      defaultOptions: () => ({
        baseUrl: 'http://localhost:11434/v1/',
      }),
      createProvider: async config => createOllama('', (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOllama('', (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'ollama',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. Default to http://localhost:11434/v1/ for Ollama.',
              valid: false,
            }
          }

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          // Check if the Ollama server is reachable
          return fetch(`${(config.baseUrl as string).trim()}models`, { headers: (config.headers as HeadersInit) || undefined })
            .then((response) => {
              const errors = [
                !response.ok && new Error(`Ollama server returned non-ok status code: ${response.statusText}`),
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
                reason: `Failed to reach Ollama server, error: ${String(err)} occurred.\n\nIf you are using Ollama locally, this is likely the CORS (Cross-Origin Resource Sharing) security issue, where you will need to set OLLAMA_ORIGINS=* or OLLAMA_ORIGINS=https://airi.moeru.ai,${location.origin} environment variable before launching Ollama server to make this work.`,
                valid: false,
              }
            })
        },
      },
    },
    'ollama-embedding': {
      id: 'ollama-embedding',
      category: 'embed',
      tasks: ['text-feature-extraction'],
      nameKey: 'settings.pages.providers.provider.ollama.title',
      name: 'Ollama',
      descriptionKey: 'settings.pages.providers.provider.ollama.description',
      description: 'ollama.com',
      icon: 'i-lobe-icons:ollama',
      defaultOptions: () => ({
        baseUrl: 'http://localhost:11434/v1/',
      }),
      createProvider: async config => createOllama((config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOllama((config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'ollama',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. Default to http://localhost:11434/v1/ for Ollama.',
              valid: false,
            }
          }

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          // Check if the Ollama server is reachable
          return fetch(`${(config.baseUrl as string).trim()}models`, { headers: (config.headers as HeadersInit) || undefined })
            .then((response) => {
              const errors = [
                !response.ok && new Error(`Ollama server returned non-ok status code: ${response.statusText}`),
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
                reason: `Failed to reach Ollama server, error: ${String(err)} occurred.\n\nIf you are using Ollama locally, this is likely the CORS (Cross-Origin Resource Sharing) security issue, where you will need to set OLLAMA_ORIGINS=* or OLLAMA_ORIGINS=https://airi.moeru.ai,http://localhost environment variable before launching Ollama server to make this work.`,
                valid: false,
              }
            })
        },
      },
    },
    'lm-studio': {
      id: 'lm-studio',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.lm-studio.title',
      name: 'LM Studio',
      descriptionKey: 'settings.pages.providers.provider.lm-studio.description',
      description: 'lmstudio.ai',
      icon: 'i-lobe-icons:lmstudio',
      defaultOptions: () => ({
        baseUrl: 'http://localhost:1234/v1/',
      }),
      createProvider: async config => createOpenAI('', (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          try {
            const response = await fetch(`${(config.baseUrl as string).trim()}models`, {
              headers: (config.headers as HeadersInit) || undefined,
            })

            if (!response.ok) {
              throw new Error(`LM Studio server returned non-ok status code: ${response.statusText}`)
            }

            const data = await response.json()
            return data.data.map((model: any) => ({
              id: model.id,
              name: model.id,
              provider: 'lm-studio',
              description: model.description || '',
              contextLength: model.context_length || 0,
              deprecated: false,
            })) satisfies ModelInfo[]
          }
          catch (error) {
            console.error('Error fetching LM Studio models:', error)
            return []
          }
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          if (!config.baseUrl) {
            return {
              errors: [new Error('Base URL is required.')],
              reason: 'Base URL is required. Default to http://localhost:1234/v1/ for LM Studio.',
              valid: false,
            }
          }

          const res = baseUrlValidator.value(config.baseUrl)
          if (res) {
            return res
          }

          // Check if the LM Studio server is reachable
          return fetch(`${(config.baseUrl as string).trim()}models`, { headers: (config.headers as HeadersInit) || undefined })
            .then((response) => {
              const errors = [
                !response.ok && new Error(`LM Studio server returned non-ok status code: ${response.statusText}`),
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
                reason: `Failed to reach LM Studio server, error: ${String(err)} occurred.\n\nMake sure LM Studio is running and the local server is started. You can start the local server in LM Studio by going to the 'Local Server' tab and clicking 'Start Server'.`,
                valid: false,
              }
            })
        },
      },
    },
    'groq': buildOpenAICompatibleProvider({
      id: 'groq',
      name: 'Groq',
      nameKey: 'settings.pages.providers.provider.groq.title',
      descriptionKey: 'settings.pages.providers.provider.groq.description',
      icon: 'i-lobe-icons:groq',
      description: 'groq.com',
      defaultBaseUrl: 'https://api.groq.com/openai/v1/',
      creator: createOpenAI,
      validation: ['model_list'],
    }),
    'openai': buildOpenAICompatibleProvider({
      id: 'openai',
      name: 'OpenAI',
      nameKey: 'settings.pages.providers.provider.openai.title',
      descriptionKey: 'settings.pages.providers.provider.openai.description',
      icon: 'i-lobe-icons:openai',
      description: 'openai.com',
      defaultBaseUrl: 'https://api.openai.com/v1/',
      creator: createOpenAI,
      validation: ['health', 'model_list'],
    }),
    'openai-compatible': buildOpenAICompatibleProvider({
      id: 'openai-compatible',
      name: 'OpenAI Compatible',
      nameKey: 'settings.pages.providers.provider.openai-compatible.title',
      descriptionKey: 'settings.pages.providers.provider.openai-compatible.description',
      icon: 'i-lobe-icons:openai',
      description: 'Connect to any API that follows the OpenAI specification.',
      creator: createOpenAI,
      validation: ['health'],
    }),
    'openai-audio-speech': {
      ...convertProviderDefinitionToMetadata(
        providerOpenAISpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://api.openai.com/v1/',
      }),
    },
    'openai-compatible-audio-speech': convertProviderDefinitionToMetadata(
      providerOpenAICompatibleSpeech,
      t,
    ),
    'openai-audio-transcription': {
      ...convertProviderDefinitionToMetadata(
        providerOpenAITranscription,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://api.openai.com/v1/',
      }),
    },
    'openai-compatible-audio-transcription': convertProviderDefinitionToMetadata(
      providerOpenAICompatibleTranscription,
      t,
    ),
    'aliyun-nls-transcription': {
      ...convertProviderDefinitionToMetadata(
        providerAliyunNlsTranscription,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default configuration.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        accessKeyId: '',
        accessKeySecret: '',
        appKey: '',
        region: 'cn-shanghai',
      }),
    },
    'browser-web-speech-api': {
      ...convertProviderDefinitionToMetadata(
        providerBrowserWebSpeechAPITranscription,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default configuration.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        language: 'en-US',
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
      }),
    },
    'anthropic': buildOpenAICompatibleProvider({
      id: 'anthropic',
      name: 'Anthropic',
      nameKey: 'settings.pages.providers.provider.anthropic.title',
      descriptionKey: 'settings.pages.providers.provider.anthropic.description',
      icon: 'i-lobe-icons:anthropic',
      description: 'anthropic.com',
      defaultBaseUrl: 'https://api.anthropic.com/v1/',
      creator: createAnthropic,
      validation: ['health'],
      additionalHeaders: {
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      capabilities: {
        // This is a hardcoded list of Anthropic models to work around issues with
        // fetching the model list directly from their API via browser.
        // See: https://github.com/moeru-ai/airi/issues/729
        // This list should be periodically updated based on Anthropic's official documentation:
        // https://docs.anthropic.com/en/docs/models-overview
        // Some legacy models are not listed here.
        listModels: async () => {
          return [{
            id: 'claude-haiku-4-5-20251001',
            name: 'Claude Haiku 4.5',
            provider: 'anthropic',
            description: 'Anthropic fastest model with near-frontier intelligence',
          }, {
            id: 'claude-sonnet-4-5-20250929',
            name: 'Claude Sonnet 4.5',
            provider: 'anthropic',
            description: 'Anthropic smartest model for complex agents and coding',
          }, {
            id: 'claude-opus-4-1-20250805',
            name: 'Claude Opus 4.1',
            provider: 'anthropic',
            description: 'Exceptional model for specialized reasoning tasks',
          }] satisfies ModelInfo[]
        },
      },
    }),
    'google-generative-ai': buildOpenAICompatibleProvider({
      id: 'google-generative-ai',
      name: 'Google Gemini',
      nameKey: 'settings.pages.providers.provider.google-generative-ai.title',
      descriptionKey: 'settings.pages.providers.provider.google-generative-ai.description',
      icon: 'i-lobe-icons:gemini',
      description: 'ai.google.dev',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      creator: createGoogleGenerativeAI,
      validation: ['health', 'model_list'],
    }),
    'deepseek': buildOpenAICompatibleProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      nameKey: 'settings.pages.providers.provider.deepseek.title',
      descriptionKey: 'settings.pages.providers.provider.deepseek.description',
      icon: 'i-lobe-icons:deepseek',
      description: 'deepseek.com',
      defaultBaseUrl: 'https://api.deepseek.com/',
      creator: createDeepSeek,
      validation: ['health', 'model_list'],
    }),
    '302-ai': buildOpenAICompatibleProvider({
      id: '302-ai',
      name: '302.AI',
      nameKey: 'settings.pages.providers.provider.302-ai.title',
      descriptionKey: 'settings.pages.providers.provider.302-ai.description',
      icon: 'i-lobe-icons:ai302',
      description: '302.ai',
      defaultBaseUrl: 'https://api.302.ai/v1/',
      creator: (apiKey, baseURL = 'https://api.302.ai/v1/') => merge(
        createChatProvider({ apiKey, baseURL }),
        createEmbedProvider({ apiKey, baseURL }),
        createModelProvider({ apiKey, baseURL }),
      ),
      validation: ['model_list'],
    }),
    'elevenlabs': {
      ...convertProviderDefinitionToMetadata(
        providerElevenLabsSpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
        voiceSettings: {
          similarityBoost: 0.75,
          stability: 0.5,
        },
      }),
    },
    'deepgram-tts': {
      ...convertProviderDefinitionToMetadata(
        providerDeepgramTTSSpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
    },
    'microsoft-speech': {
      ...convertProviderDefinitionToMetadata(
        providerMicrosoftSpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
    },
    'index-tts-vllm': {
      ...convertProviderDefinitionToMetadata(
        providerIndexTTSSpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'http://localhost:11996/tts/',
      }),
    },
    'alibaba-cloud-model-studio': {
      ...convertProviderDefinitionToMetadata(
        providerAlibabaCloudModelStudioSpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
    },
    'volcengine': {
      ...convertProviderDefinitionToMetadata(
        providerVolcengineSpeech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      }),
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
      creator: createNovita,
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
      ...convertProviderDefinitionToMetadata(
        providerPlayer2Speech,
        t,
      ),
      // Ensure settings pages are prefilled with a sensible default base URL.
      // The unified provider definitions currently don't expose schema defaults via metadata.
      defaultOptions: () => ({
        baseUrl: 'http://localhost:4315/v1/',
      }),
    },
  }

  // const validatedCredentials = ref<Record<string, string>>({})
  const providerRuntimeState = ref<Record<string, ProviderRuntimeState>>({})

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
  async function validateProvider(providerId: string): Promise<boolean> {
    const metadata = providerMetadata[providerId]
    if (!metadata)
      return false

    // Web Speech API doesn't require credentials - use empty config if not present
    if (providerId === 'browser-web-speech-api') {
      if (!providerCredentials.value[providerId]) {
        providerCredentials.value[providerId] = getDefaultProviderConfig(providerId)
      }
    }

    const config = providerCredentials.value[providerId]
    if (!config && providerId !== 'browser-web-speech-api')
      return false

    const configString = JSON.stringify(config || {})
    const runtimeState = providerRuntimeState.value[providerId]

    if (runtimeState?.validatedCredentialHash === configString && typeof runtimeState.isConfigured === 'boolean')
      return runtimeState.isConfigured

    // Always cache the current config string to prevent re-validating the same config
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].validatedCredentialHash = configString
    }

    const validationResult = await metadata.validators.validateProviderConfig(config || {})

    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = validationResult.valid
      // Auto-mark Web Speech API as added if valid and available
      if (providerId === 'browser-web-speech-api' && validationResult.valid) {
        markProviderAdded(providerId)
      }
    }

    return validationResult.valid
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

  // Initialize all providers
  Object.keys(providerMetadata).forEach(initializeProvider)

  // Update configuration status for all configured providers
  async function updateConfigurationStatus() {
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
  }

  // Call initially and watch for changes
  watch(providerCredentials, updateConfigurationStatus, { deep: true, immediate: true })

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
        runtimeState.models = models.map(model => ({
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
    return allChatProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
  })

  const configuredSpeechProvidersMetadata = computed(() => {
    return allAudioSpeechProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
  })

  const configuredTranscriptionProvidersMetadata = computed(() => {
    return allAudioTranscriptionProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
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
