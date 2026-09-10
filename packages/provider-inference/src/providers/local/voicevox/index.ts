import { defineVoicevoxFamilyProvider } from './define'

export const providerVoicevox = defineVoicevoxFamilyProvider({
  defaultBaseUrl: 'http://localhost:50021/',
  description: 'voicevox.hiroshiba.jp',
  id: 'voicevox',
  name: 'VOICEVOX',
})

export const providerAivisSpeech = defineVoicevoxFamilyProvider({
  defaultBaseUrl: 'http://localhost:10101/',
  description: 'aivis-project.com',
  id: 'aivis-speech',
  name: 'AivisSpeech',
})
