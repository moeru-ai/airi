import { z } from 'zod'

import { defineProvider } from '../registry'

const speechNoopConfigSchema = z.object({})

export const providerSpeechNoop = defineProvider({
  createProvider() {
    return {
      speech: () => ({
        baseURL: 'http://speech-noop.invalid/v1/',
        model: 'noop',
      }),
    }
  },
  createProviderConfig: () => speechNoopConfigSchema,
  description: 'No speech output.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.speech-noop.description'),
  extraMethods: {
    listModels: async () => [],
    listVoices: async () => [],
  },
  icon: 'i-solar:volume-cross-bold-duotone',
  id: 'speech-noop',
  name: 'None',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.speech-noop.title'),
  requiresCredentials: false,

  tasks: ['text-to-speech', 'tts'],
  validationRequiredWhen: () => false,
})
