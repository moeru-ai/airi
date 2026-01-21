import type {
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../../base-types'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { z } from 'zod'

import { createWebSpeechAPIProvider } from '../../../../stores/providers/web-speech-api'
import { defineProvider } from '../registry'

const browserWebSpeechAPITranscriptionConfigSchema = z.object({
  language: z.string('Language').optional().default('en-US'),
  continuous: z.boolean('Continuous').optional().default(true),
  interimResults: z.boolean('Interim Results').optional().default(true),
  maxAlternatives: z.number('Max Alternatives').optional().default(1),
})

type BrowserWebSpeechAPITranscriptionConfig = z.input<typeof browserWebSpeechAPITranscriptionConfigSchema>

/**
 * Browser Web Speech API Transcription/STT Provider Implementation
 *
 * Uses the unified defineProvider pattern for browser-native speech recognition.
 * No API keys required - uses browser's built-in SpeechRecognition API.
 */
export const providerBrowserWebSpeechAPITranscription = defineProvider<BrowserWebSpeechAPITranscriptionConfig>({
  id: 'browser-web-speech-api',
  order: 1,
  name: 'Web Speech API (Browser)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.browser-web-speech-api.title'),
  description: 'Browser-native speech recognition. No API keys.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.browser-web-speech-api.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  icon: 'i-solar:microphone-bold-duotone',

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

  createProviderConfig: ({ t }) => browserWebSpeechAPITranscriptionConfigSchema.extend({
    language: browserWebSpeechAPITranscriptionConfigSchema.shape.language.meta({
      labelLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.language.label'),
      descriptionLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.language.description'),
      placeholderLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.language.placeholder'),
    }),
    continuous: browserWebSpeechAPITranscriptionConfigSchema.shape.continuous.meta({
      labelLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.continuous.label'),
      descriptionLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.continuous.description'),
    }),
    interimResults: browserWebSpeechAPITranscriptionConfigSchema.shape.interimResults.meta({
      labelLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.interim-results.label'),
      descriptionLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.interim-results.description'),
    }),
    maxAlternatives: browserWebSpeechAPITranscriptionConfigSchema.shape.maxAlternatives.meta({
      labelLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.max-alternatives.label'),
      descriptionLocalized: t('settings.pages.providers.provider.browser-web-speech-api.config.max-alternatives.description'),
    }),
  }),

  createProvider(_config) {
    // Web Speech API doesn't need config, but we accept it for consistency
    return createWebSpeechAPIProvider() as TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, any>
  },

  validationRequiredWhen() {
    // Web Speech API requires no configuration, just browser support
    // Always return true so validation checks browser availability
    return true
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'browser-web-speech-api:check-availability',
        name: t('settings.pages.providers.provider.browser-web-speech-api.validators.check-availability.title'),
        validator: async (): Promise<ProviderValidationResult> => {
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
      }),
    ],
  },

  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: false,
      streamOutput: true,
      streamInput: true,
    },
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
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
})

// Keep export for backward compatibility during migration
export const browserWebSpeechAPITranscriptionProvider = providerBrowserWebSpeechAPITranscription
