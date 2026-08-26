import { describe, expect, it } from 'vitest'

import { createChatBroadcastMessage, parseChatBroadcastMessage } from '../chat-broadcast'

describe('chat broadcast utils', () => {
  it('creates a normalized broadcast message from validated inputs', () => {
    expect(createChatBroadcastMessage('user-1', {
      chatId: 'chat-1',
      messages: [{ id: 'msg-1' }],
      fromSeq: 3,
      toSeq: 4,
    }, 'instance-A')).toEqual({
      userId: 'user-1',
      payload: {
        chatId: 'chat-1',
        messages: [{ id: 'msg-1' }],
        fromSeq: 3,
        toSeq: 4,
      },
      originInstanceId: 'instance-A',
    })
  })

  it('rejects invalid publish-side identifiers', () => {
    expect(() => createChatBroadcastMessage('', {
      chatId: 'chat-1',
      messages: [],
      fromSeq: 1,
      toSeq: 1,
    }, 'instance-A')).toThrow('chat broadcast userId must be a non-empty string')

    expect(() => createChatBroadcastMessage('user-1', {
      chatId: 'chat-1',
      messages: [],
      fromSeq: 1,
      toSeq: 1,
    }, '')).toThrow('chat broadcast originInstanceId must be a non-empty string')
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
      originInstanceId: 'instance-B',
    }))).toEqual({
      userId: 'user-2',
      payload: {
        chatId: 'chat-9',
        messages: ['message'],
        fromSeq: 9,
        toSeq: 12,
      },
      originInstanceId: 'instance-B',
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
      originInstanceId: 'instance-A',
    }))).toThrow('chat broadcast userId must be a non-empty string')
    expect(() => parseChatBroadcastMessage(JSON.stringify({
      userId: 'user-1',
      payload: {
        chatId: 'chat-1',
        messages: {},
        fromSeq: 1,
        toSeq: 1,
      },
      originInstanceId: 'instance-A',
    }))).toThrow('chat broadcast payload.messages must be an array')

    // commit 88744602f — chat broadcast loopback echoes
    //
    // ROOT CAUSE:
    //
    // Earlier broadcast messages did not carry originInstanceId, so the
    // sub callback could not distinguish "this came from another instance"
    // from "this came from us via redis loopback". Without it the sender's
    // own peers received every message twice (once from in-process fanout,
    // once from the sub callback re-delivering the publish).
    //
    // We fixed this by requiring originInstanceId on every wire message and
    // having the sub callback compare against its own instanceId before
    // delivering. The parse step rejects messages missing it so a stale
    // publisher cannot bypass the dedup.
    expect(() => parseChatBroadcastMessage(JSON.stringify({
      userId: 'user-1',
      payload: {
        chatId: 'chat-1',
        messages: [],
        fromSeq: 1,
        toSeq: 1,
      },
    }))).toThrow('chat broadcast originInstanceId must be a non-empty string')
  })
})
