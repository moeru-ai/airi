import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { z } from 'zod'

import { createWebSpeechAPIProvider } from '../../../../stores/providers/web-speech-api'
import { defineProvider } from '../registry'

const webSpeechApiConfigSchema = z.object({
  language: z.string().default('en-US'),
  continuous: z.boolean().default(true),
  interimResults: z.boolean().default(true),
  maxAlternatives: z.number().int().positive().default(1),
})

function isWebSpeechApiAvailable() {
  if (typeof window === 'undefined')
    return false

  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

export const providerBrowserWebSpeechApi = defineProvider({
  id: 'browser-web-speech-api',
  name: 'Web Speech API (Browser)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.browser-web-speech-api.title'),
  description: 'Browser-native speech recognition. No API keys.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.browser-web-speech-api.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  icon: 'i-solar:microphone-bold-duotone',
  requiresCredentials: false,
  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: false,
      streamOutput: true,
      streamInput: true,
    },
  },

  // Electron uses Chromium, but it does not include the Google API keys that
  // the Web Speech API needs. The provider only works in browser contexts.
  isAvailableBy: () => !isStageTamagotchi() && isWebSpeechApiAvailable(),
  createProviderConfig: () => webSpeechApiConfigSchema,
  createProvider: createWebSpeechAPIProvider,
  validationRequiredWhen: () => false,

  extraMethods: {
    listModels: async () => [
      {
        id: 'web-speech-api',
        name: 'Web Speech API',
        provider: 'browser-web-speech-api',
        description: 'Browser-native speech recognition (no API keys required)',
        contextLength: 0,
        deprecated: false,
      },
    ],
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'browser-web-speech-api:check-availability',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async () => {
          const valid = isWebSpeechApiAvailable()
          return {
            errors: valid
              ? []
              : [{ error: new Error('Web Speech API is not available. It requires a browser context with SpeechRecognition support (Chrome, Edge, Safari).') }],
            reason: valid ? '' : 'Web Speech API is not available in this environment.',
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  },
})
