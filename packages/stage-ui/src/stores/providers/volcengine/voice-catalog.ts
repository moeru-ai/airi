import type { VoiceInfo } from '../../providers'

const SIMPLIFIED_CHINESE = { code: 'zh-CN', title: 'Chinese (Simplified)' }

const OFFICIAL_VOLCENGINE_TTS_VOICES: VoiceInfo[] = [
  {
    id: 'zh_female_vv_uranus_bigtts',
    name: 'Doubao Female Uranus',
    provider: 'volcano-engine',
    compatibleModels: ['v1'],
    description: 'Validated Doubao TTS voice for the current PepTutor app credentials.',
    gender: 'female',
    languages: [SIMPLIFIED_CHINESE],
  },
]

export function listOfficialVolcengineVoices(): VoiceInfo[] {
  return OFFICIAL_VOLCENGINE_TTS_VOICES.map(voice => ({
    ...voice,
    compatibleModels: voice.compatibleModels ? [...voice.compatibleModels] : undefined,
    languages: voice.languages.map(language => ({ ...language })),
  }))
}
