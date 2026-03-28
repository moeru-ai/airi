import { describe, expect, it } from 'vitest'

import { createChatBroadcastMessage, parseChatBroadcastMessage } from '../chat-broadcast'

describe('chat broadcast utils', () => {
  it('creates a normalized broadcast message from validated inputs', () => {
    expect(createChatBroadcastMessage('user-1', {
      chatId: 'chat-1',
      messages: [{ id: 'msg-1' }],
      fromSeq: 3,
      toSeq: 4,
    })).toEqual({
      userId: 'user-1',
      payload: {
        chatId: 'chat-1',
        messages: [{ id: 'msg-1' }],
        fromSeq: 3,
        toSeq: 4,
      },
    })
  })

  it('rejects invalid publish-side identifiers', () => {
    expect(() => createChatBroadcastMessage('', {
      chatId: 'chat-1',
      messages: [],
      fromSeq: 1,
      toSeq: 1,
    })).toThrow('chat broadcast userId must be a non-empty string')
  })

  it('parses a valid broadcast message payload', () => {
    expect(parseChatBroadcastMessage(JSON.stringify({
      userId: 'user-2',
      payload: {
        chatId: 'chat-9',
        messages: ['message'],
        fromSeq: 9,
        toSeq: 12,
      },
    }))).toEqual({
      userId: 'user-2',
      payload: {
        chatId: 'chat-9',
        messages: ['message'],
        fromSeq: 9,
        toSeq: 12,
      },
    })
  })

  it('rejects invalid json and malformed payloads', () => {
    expect(() => parseChatBroadcastMessage('not-json')).toThrow('chat broadcast message is not valid JSON')
    expect(() => parseChatBroadcastMessage(JSON.stringify({
      userId: {},
      payload: {
        chatId: 'chat-1',
        messages: [],
        fromSeq: 1,
        toSeq: 1,
      },
    }))).toThrow('chat broadcast userId must be a non-empty string')
    expect(() => parseChatBroadcastMessage(JSON.stringify({
      userId: 'user-1',
      payload: {
        chatId: 'chat-1',
        messages: {},
        fromSeq: 1,
        toSeq: 1,
      },
    }))).toThrow('chat broadcast payload.messages must be an array')
  })
})
