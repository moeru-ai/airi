import { z } from 'zod'

import { defineProvider } from '../registry'
import { createOfficialOpenAIProvider, OFFICIAL_ICON, withCredentials } from './shared'

const officialConfigSchema = z.object({})

export const providerOfficialChat = defineProvider({
  id: 'official-provider',
  order: -1,
  name: 'Official Provider',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.title'),
  description: 'Official AI provider by AIRI.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.description'),
  tasks: ['text-generation'],
  icon: OFFICIAL_ICON,
  requiresCredentials: false,

  createProviderConfig: () => officialConfigSchema,
  createProvider(_config) {
    const provider = createOfficialOpenAIProvider()
    const originalChat = provider.chat.bind(provider)
    provider.chat = (model: string) => {
      const result = originalChat(model)
      result.fetch = withCredentials()
      return result
    }
    return provider
  },

  validationRequiredWhen: () => false,

  extraMethods: {
    listModels: async () => [
      {
        id: 'auto',
        name: 'Auto',
        provider: 'official-provider',
        description: 'Automatically routed by AI Gateway',
      },
    ],
  },
})

// TODO: STT / TTS
// TTS and ASR official providers — uncomment to re-enable:
//
// export const providerOfficialSpeech = defineProvider({
//   id: 'official-provider-speech',
//   order: -1,
//   name: 'Official Speech Provider',
//   nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-title'),
//   description: 'Official text-to-speech provider by AIRI.',
//   descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-description'),
//   tasks: ['text-to-speech'],
//   icon: OFFICIAL_ICON,
//   requiresCredentials: false,
//   createProviderConfig: () => officialConfigSchema,
//   createProvider(_config) {
//     const provider = createOfficialOpenAIProvider()
//     const originalSpeech = provider.speech.bind(provider)
//     provider.speech = (model: string) => {
//       const result = originalSpeech(model)
//       result.fetch = withCredentials()
//       return result
//     }
//     return provider
//   },
//   validationRequiredWhen: () => false,
//   extraMethods: {
//     listModels: async () => [
//       { id: 'auto', name: 'Auto', provider: 'official-provider-speech', description: 'Automatically routed by AI Gateway' },
//     ],
//     listVoices: async () => [
//       { id: 'alloy', name: 'Alloy', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
//       { id: 'echo', name: 'Echo', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
//       { id: 'fable', name: 'Fable', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
//       { id: 'onyx', name: 'Onyx', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
//       { id: 'nova', name: 'Nova', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
//       { id: 'shimmer', name: 'Shimmer', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
//     ],
//   },
// })
//
// export const providerOfficialTranscription = defineProvider({
//   id: 'official-provider-transcription',
//   order: -1,
//   name: 'Official Transcription Provider',
//   nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.transcription-title'),
//   description: 'Official speech-to-text provider by AIRI.',
//   descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.transcription-description'),
//   tasks: ['speech-to-text', 'asr'],
//   icon: OFFICIAL_ICON,
//   requiresCredentials: false,
//   createProviderConfig: () => officialConfigSchema,
//   createProvider(_config) {
//     const provider = createOfficialOpenAIProvider()
//     const originalTranscription = provider.transcription.bind(provider)
//     provider.transcription = (model: string) => {
//       const result = originalTranscription(model)
//       result.fetch = withCredentials()
//       return result
//     }
//     return provider
//   },
//   validationRequiredWhen: () => false,
//   capabilities: {
//     transcription: {
//       protocol: 'http',
//       generateOutput: true,
//       streamOutput: false,
//       streamInput: false,
//     },
//   },
//   extraMethods: {
//     listModels: async () => [
//       { id: 'auto', name: 'Auto', provider: 'official-provider-transcription', description: 'Automatically routed by AI Gateway' },
//     ],
//   },
// })
