import { describe, expect, it } from 'vitest'

import { buildMemoryConversation, formatLocalMinute, parseMemoryReply } from './memory-keeper'

const now = new Date(2026, 9, 13, 9, 30)

describe('parseMemoryReply', () => {
  it('reads JSON inside a code fence and surrounding text', () => {
    const reply = 'Sure!\n```json\n{"remember": ["The user likes tea."], "forget": [], "reminders": []}\n```'

    expect(parseMemoryReply(reply, 0, now)).toEqual({ remember: ['The user likes tea.'], forget: [], reminders: [] })
  })

  it('uses empty lists for missing fields and drops empty facts', () => {
    expect(parseMemoryReply('{"remember": ["  ", "The user is called Sam."]}', 0, now)).toEqual({
      remember: ['The user is called Sam.'],
      forget: [],
      reminders: [],
    })
  })

  it('converts 1-based forget numbers to indexes and drops unknown numbers', () => {
    expect(parseMemoryReply('{"forget": [1, 3, 0, 9, 1.5]}', 3, now).forget).toEqual([0, 2])
  })

  it('reads reminder times as local time and drops past or unreadable times', () => {
    const reply = JSON.stringify({
      reminders: [
        { title: 'Stretch', due: '2026-10-13T10:00' },
        { title: 'Old', due: '2026-10-12T10:00' },
        { title: 'Broken', due: 'tomorrow' },
        { title: ' ', due: '2026-10-13T11:00' },
      ],
    })

    expect(parseMemoryReply(reply, 0, now).reminders).toEqual([
      { title: 'Stretch', dueAt: new Date(2026, 9, 13, 10, 0).getTime() },
    ])
  })

  it('throws when the reply has no JSON object', () => {
    expect(() => parseMemoryReply('I have nothing to add.', 0, now)).toThrow('no JSON object')
  })

  it('throws when the JSON has the wrong shape', () => {
    expect(() => parseMemoryReply('{"remember": "The user likes tea."}', 0, now)).toThrow()
  })
})

describe('formatLocalMinute', () => {
  it('pads the local date and time', () => {
    expect(formatLocalMinute(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03')
  })
})

describe('buildMemoryConversation', () => {
  it('sends the current local time and numbered known facts', () => {
    const conversation = buildMemoryConversation({
      knownFacts: ['The user likes tea.'],
      userMessage: 'Remind me to stretch at 10.',
      companionReply: 'Sure!',
    }, now)

    expect(conversation.turns).toEqual([
      expect.objectContaining({
        type: 'system',
        content: [expect.objectContaining({ text: expect.stringContaining('Current local time: 2026-10-13T09:30 (Tuesday).') })],
      }),
      expect.objectContaining({
        type: 'user',
        content: [{
          type: 'text',
          text: JSON.stringify({
            knownFacts: [{ number: 1, text: 'The user likes tea.' }],
            userMessage: 'Remind me to stretch at 10.',
            companionReply: 'Sure!',
          }),
        }],
      }),
    ])
  })
})
