import { describe, expect, it } from 'vitest'

import { speakMath } from './speech'

// The readings of each language are tested next to their locale packs, in @proj-airi/speech-transformer-math and
// @proj-airi/speech-transformer-chem. This file tests only how AIRI uses them.
describe('speakMath', () => {
  it('reads formulas and chemistry with the default instance', () => {
    expect(speakMath(String.raw`x^2`, 'en')).toBe('x squared')
    expect(speakMath(String.raw`\ce{2H2 + O2 -> 2H2O}`, 'zh')).toBe('氢气 和 氧气 反应生成 水')
  })
})
