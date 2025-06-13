import type { ChatProvider, ChatProviderWithExtraOptions, EmbedProvider, EmbedProviderWithExtraOptions, SpeechProvider, SpeechProviderWithExtraOptions, TranscriptionProvider, TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type {
  UnAlibabaCloudOptions,
  UnElevenLabsOptions,
  UnMicrosoftOptions,
  UnVolcengineOptions,
  VoiceProviderWithExtraOptions,
} from 'unspeech'

import { useLocalStorage } from '@vueuse/core'
import {
  createAnthropic,
  createDeepSeek,
  createFireworks,
  createGoogleGenerativeAI,
  createMistral,
  createMoonshot,
  createNovita,
  createOpenAI,
  createOpenRouter,
  createPerplexity,
  createTogetherAI,
  createWorkersAI,
  createXAI,
} from '@xsai-ext/providers-cloud'
import { createOllama, createPlayer2 } from '@xsai-ext/providers-local'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import {
  createUnAlibabaCloud,
  createUnElevenLabs,
  createUnMicrosoft,
  createUnVolcengine,
  listVoices,
} from 'unspeech'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { models as elevenLabsModels } from './providers/elevenlabs/list-models'

export interface ProviderMetadata {
  id: string
  category: 'chat' | 'embed' | 'speech' | 'transcription'
  tasks: string[]
  nameKey: string // i18n key for provider name
  name: string // Default name (fallback)
  descriptionKey: string // i18n key for description
  description: string // Default description (fallback)
  icon?: string
  iconColor?: string
  iconImage?: string
  defaultOptions?: Record<string, unknown>
  createProvider: (config: Record<string, unknown>) =>
    | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>) => Promise<VoiceInfo[]>
  }
  validators: {
    validateProviderConfig: (config: Record<string, unknown>) => Promise<boolean> | boolean
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
  description?: string
  gender?: string
  deprecated?: boolean
  previewURL?: string
  languages: {
    code: string
    title: string
  }[]
}

export const useProvidersStore = defineStore('providers', () => {
  const providerCredentials = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})
  const { t } = useI18n()

  // Helper function to fetch OpenRouter models manually
  async function fetchOpenRouterModels(config: Record<string, unknown>): Promise<ModelInfo[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${(config.apiKey as string).trim()}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`)
      }

      const data = await response.json()
      return data.data.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        provider: 'openrouter-ai',
        description: model.description || '',
        contextLength: model.context_length,
        deprecated: false,
      }))
    }
    catch (error) {
      console.error('Error fetching OpenRouter models:', error)
      throw error
    }
  }

  // Centralized provider metadata with provider factory functions
  const providerMetadata: Record<string, ProviderMetadata> = {
    'openrouter-ai': {
      id: 'openrouter-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.openrouter.title',
      name: 'OpenRouter',
      descriptionKey: 'settings.pages.providers.provider.openrouter.description',
      description: 'openrouter.ai',
      icon: 'i-lobe-icons:openrouter',
      defaultOptions: {
        baseUrl: 'https://openrouter.ai/api/v1/',
      },
      createProvider: config => createOpenRouter((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return fetchOpenRouterModels(config)
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'ollama': {
      id: 'ollama',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.ollama.title',
      name: 'Ollama',
      descriptionKey: 'settings.pages.providers.provider.ollama.description',
      description: 'ollama.com',
      icon: 'i-lobe-icons:ollama',
      defaultOptions: {
        baseUrl: 'http://localhost:11434/v1/',
      },
      createProvider: config => createOllama((config.baseUrl as string).trim()),
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
          return !!config.baseUrl
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
      defaultOptions: {
        baseUrl: 'http://localhost:11434/v1/',
      },
      createProvider: config => createOllama((config.baseUrl as string).trim()),
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
          return !!config.baseUrl
        },
      },
    },
    'vllm': {
      id: 'vllm',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.vllm.title',
      name: 'vLLM',
      descriptionKey: 'settings.pages.providers.provider.vllm.description',
      description: 'vllm.ai',
      iconColor: 'i-lobe-icons:vllm',
      createProvider: config => createOllama((config.baseUrl as string).trim()),
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
          return !!config.baseUrl
        },
      },
    },
    'openai': {
      id: 'openai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.openai.title',
      name: 'OpenAI',
      descriptionKey: 'settings.pages.providers.provider.openai.description',
      description: 'openai.com',
      icon: 'i-lobe-icons:openai',
      defaultOptions: {
        baseUrl: 'https://api.openai.com/v1/',
      },
      createProvider: config => createOpenAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOpenAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'openai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'openai-audio-speech': {
      id: 'openai-audio-speech',
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.openai.title',
      name: 'OpenAI',
      descriptionKey: 'settings.pages.providers.provider.openai.description',
      description: 'openai.com',
      icon: 'i-lobe-icons:openai',
      defaultOptions: {
        baseUrl: 'https://api.openai.com/v1/',
      },
      createProvider: config => createOpenAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOpenAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'openai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'anthropic': {
      id: 'anthropic',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.anthropic.title',
      name: 'Anthropic',
      descriptionKey: 'settings.pages.providers.provider.anthropic.description',
      description: 'anthropic.com',
      icon: 'i-lobe-icons:anthropic',
      defaultOptions: {
        baseUrl: 'https://api.anthropic.com/v1/',
      },
      createProvider: config => createAnthropic((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'claude-3-7-sonnet-20250219',
              name: 'Claude 3.7 Sonnet',
              provider: 'anthropic',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'claude-3-5-sonnet-20241022',
              name: 'Claude 3.5 Sonnet (New)',
              provider: 'anthropic',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'claude-3-5-haiku-20241022',
              name: 'Claude 3.5 Haiku',
              provider: 'anthropic',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'claude-3-5-sonnet-20240620',
              name: 'Claude 3.5 Sonnet (Old)',
              provider: 'anthropic',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'claude-3-haiku-20240307',
              name: 'Claude 3 Haiku',
              provider: 'anthropic',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'claude-3-opus-20240229',
              name: 'Claude 3 Opus',
              provider: 'anthropic',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
          ] satisfies ModelInfo[]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'google-generative-ai': {
      id: 'google-generative-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.google-generative-ai.title',
      name: 'Google Gemini',
      descriptionKey: 'settings.pages.providers.provider.google-generative-ai.description',
      description: 'ai.google.dev',
      icon: 'i-lobe-icons:gemini',
      defaultOptions: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      },
      createProvider: config => createGoogleGenerativeAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createGoogleGenerativeAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'google-generative-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'xai': {
      id: 'xai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.xai.title',
      name: 'xAI',
      descriptionKey: 'settings.pages.providers.provider.xai.description',
      description: 'x.ai',
      icon: 'i-lobe-icons:xai',
      createProvider: config => createXAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createXAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'xai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'deepseek': {
      category: 'chat',
      tasks: ['text-generation'],
      id: 'deepseek',
      nameKey: 'settings.pages.providers.provider.deepseek.title',
      name: 'DeepSeek',
      descriptionKey: 'settings.pages.providers.provider.deepseek.description',
      description: 'deepseek.com',
      iconColor: 'i-lobe-icons:deepseek',
      createProvider: config => createDeepSeek((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createDeepSeek((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'deepseek',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
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
      defaultOptions: {
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
        voiceSettings: {
          similarityBoost: 0.75,
          stability: 0.5,
        },
      },
      createProvider: config => createUnElevenLabs((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>,
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
          const provider = createUnElevenLabs((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as VoiceProviderWithExtraOptions<UnElevenLabsOptions>

          const voices = await listVoices({
            ...provider.voice(),
          })

          // Find indices of Aria and Bill
          const ariaIndex = voices.findIndex(voice => voice.name.includes('Aria'))
          const billIndex = voices.findIndex(voice => voice.name.includes('Bill'))

          // Determine the range to move (ensure valid indices and proper order)
          const startIndex = ariaIndex !== -1 ? ariaIndex : 0
          const endIndex = billIndex !== -1 ? billIndex : voices.length - 1
          const lowerIndex = Math.min(startIndex, endIndex)
          const higherIndex = Math.max(startIndex, endIndex)

          // Rearrange voices: voices outside the range first, then voices within the range
          const rearrangedVoices = [
            ...voices.slice(0, lowerIndex),
            ...voices.slice(higherIndex + 1),
            ...voices.slice(lowerIndex, higherIndex + 1),
          ]

          return rearrangedVoices.map((voice) => {
            return {
              id: voice.id,
              name: voice.name,
              provider: 'elevenlabs',
              previewURL: voice.preview_audio_url,
              languages: voice.languages,
            }
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
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
      defaultOptions: {
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      },
      createProvider: config => createUnMicrosoft((config.apiKey as string).trim(), (config.baseUrl as string).trim()) as SpeechProviderWithExtraOptions<string, UnMicrosoftOptions>,
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
          return !!config.apiKey && !!config.baseUrl
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
      defaultOptions: {
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      },
      createProvider: config => createUnAlibabaCloud((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
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
              previewURL: voice.preview_audio_url,
              languages: voice.languages,
              gender: voice.labels?.gender,
            }
          })
        },
        listModels: async () => {
          return [
            {
              id: 'cozyvoice-v1',
              name: 'CozyVoice',
              provider: 'alibaba-cloud-model-studio',
              description: '',
              contextLength: 0,
              deprecated: false,
            },
            {
              id: 'cozyvoice-v2',
              name: 'CozyVoice (New)',
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
          return !!config.apiKey && !!config.baseUrl
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
      defaultOptions: {
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
      },
      createProvider: config => createUnVolcengine((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
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
          return !!config.apiKey && !!config.baseUrl && !!config.app && !!(config.app as any).appId
        },
      },
    },
    'together-ai': {
      id: 'together-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.together.title',
      name: 'Together.ai',
      descriptionKey: 'settings.pages.providers.provider.together.description',
      description: 'together.ai',
      iconColor: 'i-lobe-icons:together',
      createProvider: config => createTogetherAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createTogetherAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'together-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'novita-ai': {
      id: 'novita-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.novita.title',
      name: 'Novita',
      descriptionKey: 'settings.pages.providers.provider.novita.description',
      description: 'novita.ai',
      iconColor: 'i-lobe-icons:novita',
      createProvider: config => createNovita((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createNovita((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'novita-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'fireworks-ai': {
      id: 'fireworks-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.fireworks.title',
      name: 'Fireworks.ai',
      descriptionKey: 'settings.pages.providers.provider.fireworks.description',
      description: 'fireworks.ai',
      icon: 'i-lobe-icons:fireworks',
      createProvider: config => createFireworks((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createFireworks((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'fireworks-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'featherless-ai': {
      id: 'featherless-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.featherless.title',
      name: 'Featherless.ai',
      descriptionKey: 'settings.pages.providers.provider.featherless.description',
      description: 'featherless.ai',
      icon: 'i-lobe-icons:featherless-ai',
      defaultOptions: {
        baseUrl: 'https://api.featherless.ai/v1/',
      },
      createProvider: config => createOpenAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOpenAI((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'featherless-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'player2-api': {
      id: 'player2-api',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.player2.title',
      name: 'Player2 API',
      descriptionKey: 'settings.pages.providers.provider.player2.description',
      description: 'player2.game',
      defaultOptions: {
        baseUrl: 'http://localhost:4315/v1/',
      },
      createProvider: (config) => {
        return createPlayer2((config.baseURL as string).trim())
      },
      capabilities: {
        listModels: async () => [
          {
            id: 'player2-model',
            name: 'Player2 Model',
            provider: 'player2-api',
          },
        ],
      },
      validators: {
        validateProviderConfig: (config) => {
          const url: string = config.baseUrl ? config.baseUrl as string : 'http://localhost:4315/v1/'
          // checks if health status is there, so it green if and only if you actually have the player2 app running
          return (fetch(`${url}health`).then(r => r.status === 200).catch(() => false))
        },
      },
    },
    'cloudflare-workers-ai': {
      id: 'cloudflare-workers-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.cloudflare-workers-ai.title',
      name: 'Cloudflare Workers AI',
      descriptionKey: 'settings.pages.providers.provider.cloudflare-workers-ai.description',
      description: 'cloudflare.com',
      iconColor: 'i-lobe-icons:cloudflare',
      createProvider: config => createWorkersAI((config.apiKey as string).trim(), config.accountId as string),
      capabilities: {
        listModels: async () => {
          return []
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.accountId
        },
      },
    },
    'perplexity-ai': {
      id: 'perplexity-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.perplexity.title',
      name: 'Perplexity',
      descriptionKey: 'settings.pages.providers.provider.perplexity.description',
      description: 'perplexity.ai',
      icon: 'i-lobe-icons:perplexity',
      defaultOptions: {
        baseUrl: 'https://api.perplexity.ai',
      },
      createProvider: config => createPerplexity((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'sonar-small-online',
              name: 'Sonar Small (Online)',
              provider: 'perplexity-ai',
              description: 'Efficient model with online search capabilities',
              contextLength: 12000,
            },
            {
              id: 'sonar-medium-online',
              name: 'Sonar Medium (Online)',
              provider: 'perplexity-ai',
              description: 'Balanced model with online search capabilities',
              contextLength: 12000,
            },
            {
              id: 'sonar-large-online',
              name: 'Sonar Large (Online)',
              provider: 'perplexity-ai',
              description: 'Powerful model with online search capabilities',
              contextLength: 12000,
            },
            {
              id: 'codey-small',
              name: 'Codey Small',
              provider: 'perplexity-ai',
              description: 'Specialized for code generation and understanding',
              contextLength: 12000,
            },
            {
              id: 'codey-large',
              name: 'Codey Large',
              provider: 'perplexity-ai',
              description: 'Advanced code generation and understanding',
              contextLength: 12000,
            },
          ]
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'mistral-ai': {
      id: 'mistral-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.mistral.title',
      name: 'Mistral',
      descriptionKey: 'settings.pages.providers.provider.mistral.description',
      description: 'mistral.ai',
      iconColor: 'i-lobe-icons:mistral',
      createProvider: config => createMistral((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createMistral((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'mistral-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
    'moonshot-ai': {
      id: 'moonshot-ai',
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.moonshot.title',
      name: 'Moonshot AI',
      descriptionKey: 'settings.pages.providers.provider.moonshot.description',
      description: 'moonshot.ai',
      icon: 'i-lobe-icons:moonshot',
      createProvider: config => createMoonshot((config.apiKey as string).trim(), (config.baseUrl as string).trim()),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createMoonshot((config.apiKey as string).trim(), (config.baseUrl as string).trim()).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'moonshot-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
      validators: {
        validateProviderConfig: (config) => {
          return !!config.apiKey && !!config.baseUrl
        },
      },
    },
  }

  // Configuration validation functions
  async function validateProvider(providerId: string): Promise<boolean> {
    const config = providerCredentials.value[providerId]
    if (!config)
      return false

    const metadata = providerMetadata[providerId]
    if (!metadata)
      return false

    return await metadata.validators.validateProviderConfig(config)
  }

  // Create computed properties for each provider's configuration status
  const configuredProviders = ref<Record<string, boolean>>({})

  // Initialize provider configurations
  function initializeProvider(providerId: string) {
    if (!providerCredentials.value[providerId]) {
      const metadata = providerMetadata[providerId]
      providerCredentials.value[providerId] = {
        baseUrl: metadata.defaultOptions?.baseUrl || '',
      }
    }
  }

  // Initialize all providers
  Object.keys(providerMetadata).forEach(initializeProvider)

  // Update configuration status for all providers
  async function updateConfigurationStatus() {
    await Promise.all(Object.keys(providerMetadata).map(async (providerId) => {
      configuredProviders.value[providerId] = await validateProvider(providerId)
    }))
  }

  // Call initially and watch for changes
  updateConfigurationStatus()
  watch(providerCredentials, updateConfigurationStatus, { deep: true })

  // Available providers (only those that are properly configured)
  const availableProviders = computed(() => {
    return Object.keys(providerMetadata).filter(providerId =>
      configuredProviders.value[providerId],
    )
  })

  // Store available models for each provider
  const availableModels = ref<Record<string, ModelInfo[]>>({})
  const isLoadingModels = ref<Record<string, boolean>>({})
  const modelLoadError = ref<Record<string, string | null>>({})

  // Function to fetch models for a specific provider
  async function fetchModelsForProvider(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return []

    const metadata = providerMetadata[providerId]
    if (!metadata)
      return []

    isLoadingModels.value[providerId] = true
    modelLoadError.value[providerId] = null

    try {
      const models = metadata.capabilities.listModels ? await metadata.capabilities.listModels(config) : []

      // Transform and store the models
      availableModels.value[providerId] = models.map(model => ({
        id: model.id,
        name: model.name,
        description: model.description,
        contextLength: model.contextLength,
        deprecated: model.deprecated,
        provider: providerId,
      }))

      return availableModels.value[providerId]
    }
    catch (error) {
      console.error(`Error fetching models for ${providerId}:`, error)
      modelLoadError.value[providerId] = error instanceof Error ? error.message : 'Unknown error'
      return []
    }
    finally {
      isLoadingModels.value[providerId] = false
    }
  }

  // Get models for a specific provider
  function getModelsForProvider(providerId: string) {
    return availableModels.value[providerId] || []
  }

  // Get all available models across all configured providers
  const allAvailableModels = computed(() => {
    const models: ModelInfo[] = []
    for (const providerId of availableProviders.value) {
      models.push(...(availableModels.value[providerId] || []))
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
      configured: configuredProviders.value[metadata.id] || false,
    }))
  })

  // Function to get provider object by provider id
  function getProviderInstance(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      throw new Error(`Provider credentials for ${providerId} not found`)

    const metadata = providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    try {
      return metadata.createProvider(config)
    }
    catch (error) {
      console.error(`Error creating provider instance for ${providerId}:`, error)
      throw error
    }
  }

  const availableProvidersMetadata = computed(() => {
    return availableProviders.value.map(id => getProviderMetadata(id))
  })

  const allChatProvidersMetadata = computed(() => {
    return allProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  const allAudioSpeechProvidersMetadata = computed(() => {
    return allProvidersMetadata.value.filter(metadata => metadata.category === 'speech')
  })

  const allAudioTranscriptionProvidersMetadata = computed(() => {
    return allProvidersMetadata.value.filter(metadata => metadata.category === 'transcription')
  })

  function getProviderConfig(providerId: string) {
    return providerCredentials.value[providerId]
  }

  return {
    providers: providerCredentials,
    getProviderConfig,
    availableProviders,
    configuredProviders,
    providerMetadata,
    getProviderMetadata,
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
    availableProvidersMetadata,
    allChatProvidersMetadata,
    allAudioSpeechProvidersMetadata,
    allAudioTranscriptionProvidersMetadata,
  }
})
