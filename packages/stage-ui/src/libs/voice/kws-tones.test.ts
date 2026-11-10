import { describe, expect, it } from 'vitest'

import { createToneVariants } from './kws-tones'

describe('createToneVariants', () => {
  const variants = createToneVariants(new Set(['h', 'ēi', 'èi', 'y', 'ī', 'ì', 'l', 'ū', 'ú', 'ù', 'n', 'ń', 'üè', 'üě', 'ue', 'IY1', 'IY0']))

  it('changes the tone of one final in each variant', () => {
    expect(variants(['h', 'ēi', 'y', 'ī', 'l', 'ū'])).toEqual([
      ['h', 'èi', 'y', 'ī', 'l', 'ū'],
      ['h', 'ēi', 'y', 'ì', 'l', 'ū'],
      ['h', 'ēi', 'y', 'ī', 'l', 'ú'],
      ['h', 'ēi', 'y', 'ī', 'l', 'ù'],
    ])
  })

  it('keeps initials, syllabic nasals, and English phones unchanged', () => {
    expect(variants(['n', 'ń', 'IY1'])).toEqual([])
  })

  it('keeps the diaeresis of ü when it changes the tone', () => {
    expect(variants(['üè'])).toEqual([['üě']])
  })
})
