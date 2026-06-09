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
  // A blind `[...storedMessages, ...extraMessages]` tail-append is only correct
  // when the messages missing from disk are the NEWEST ones (the happy-path
  // test above). When an OLDER message is the one missing from disk (a
  // stop+resend orphan that lives in memory but not on the disk copy a second
  // window read), it gets tacked onto the END, after its newer twin. History is
  // silently reordered, which breaks prompt caching.
  //
  // The structural merge places each extra right after the nearest preceding
  // in-memory message that also exists on disk (its anchor), so the orphan
  // lands back in its conversational slot without reordering any stored row.
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

  it('keeps an equal-createdAt user/assistant pair in arrival order', () => {
    // A user turn and its reply can share a createdAt (same millisecond). The
    // merge orders extras by their in-memory arrival order, never by
    // timestamp, so the pair can never flip.
    const system: ChatHistoryItem = { role: 'system', content: 'system', createdAt: 1, id: 'system' }
    const user: ChatHistoryItem = { role: 'user', content: 'same ms', createdAt: 5, id: 'u-same' }
    const reply: ChatHistoryItem = { role: 'assistant', content: 'reply', createdAt: 5, id: 'a-same', slices: [], tool_results: [] }

    const storedMessages: ChatHistoryItem[] = [system]
    const currentMessages: ChatHistoryItem[] = [system, user, reply]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([system, user, reply])
  })

  it('keeps a createdAt-less row in position instead of jumping it to the front', () => {
    // Error rows are appended without a createdAt. Sorting the body by
    // timestamp (with a missing key coerced to 0) would jump every such row
    // to the front on the next merge and persist that reorder; the structural
    // merge never reorders stored rows, so the row stays where disk put it.
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

  it('does not let a regenerated system timestamp push a leading keyless row to the tail', () => {
    // The pinned system message is regenerated with a fresh createdAt when the
    // prompt changes, so its timestamp can exceed every body row's. Stored
    // order is canonical and timestamps play no part in placement, so a
    // keyless row at the head of the body stays in its on-disk position.
    const system: ChatHistoryItem = { role: 'system', content: 'system', createdAt: 9999, id: 'system' }
    const errorRow: ChatHistoryItem = { role: 'error', content: 'a failure', id: 'err-lead' }
    const olderUser: ChatHistoryItem = { role: 'user', content: 'older prompt', createdAt: 100, id: 'u-old' }
    const laterUser: ChatHistoryItem = { role: 'user', content: 'later prompt', createdAt: 200, id: 'u-later' }

    // Disk: the keyless error row is the first body message, ahead of an older keyed turn.
    const storedMessages: ChatHistoryItem[] = [system, errorRow, olderUser]
    // Memory adds a newer message, forcing the merge to rebuild + sort.
    const currentMessages: ChatHistoryItem[] = [system, errorRow, olderUser, laterUser]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([system, errorRow, olderUser, laterUser])
  })

  // ROOT CAUSE:
  //
  // Stored bodies can mix clock sources: locally-authored rows are stamped by
  // the device clock while cloud-pulled rows carry the server's insert clock
  // (the upload schema never round-trips the client timestamp). With a device
  // clock running ahead of the server, a prompt/reply pair is correctly
  // ordered on disk but carries inverted createdAt values. A merge that
  // re-sorted the body by createdAt flipped the reply BEFORE its prompt and
  // persisted the transposition.
  //
  // We fixed this by making stored order canonical: the merge never reorders
  // stored rows and places extras structurally (by anchor), ignoring
  // timestamps entirely.
  it('never reorders stored rows whose timestamps came from different clocks (device ahead of server)', () => {
    const system: ChatHistoryItem = { role: 'system', content: 'system', createdAt: 1, id: 'system' }
    // Local prompt stamped by a device clock 30s ahead of the server.
    const localPrompt: ChatHistoryItem = { role: 'user', content: 'a question', createdAt: 100_030_000, id: 'u-local' }
    // Its reply was pulled from the cloud carrying the smaller server timestamp.
    const cloudReply: ChatHistoryItem = { role: 'assistant', content: 'an answer', createdAt: 100_001_000, id: 'a-cloud', slices: [], tool_results: [] }
    const newPrompt: ChatHistoryItem = { role: 'user', content: 'a follow-up', createdAt: 100_040_000, id: 'u-next' }

    // Disk order is conversationally correct despite the inverted timestamps.
    const storedMessages: ChatHistoryItem[] = [system, localPrompt, cloudReply]
    // Memory adds an in-flight extra, forcing the merge to rebuild.
    const currentMessages: ChatHistoryItem[] = [system, localPrompt, cloudReply, newPrompt]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([system, localPrompt, cloudReply, newPrompt])
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
