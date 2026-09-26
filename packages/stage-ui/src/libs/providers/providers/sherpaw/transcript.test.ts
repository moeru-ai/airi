import { describe, expect, it } from 'vitest'

import { joinTranscriptSegments } from './transcript'

describe('joinTranscriptSegments', () => {
  it('adds spaces between Latin-script endpoint segments', () => {
    expect(joinTranscriptSegments(['Hello', 'world.'])).toBe('Hello world.')
  })

  it('does not add spaces between scripts that do not use word separators', () => {
    expect(joinTranscriptSegments(['你好', '世界'])).toBe('你好世界')
    expect(joinTranscriptSegments(['こんにちは', '世界'])).toBe('こんにちは世界')
    expect(joinTranscriptSegments(['สวัสดี', 'โลก'])).toBe('สวัสดีโลก')
  })

  it('does not add a space before punctuation', () => {
    expect(joinTranscriptSegments(['Hello', ',', 'world', '!'])).toBe('Hello, world!')
  })
})
