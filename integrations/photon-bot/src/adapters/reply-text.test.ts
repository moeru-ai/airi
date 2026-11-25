import { describe, expect, it } from 'vitest'

import { maskHandle, replyTextOf } from './reply-text'

describe('replyTextOf', () => {
  it('reads content when the stage fills it', () => {
    expect(replyTextOf({ content: 'hi there' })).toBe('hi there')
    expect(replyTextOf({ content: [{ type: 'text', text: 'hi ' }, { type: 'text', text: 'there' }] })).toBe('hi there')
  })

  it('reads categorization.speech when content is empty', () => {
    expect(replyTextOf({ content: '', slices: [], categorization: { speech: 'from speech', reasoning: 'hidden' } })).toBe('from speech')
  })

  it('removes well-formed and malformed control tokens', () => {
    const speech = '<ACT {"emotion":{"name":"surprised","intensity":1}}|><DELAY 1|> Wahh! <|ACT {"emotion":"happy"}|> Boo to you too.'
    expect(replyTextOf({ content: '', categorization: { speech } })).toBe('Wahh! Boo to you too.')
  })

  it('keeps line breaks and ordinary angle brackets', () => {
    expect(replyTextOf({ content: 'a < b\n\n\n\nnext line' })).toBe('a < b\n\nnext line')
  })

  it('returns an empty string for a message without text', () => {
    expect(replyTextOf(undefined)).toBe('')
    expect(replyTextOf({ content: '', categorization: {} })).toBe('')
    expect(replyTextOf({ content: '<|ACT {"emotion":"happy"}|>' })).toBe('')
  })
})

describe('maskHandle', () => {
  it('keeps the last four digits of a phone number', () => {
    expect(maskHandle('+15550100001')).toBe('…0001')
  })

  it('keeps the first character and the domain of an email', () => {
    expect(maskHandle('alice@example.com')).toBe('a…@example.com')
  })
})
