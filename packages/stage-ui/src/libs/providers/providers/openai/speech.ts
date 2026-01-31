import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'

import { createSpeechProvider } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const openAISpeechConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1/'),
})

type OpenAISpeechConfig = z.input<typeof openAISpeechConfigSchema>

/**
 * OpenAI Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for OpenAI's text-to-speech API.
 */
export const providerOpenAISpeech = defineProvider<OpenAISpeechConfig>({
  id: 'openai-audio-speech',
  order: 1,
  name: 'OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai.title'),
  description: 'OpenAI text-to-speech API',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai.description'),
  tasks: ['text-to-speech', 'speech'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => openAISpeechConfigSchema.extend({
    apiKey: openAISpeechConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAISpeechConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createSpeechProvider({ apiKey, baseURL: baseUrl }) as SpeechProvider | SpeechProviderWithExtraOptions<string, any>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    ...createOpenAICompatibleValidators<OpenAISpeechConfig>({
      checks: ['connectivity'],
    }),
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
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

    async listVoices(_config): Promise<VoiceInfo[]> {
      // NOTE: OpenAI does not provide an API endpoint to retrieve available voices.
    // Voices are hardcoded here - this is a provider limitation, not an application limitation.
    // Voice compatibility per https://platform.openai.com/docs/api-reference/audio/createSpeech:
    // - tts-1 and tts-1-hd support: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer (9 voices)
    // - gpt-4o-mini-tts supports all 13 voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar
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
      ]
    },
  },
})

// Keep export for backward compatibility during migration
export const openaiSpeechProvider = providerOpenAISpeech
