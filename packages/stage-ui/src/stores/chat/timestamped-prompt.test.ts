import { describe, expect, it } from 'vitest'

import { formatMessageWithPromptTimestamps, formatPromptTimestamp, prefixPromptTimestamp } from './timestamped-prompt'

interface CommonContentPart {
  type: string
  [key: string]: unknown
}

interface Message {
  role: string
  content: string | CommonContentPart[]
}

describe('timestamped-prompt', () => {
  it('formats timestamps using local date/time', () => {
    const timestamp = new Date('2026-04-04T14:00:00').getTime()
    expect(formatPromptTimestamp(timestamp)).toBe('2026-04-04 14:00:00')
  })

  it('prefixes string content with a timestamp and role label', () => {
    const prefix = '[2026-04-04 14:00:00] User: '
    const content = 'Hello there'

    expect(prefixPromptTimestamp(content, prefix)).toBe('[2026-04-04 14:00:00] User: Hello there')
  })

  it('prefixes the first text part in an array of content parts', () => {
    const prefix = '[2026-04-04 14:00:00] LLM: '
    const content: CommonContentPart[] = [
      { type: 'text', text: 'Good afternoon.' },
    ]

    expect(prefixPromptTimestamp(content, prefix)).toEqual([
      { type: 'text', text: '[2026-04-04 14:00:00] LLM: Good afternoon.' },
    ])
  })

  it('inserts a text prefix when the first content part is not text', () => {
    const prefix = '[2026-04-04 14:00:00] User: '
    const content: CommonContentPart[] = [
      { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
    ]

    expect(prefixPromptTimestamp(content, prefix)).toEqual([
      { type: 'text', text: '[2026-04-04 14:00:00] User: ' },
      { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
    ])
  })

  it('applies timestamp prefixes only to user and assistant messages', () => {
    const message: Message = {
      role: 'user',
      content: 'Hi there',
    }
    const result = formatMessageWithPromptTimestamps({ ...message, createdAt: new Date('2026-04-04T14:00:00').getTime() })

    expect(result.content).toBe('[2026-04-04 14:00:00] User: Hi there')
  })

  it('preserves non-user/assistant messages unchanged', () => {
    const message: Message = {
      role: 'system',
      content: 'System instruction',
    }

    expect(formatMessageWithPromptTimestamps(message)).toEqual(message)
  })
})
