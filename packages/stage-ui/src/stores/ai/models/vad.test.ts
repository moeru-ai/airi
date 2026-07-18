import { describe, expect, it } from 'vitest'

import { resolveVADConfig } from './vad'

describe('resolveVADConfig', () => {
  it('uses safer defaults for threshold and silence duration', () => {
    expect(resolveVADConfig()).toEqual({
      speechThreshold: 0.52,
      exitThreshold: 0.156,
      minSilenceDurationMs: 1200,
      speechPadMs: 360,
      minSpeechDurationMs: 300,
    })
  })

  it('preserves explicit threshold and silence duration values', () => {
    expect(resolveVADConfig(0.45, 650, 420, 500)).toEqual({
      speechThreshold: 0.45,
      exitThreshold: 0.135,
      minSilenceDurationMs: 650,
      speechPadMs: 420,
      minSpeechDurationMs: 500,
    })
  })
})
