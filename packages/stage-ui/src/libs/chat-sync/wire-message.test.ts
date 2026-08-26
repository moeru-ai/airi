import type { ChatAssistantMessage, ChatHistoryItem } from '@proj-airi/core-agent'
import type { WireMessage } from '@proj-airi/server-sdk-shared'

import { describe, expect, it } from 'vitest'

import { extractMessageText, isCloudSyncableMessage, mergeCloudMessagesIntoLocal, wireMessageToLocal } from './wire-message'

function makeWire(partial: Partial<WireMessage> & Pick<WireMessage, 'id' | 'seq'>): WireMessage {
  return {
    chatId: partial.chatId ?? 'chat-1',
    senderId: partial.senderId ?? null,
    role: partial.role ?? 'assistant',
    content: partial.content ?? '',
    createdAt: partial.createdAt ?? 0,
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
    expect(extractMessageText({ role: 'user', content: 'hi there' })).toBe('hi there')
    expect(extractMessageText({ role: 'system', content: 'system prompt' })).toBe('system prompt')
  })

  /**
   * @example
   * Assistant message built from streaming has a slices array; we prefer it
   * over the legacy `content` string because slices carry the live transcript.
   */
  it('joins assistant text slices when present', () => {
    const assistant: ChatAssistantMessage = {
      role: 'assistant',
      content: 'old',
      slices: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
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
      role: 'user',
      content: [
        { type: 'text', text: 'look at this:' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } } as never,
      ],
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
    expect(isCloudSyncableMessage({ role: 'tool', content: 'x', tool_call_id: 't' } as ChatHistoryItem)).toBe(false)
    expect(isCloudSyncableMessage({ role: 'system', content: 'x' })).toBe(false)
    expect(isCloudSyncableMessage({ role: 'error', content: 'x' })).toBe(false)
    expect(isCloudSyncableMessage({ role: 'user', content: 'x' })).toBe(true)
    expect(isCloudSyncableMessage({ role: 'assistant', content: 'x', slices: [], tool_results: [] })).toBe(true)
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
      id: 'm1',
      chatId: 'c1',
      senderId: null,
      role: 'assistant',
      content: 'reply',
      seq: 7,
      createdAt: 1730000000000,
      updatedAt: 1730000000000,
    }
    const local = wireMessageToLocal(wire) as ChatAssistantMessage
    expect(local.role).toBe('assistant')
    expect(local.content).toBe('reply')
    expect(local.slices).toEqual([{ type: 'text', text: 'reply' }])
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
      id: 'm-empty',
      chatId: 'c1',
      senderId: null,
      role: 'assistant',
      content: '',
      seq: 1,
      createdAt: 0,
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
      id: 'm-tool',
      chatId: 'c1',
      senderId: null,
      role: 'tool',
      content: '',
      seq: 1,
      createdAt: 0,
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
    const localUser: ChatHistoryItem = { role: 'user', content: 'hi', id: 'm1', createdAt: 0 }
    const result = mergeCloudMessagesIntoLocal(
      [localUser],
      0,
      {
        messages: [makeWire({ id: 'm1', role: 'user', content: 'hi', seq: 5 })],
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
    const localUser: ChatHistoryItem = { role: 'user', content: 'hi', id: 'm1', createdAt: 0 }
    const result = mergeCloudMessagesIntoLocal(
      [localUser],
      5,
      {
        messages: [
          makeWire({ id: 'm2', role: 'assistant', content: 'hello', seq: 6 }),
          makeWire({ id: 'm3', role: 'assistant', content: 'world', seq: 7 }),
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
      [{ role: 'user', content: 'hi', id: 'm1', createdAt: 0 }],
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
    const messages: ChatHistoryItem[] = [{ role: 'user', content: 'hi', id: 'm1', createdAt: 0 }]
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
    const initial: ChatHistoryItem[] = [{ role: 'user', content: 'hi', id: 'm1', createdAt: 0 }]
    const wireMessages = [makeWire({ id: 'm2', role: 'assistant', content: 'reply', seq: 6 })]

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
