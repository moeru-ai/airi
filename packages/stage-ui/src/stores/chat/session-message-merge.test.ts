import type { ChatHistoryItem } from '../../types/chat'

import { describe, expect, it } from 'vitest'

import { mergeLoadedSessionMessages } from './session-message-merge'

describe('mergeLoadedSessionMessages', () => {
  it('keeps stored history when the in-memory session only has the placeholder system message', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system-stored' },
      { role: 'assistant', content: 'saved reply', createdAt: 2, id: 'assistant-1', slices: [], tool_results: [] },
    ]
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 3, id: 'system-current' },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toBe(storedMessages)
  })

  it('appends in-flight messages when IndexedDB finishes loading after a new send starts', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system-stored' },
      { role: 'assistant', content: 'older reply', createdAt: 2, id: 'assistant-1', slices: [], tool_results: [] },
    ]
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 3, id: 'system-current' },
      { role: 'user', content: 'latest prompt', createdAt: 4, id: 'user-2' },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([
      ...storedMessages,
      currentMessages[1],
    ])
  })

  it('does not duplicate messages that are already present in storage', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system-stored' },
      { role: 'user', content: 'latest prompt', createdAt: 4 },
    ]
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 3, id: 'system-current' },
      { role: 'user', content: 'latest prompt', createdAt: 4 },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toBe(storedMessages)
  })

  it('keeps a system message when storage is empty and current has in-flight user messages', () => {
    const storedMessages: ChatHistoryItem[] = []
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system from memory', createdAt: 1, id: 'system-current' },
      { role: 'user', content: 'in-flight prompt', createdAt: 2, id: 'user-1' },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([
      currentMessages[0],
      currentMessages[1],
    ])
  })

  // ROOT CAUSE:
  //
  // mergeLoadedSessionMessages ends in `[...storedMessages, ...extraMessages]`,
  // where `extraMessages` is every in-memory message absent from the stored
  // (disk) copy by fingerprint. The append ignores `createdAt`. That is only
  // correct when the messages missing from disk are the NEWEST ones (the
  // happy-path test above). When an OLDER message is the one missing from disk
  // (a stop+resend orphan that lives in memory but not on the disk copy a second
  // window read), it gets tacked onto the END, after its newer twin. History is
  // silently reordered, which breaks prompt caching.
  //
  // This asserts the CORRECT chronological result and so FAILS against the
  // current blind tail-append; the order-stable merge (dedupe by id, system
  // first, stable-sort the rest by createdAt) makes it pass.
  it('keeps chronological order when an older in-memory orphan is missing from the stored copy (chat reorder bug)', () => {
    // The same text is resent after stopping, so each orphan and its resent twin
    // share content but differ by id+createdAt, which is exactly why the orphan
    // is not deduped and survives as an extra.
    const system: ChatHistoryItem = { role: 'system', content: 'system', createdAt: 2100, id: 'system' }
    const userA: ChatHistoryItem = { role: 'user', content: 'first prompt', createdAt: 2160, id: 'u-a' }
    const replyA: ChatHistoryItem = { role: 'assistant', content: 'first reply', createdAt: 2161, id: 'a-a', slices: [], tool_results: [] }
    const orphanB: ChatHistoryItem = { role: 'user', content: 'second prompt', createdAt: 2170, id: 'u-b-orphan' }
    const userB: ChatHistoryItem = { role: 'user', content: 'second prompt', createdAt: 2200, id: 'u-b' }
    const replyB: ChatHistoryItem = { role: 'assistant', content: 'second reply', createdAt: 2201, id: 'a-b', slices: [], tool_results: [] }
    const orphanC: ChatHistoryItem = { role: 'user', content: 'third prompt', createdAt: 2220, id: 'u-c-orphan' }
    const userC: ChatHistoryItem = { role: 'user', content: 'third prompt', createdAt: 2230, id: 'u-c' }
    const replyC: ChatHistoryItem = { role: 'assistant', content: 'third reply', createdAt: 2231, id: 'a-c', slices: [], tool_results: [] }

    // Disk copy is stale: it has the resent twins but is missing both orphans.
    const storedMessages: ChatHistoryItem[] = [
      system,
      userA,
      replyA,
      userB,
      replyB,
      userC,
      replyC,
    ]
    // Memory is fresh: the orphans sit in their correct chronological position.
    const currentMessages: ChatHistoryItem[] = [
      system,
      userA,
      replyA,
      orphanB,
      userB,
      replyB,
      orphanC,
      userC,
      replyC,
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([
      system,
      userA,
      replyA,
      orphanB,
      userB,
      replyB,
      orphanC,
      userC,
      replyC,
    ])
  })

  it('keeps an equal-createdAt user/assistant pair in arrival order (stable tie-break)', () => {
    // A user turn and its reply can share a createdAt (same millisecond). The
    // order-stable merge must keep the user before the assistant, never flip
    // them, so the comparator carries an original-index tiebreak rather than
    // leaning on engine sort stability.
    const system: ChatHistoryItem = { role: 'system', content: 'system', createdAt: 1, id: 'system' }
    const user: ChatHistoryItem = { role: 'user', content: 'same ms', createdAt: 5, id: 'u-same' }
    const reply: ChatHistoryItem = { role: 'assistant', content: 'reply', createdAt: 5, id: 'a-same', slices: [], tool_results: [] }

    const storedMessages: ChatHistoryItem[] = [system]
    const currentMessages: ChatHistoryItem[] = [system, user, reply]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([system, user, reply])
  })

  it('keeps a createdAt-less row in position instead of jumping it to the front', () => {
    // Error rows are appended without a createdAt. Coercing a missing key to 0
    // (a tempting fix) would sort every such row to the front on the next merge
    // and persist that reorder. The carry-forward key instead keeps the row
    // adjacent to its predecessor.
    const system: ChatHistoryItem = { role: 'system', content: 'system', createdAt: 1, id: 'system' }
    const reply: ChatHistoryItem = { role: 'assistant', content: 'older reply', createdAt: 10, id: 'a-old', slices: [], tool_results: [] }
    const errorRow: ChatHistoryItem = { role: 'error', content: 'a failure', id: 'err-1' }
    const laterUser: ChatHistoryItem = { role: 'user', content: 'later prompt', createdAt: 20, id: 'u-later' }

    // The error row sits after the reply on disk (no createdAt of its own).
    const storedMessages: ChatHistoryItem[] = [system, reply, errorRow]
    // Memory adds a newer message, forcing the merge to rebuild + sort.
    const currentMessages: ChatHistoryItem[] = [system, reply, errorRow, laterUser]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([system, reply, errorRow, laterUser])
  })

  it('uses flattened array text for deduplication fingerprints', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: ' world' },
        ],
        createdAt: 5,
      },
    ]

    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 2, id: 'system-memory' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello world' },
        ],
        createdAt: 5,
      },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toBe(storedMessages)
  })
})
