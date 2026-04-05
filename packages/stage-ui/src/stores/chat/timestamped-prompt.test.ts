import { describe, expect, it } from 'vitest'

import { createTimegapNotification, formatMessageWithPromptTimestamps, formatPromptTimestamp, formatTimeDuration, injectTimegapNotifications, isSignificantTimegap, prefixPromptTimestamp } from './timestamped-prompt'

type CommonContentPart = {
  type: string
  [key: string]: unknown
}

type Message = {
  role: string
  content: string | CommonContentPart[]
  createdAt?: number
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

  it('formats time durations in human-readable format', () => {
    expect(formatTimeDuration(30000)).toBe('30 seconds')
    expect(formatTimeDuration(60000)).toBe('1 minute')
    expect(formatTimeDuration(180000)).toBe('3 minutes')
    expect(formatTimeDuration(3600000)).toBe('1 hour')
    expect(formatTimeDuration(5400000)).toBe('1 hour 30 minutes')
  })

  it('detects significant time gaps (>= 30 minutes)', () => {
    const base = new Date('2026-04-04T14:00:00').getTime()
    const after25min = base + 25 * 60 * 1000
    const after30min = base + 30 * 60 * 1000
    const after2hours = base + 2 * 60 * 60 * 1000

    expect(isSignificantTimegap(base, after25min)).toBe(false)
    expect(isSignificantTimegap(base, after30min)).toBe(true)
    expect(isSignificantTimegap(base, after2hours)).toBe(true)
  })

  it('creates timegap notification for system prompt', () => {
    const prev = new Date('2026-04-04T14:00:00').getTime()
    const current = new Date('2026-04-04T14:45:00').getTime() // 45 minutes later

    const notification = createTimegapNotification(prev, current)
    expect(notification.role).toBe('system')
    expect(notification.content).toContain('45 minutes have passed')
  })

  it('injects timegap notifications between messages when gap >= 30 minutes', () => {
    const base = new Date('2026-04-04T14:00:00').getTime()

    const messages: Message[] = [
      { role: 'user', content: 'Hi', createdAt: base },
      { role: 'assistant', content: 'Hello!', createdAt: base + 5000 },
      { role: 'user', content: 'OK', createdAt: base + 35 * 60 * 1000 }, // 35 minutes later
    ]

    const result = injectTimegapNotifications(messages)

    expect(result.length).toBe(4) // user + assistant + timegap + user
    expect(result[2].role).toBe('system')
    expect(result[2].content).toContain('35 minutes have passed')
  })
})
