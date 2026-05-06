import { describe, expect, it } from 'vitest'

import { resolveVADConfig } from './vad'

describe('resolveVADConfig', () => {
  it('uses safer defaults for threshold and silence duration', () => {
    expect(resolveVADConfig()).toEqual({
      speechThreshold: 0.6,
      exitThreshold: 0.18,
      minSilenceDurationMs: 800,
    })
  })

  it('preserves explicit threshold and silence duration values', () => {
    expect(resolveVADConfig(0.45, 650)).toEqual({
      speechThreshold: 0.45,
      exitThreshold: 0.135,
      minSilenceDurationMs: 650,
    })
  })
})
