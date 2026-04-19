import { describe, expect, it } from 'vitest'

import { buildPepTutorVoiceEnvDefines } from './peptutor-voice-env-defines'

describe('peptutor voice env defines', () => {
  it('only exposes VITE-prefixed public voice env keys to the client bundle', () => {
    const defines = buildPepTutorVoiceEnvDefines({
      VITE_PEPTUTOR_TTS_API_KEY: 'public-tts-key',
      VITE_PEPTUTOR_ASR_API_KEY: 'public-asr-key',
      OPENAI_API_KEY: 'server-only-openai-key',
      ALIYUN_AK_SECRET: 'server-only-aliyun-secret',
    })

    expect(defines['import.meta.env.VITE_PEPTUTOR_TTS_API_KEY']).toBe(JSON.stringify('public-tts-key'))
    expect(defines['import.meta.env.VITE_PEPTUTOR_ASR_API_KEY']).toBe(JSON.stringify('public-asr-key'))
    expect(defines).not.toHaveProperty('import.meta.env.OPENAI_API_KEY')
    expect(defines).not.toHaveProperty('import.meta.env.ALIYUN_AK_SECRET')
  })
})
