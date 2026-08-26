import type { ChatAssistantMessage, ChatHistoryItem } from '@proj-airi/core-agent'
import type { WireMessage } from '@proj-airi/server-sdk-shared'

import { describe, expect, it } from 'vitest'

import { extractMessageText, isCloudSyncableMessage, mergeCloudMessagesIntoLocal, wireMessageToLocal } from './wire-message'

function makeWire(partial: Partial<WireMessage> & Pick<WireMessage, 'id' | 'seq'>): WireMessage {
  return {
    chatId: partial.chatId ?? 'chat-1',
    content: partial.content ?? '',
    createdAt: partial.createdAt ?? 0,
    role: partial.role ?? 'assistant',
    senderId: partial.senderId ?? null,
    updatedAt: partial.updatedAt ?? 0,
    ...partial,
  }
}

describe('extractMessageText', () => {
  /**
   * @example
   * User message with plain string content → returns the string verbatim.
   */
  it('returns the string content of user / system messages directly', () => {
    expect(extractMessageText({ content: 'hi there', role: 'user' })).toBe('hi there')
    expect(extractMessageText({ content: 'system prompt', role: 'system' })).toBe('system prompt')
  })

  /**
   * @example
   * Assistant message built from streaming has a slices array; we prefer it
   * over the legacy `content` string because slices carry the live transcript.
   */
  it('joins assistant text slices when present', () => {
    const assistant: ChatAssistantMessage = {
      content: 'old',
      role: 'assistant',
      slices: [
        { text: 'hello ', type: 'text' },
        { text: 'world', type: 'text' },
      ],
      tool_results: [],
    }
    expect(extractMessageText(assistant)).toBe('hello world')
  })

  /**
   * @example
   * User message with multimodal parts → only the text parts come back.
   */
  it('flattens content arrays into their text parts only', () => {
    const userWithImage: ChatHistoryItem = {
      content: [
        { text: 'look at this:', type: 'text' },
        { image_url: { url: 'data:image/png;base64,...' }, type: 'image_url' } as never,
      ],
      role: 'user',
    }
    expect(extractMessageText(userWithImage)).toBe('look at this:')
  })
})

describe('isCloudSyncableMessage', () => {
  /**
   * @example
   * v1 limitation: tool_call exchanges, system prompts, and per-device runtime
   * errors stay local. The server's wire schema does not represent tool_call_id;
   * system prompts are recomputed on every device from settings; error
   * messages describe a per-device runtime failure that is meaningless to
   * other devices and gets rejected by the server's role validator.
   */
  it('accepts only user / assistant; rejects tool / system / error', () => {
    expect(isCloudSyncableMessage({ content: 'x', role: 'tool', tool_call_id: 't' } as ChatHistoryItem)).toBe(false)
    expect(isCloudSyncableMessage({ content: 'x', role: 'system' })).toBe(false)
    expect(isCloudSyncableMessage({ content: 'x', role: 'error' })).toBe(false)
    expect(isCloudSyncableMessage({ content: 'x', role: 'user' })).toBe(true)
    expect(isCloudSyncableMessage({ content: 'x', role: 'assistant', slices: [], tool_results: [] })).toBe(true)
  })
})

describe('wireMessageToLocal', () => {
  /**
   * @example
   * Server pushes an assistant wire message; local shape needs slices and
   * tool_results placeholders so downstream UI invariants hold.
   */
  it('synthesizes assistant slices + empty tool_results from a wire message', () => {
    const wire: WireMessage = {
      chatId: 'c1',
      content: 'reply',
      createdAt: 1730000000000,
      id: 'm1',
      role: 'assistant',
      senderId: null,
      seq: 7,
      updatedAt: 1730000000000,
    }
    const local = wireMessageToLocal(wire) as ChatAssistantMessage
    expect(local.role).toBe('assistant')
    expect(local.content).toBe('reply')
    expect(local.slices).toEqual([{ text: 'reply', type: 'text' }])
    expect(local.tool_results).toEqual([])
    expect((local as ChatHistoryItem).id).toBe('m1')
    expect((local as ChatHistoryItem).createdAt).toBe(1730000000000)
  })

  /**
   * @example
   * Empty content should yield an empty slices array, not a slice with empty
   * text — that would produce a confusing UI bubble.
   */
  it('produces empty slices for assistant wire messages with empty content', () => {
    const wire: WireMessage = {
      chatId: 'c1',
      content: '',
      createdAt: 0,
      id: 'm-empty',
      role: 'assistant',
      senderId: null,
      seq: 1,
      updatedAt: 0,
    }
    const local = wireMessageToLocal(wire) as ChatAssistantMessage
    expect(local.slices).toEqual([])
  })

  /**
   * @example
   * Tool wire messages cannot reconstruct tool_call_id; we emit an error
   * placeholder so the user sees something rather than a silent drop.
   */
  it('downgrades tool wire messages to error placeholders', () => {
    const wire: WireMessage = {
      chatId: 'c1',
      content: '',
      createdAt: 0,
      id: 'm-tool',
      role: 'tool',
      senderId: null,
      seq: 1,
      updatedAt: 0,
    }
    const local = wireMessageToLocal(wire)
    expect(local.role).toBe('error')
    expect(local.content).toContain('tool message')
  })
})

describe('mergeCloudMessagesIntoLocal', () => {
  /**
   * @example
   * Server pushes a message that the local sender just wrote. The local
   * version is preserved (dedup by id) and only the seq cursor advances.
   */
  it('drops echoes of locally-authored messages by id, keeps cursor in sync', () => {
    const localUser: ChatHistoryItem = { content: 'hi', createdAt: 0, id: 'm1', role: 'user' }
    const result = mergeCloudMessagesIntoLocal(
      [localUser],
      0,
      {
        messages: [makeWire({ content: 'hi', id: 'm1', role: 'user', seq: 5 })],
        toSeq: 5,
      },
    )
    expect(result.dirty).toBe(true)
    expect(result.maxSeq).toBe(5)
    // Echo deduped: the message list reference is the same, no duplicate.
    expect(result.messages.length).toBe(1)
    expect(result.messages[0]).toBe(localUser)
  })

  /**
   * @example
   * Pull returns messages we have not seen — append in the order received,
   * mark dirty, and bump cursor.
   */
  it('appends genuinely new wire messages to the end of the list', () => {
    const localUser: ChatHistoryItem = { content: 'hi', createdAt: 0, id: 'm1', role: 'user' }
    const result = mergeCloudMessagesIntoLocal(
      [localUser],
      5,
      {
        messages: [
          makeWire({ content: 'hello', id: 'm2', role: 'assistant', seq: 6 }),
          makeWire({ content: 'world', id: 'm3', role: 'assistant', seq: 7 }),
        ],
        toSeq: 7,
      },
    )
    expect(result.dirty).toBe(true)
    expect(result.maxSeq).toBe(7)
    expect(result.messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  /**
   * @example
   * No payload messages, but server reports a higher cursor (e.g. server-side
   * deletion). We still mark dirty so the cursor persists and avoid pulling
   * the same range again next time.
   */
  it('honours toSeq when no new messages arrive', () => {
    const result = mergeCloudMessagesIntoLocal(
      [{ content: 'hi', createdAt: 0, id: 'm1', role: 'user' }],
      5,
      { messages: [], toSeq: 9 },
    )
    expect(result.dirty).toBe(true)
    expect(result.maxSeq).toBe(9)
  })

  /**
   * @example
   * Idempotent re-pull. Nothing to do, return the input untouched.
   */
  it('returns the original list reference when there is nothing to do', () => {
    const messages: ChatHistoryItem[] = [{ content: 'hi', createdAt: 0, id: 'm1', role: 'user' }]
    const result = mergeCloudMessagesIntoLocal(messages, 5, { messages: [], toSeq: 5 })
    expect(result.dirty).toBe(false)
    expect(result.messages).toBe(messages)
    expect(result.maxSeq).toBe(5)
  })

  /**
   * @example
   * Reconnect catchup: a `newMessages` push fires before our `pullMessages`
   * resolves. Both events carry the same wire message; the second merge
   * must be a no-op (same id, same seq).
   */
  it('handles overlapping pull + push without duplication', () => {
    const initial: ChatHistoryItem[] = [{ content: 'hi', createdAt: 0, id: 'm1', role: 'user' }]
    const wireMessages = [makeWire({ content: 'reply', id: 'm2', role: 'assistant', seq: 6 })]

    const afterPush = mergeCloudMessagesIntoLocal(initial, 5, { messages: wireMessages, toSeq: 6 })
    expect(afterPush.messages.map(m => m.id)).toEqual(['m1', 'm2'])

    // Same payload arriving again via pullMessages → no-op.
    const afterPull = mergeCloudMessagesIntoLocal(afterPush.messages, afterPush.maxSeq, { messages: wireMessages, toSeq: 6 })
    expect(afterPull.dirty).toBe(false)
    expect(afterPull.messages).toBe(afterPush.messages)
  })

  /**
   * @example
   * Server pagination boundaries (or pub/sub interleave) can deliver a
   * payload whose messages are not in seq order. The merge must sort them
   * before appending so the in-memory list stays monotonic — without the
   * sort, a list reordered once stays permanently misordered because the
   * cursor still advances and subsequent pulls do not re-fix it.
   */
  it('sorts incoming wire messages by seq before appending', () => {
    const result = mergeCloudMessagesIntoLocal(
      [],
      0,
      {
        messages: [
          makeWire({ id: 'm3', seq: 9 }),
          makeWire({ id: 'm1', seq: 7 }),
          makeWire({ id: 'm2', seq: 8 }),
        ],
        toSeq: 9,
      },
    )
    expect(result.messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(result.maxSeq).toBe(9)
  })
})
