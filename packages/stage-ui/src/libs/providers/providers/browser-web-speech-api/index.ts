import { z } from 'zod'

import { defineProvider } from '../registry'
import { createWebSpeechAPIProvider } from './provider'

const webSpeechApiConfigSchema = z.object({
  continuous: z.boolean().default(true),
  interimResults: z.boolean().default(true),
  language: z.string().default('en-US'),
  maxAlternatives: z.number().int().positive().default(1),
})

export type { WebSpeechAPIExtraOptions } from './provider'
export { createWebSpeechAPIProvider, streamWebSpeechAPITranscription } from './provider'

function isWebSpeechApiAvailable() {
  if (typeof window === 'undefined')
    return false

  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

export const providerBrowserWebSpeechApi = defineProvider({
  capabilities: {
    transcription: {
      generateOutput: false,
      protocol: 'http',
      streamInput: true,
      streamOutput: true,
    },
  },
  createProvider: createWebSpeechAPIProvider,
  createProviderConfig: () => webSpeechApiConfigSchema,
  description: 'Browser-native speech recognition. No API keys.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.browser-web-speech-api.description'),
  extraMethods: {
    listModels: async () => [
      {
        contextLength: 0,
        deprecated: false,
        description: 'Browser-native speech recognition (no API keys required)',
        id: 'web-speech-api',
        name: 'Web Speech API',
        provider: 'browser-web-speech-api',
      },
    ],
  },
  icon: 'i-solar:microphone-bold-duotone',
  id: 'browser-web-speech-api',
  isAvailableBy: isWebSpeechApiAvailable,

  name: 'Web Speech API (Browser)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.browser-web-speech-api.title'),
  requiresCredentials: false,
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],

  validationRequiredWhen: () => false,
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
