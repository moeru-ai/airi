import { z } from 'zod'

import { defineProvider } from '../registry'

const speechNoopConfigSchema = z.object({})

export const providerSpeechNoop = defineProvider({
  id: 'speech-noop',
  name: 'None',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.speech-noop.title'),
  description: 'No speech output.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.speech-noop.description'),
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-solar:volume-cross-bold-duotone',
  requiresCredentials: false,

  createProviderConfig: () => speechNoopConfigSchema,
  createProvider() {
    return {
      speech: () => ({
        baseURL: 'http://speech-noop.invalid/v1/',
        model: 'noop',
      }),
    }
  },

  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async () => [],
    listVoices: async () => [],
  },
})
