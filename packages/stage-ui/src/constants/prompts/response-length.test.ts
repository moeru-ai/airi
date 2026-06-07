import { describe, expect, it } from 'vitest'

import { responseLengthGuidelinePrompt } from './response-length'

describe('responseLengthGuidelinePrompt', () => {
  /**
   * @example
   * responseLengthGuidelinePrompt(200)
   * // -> 'Keep each reply within roughly 200 characters. ...'
   */
  it('interpolates the configured character budget', () => {
    const prompt = responseLengthGuidelinePrompt(200)
    expect(prompt).toContain('within roughly 200 characters')
  })

  /**
   * @example
   * responseLengthGuidelinePrompt(80)
   * // -> single-line instruction, safe to join with other supplements via '\n\n'
   */
  it('produces a single-line instruction without trailing whitespace', () => {
    const prompt = responseLengthGuidelinePrompt(80)
    expect(prompt).not.toContain('\n')
    expect(prompt).toBe(prompt.trim())
  })

  it('keeps the trimming guidance so models shorten instead of truncating', () => {
    const prompt = responseLengthGuidelinePrompt(120)
    expect(prompt).toContain('rather than cutting off mid-sentence')
  })
})
