import { describe, expect, it } from 'vitest'

import { judgePrompt, medianReading } from '.'

describe('medianReading', () => {
  const votes = (...readings: ('natural' | 'mixed' | 'spelled')[]) => readings.map(reading => ({ reading, reason: '' }))

  it('takes the reading of two votes of three', () => {
    expect(medianReading(votes('natural', 'spelled', 'natural'))).toBe('natural')
    expect(medianReading(votes('spelled', 'natural', 'spelled'))).toBe('spelled')
  })

  it('selects mixed when three votes differ', () => {
    expect(medianReading(votes('natural', 'mixed', 'spelled'))).toBe('mixed')
  })
})

describe('judgePrompt', () => {
  // Velin escapes backslashes in plain text, so the LaTeX example must stay in a code span.
  it('names the language and keeps the LaTeX example unchanged', async () => {
    const prompt = await judgePrompt('ja')
    expect(prompt).toContain('Japanese')
    expect(prompt).toContain(`\`${String.raw`$\frac{1}{2}$`}\``)
    expect(prompt).not.toContain('<script')
  })

  it('lists the standard readings of each language as natural', async () => {
    const prompt = await judgePrompt('ja')
    for (const reading of ['大なりイコール', '下付き', '下标', '아래첨자', 'dot dot dot'])
      expect(prompt).toContain(reading)
  })
})
