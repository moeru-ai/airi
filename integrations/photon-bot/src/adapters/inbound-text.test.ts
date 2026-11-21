import { describe, expect, it } from 'vitest'

import { replyTextFor, shapeOf, tapbackTextFor } from './inbound-text'

describe('replyTextFor', () => {
  it('quotes the answered message and names its sender', () => {
    expect(replyTextFor('yes please', { text: 'Do you want tea?', fromAgent: true })).toBe('Replying to your message "Do you want tea?": yes please')
    expect(replyTextFor('I mean coffee', { text: 'tea', fromAgent: false })).toBe('Replying to their own message "tea": I mean coffee')
  })

  it('puts a long quote on one line and shortens it to 80 characters', () => {
    const parent = { text: `first line\n\n  second line ${'z'.repeat(100)}`, fromAgent: true }
    expect(replyTextFor('ok', parent)).toBe(`Replying to your message "first line second line ${'z'.repeat(56)}…": ok`)
  })

  it('says "a message" when the answered message is not known or has no text', () => {
    expect(replyTextFor('nice photo')).toBe('Replying to a message: nice photo')
    expect(replyTextFor('nice photo', { fromAgent: false })).toBe('Replying to a message: nice photo')
  })
})

describe('tapbackTextFor', () => {
  it('writes the six tapbacks of iMessage as emoji', () => {
    const parent = { text: 'good night', fromAgent: true }
    expect(['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'].map(reaction => tapbackTextFor(reaction, parent))).toEqual([
      'Reacted ❤️ to your message "good night"',
      'Reacted 👍 to your message "good night"',
      'Reacted 👎 to your message "good night"',
      'Reacted 😂 to your message "good night"',
      'Reacted ‼️ to your message "good night"',
      'Reacted ❓ to your message "good night"',
    ])
    expect(tapbackTextFor(' Love ', parent)).toBe('Reacted ❤️ to your message "good night"')
  })

  it('passes a value that it does not know through', () => {
    expect(tapbackTextFor('🔥', { text: 'I passed the exam', fromAgent: false })).toBe('Reacted 🔥 to their own message "I passed the exam"')
    expect(tapbackTextFor('sparkle')).toBe('Reacted sparkle to a message')
  })
})

describe('shapeOf', () => {
  it('keeps the shape, shortens long strings, and masks handles', () => {
    const shape = shapeOf({
      id: 'message-1',
      sentBy: { id: 'human-1', handle: '+15550100001' },
      receivedBy: { id: 'agent-1', handle: 'airi@example.com' },
      content: { type: 'poll', text: 'y'.repeat(250) },
    })
    expect(JSON.parse(shape)).toEqual({
      id: 'message-1',
      sentBy: { id: 'human-1', handle: '…0001' },
      receivedBy: { id: 'agent-1', handle: 'a…@example.com' },
      content: { type: 'poll', text: `${'y'.repeat(200)}…` },
    })
  })
})
