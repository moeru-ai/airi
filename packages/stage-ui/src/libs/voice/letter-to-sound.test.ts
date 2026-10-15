import { describe, expect, it } from 'vitest'

import { guessPhones } from './letter-to-sound'

describe('guessPhones', () => {
  it('reads common English spellings', () => {
    expect(guessPhones('resilation')).toEqual(['R', 'EH1', 'Z', 'IH0', 'L', 'EY0', 'SH', 'AH0', 'N'])
    expect(guessPhones('cube')).toEqual(['K', 'UW1', 'B'])
    expect(guessPhones('creeper')).toEqual(['K', 'R', 'IY1', 'P', 'ER0'])
  })

  it('reads every letter, including a q without u', () => {
    expect(guessPhones('qwen')).toEqual(['K', 'W', 'EH1', 'N'])
    expect(guessPhones('abcdefghijklmnopqrstuvwxyz').length).toBeGreaterThan(0)
  })

  it('reads a doubled consonant once', () => {
    expect(guessPhones('zustandd')).toEqual(['Z', 'AH1', 'S', 'T', 'AE0', 'N', 'D'])
  })
})
