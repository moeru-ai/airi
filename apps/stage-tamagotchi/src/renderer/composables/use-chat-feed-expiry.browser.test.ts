import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'

import { useChatFeedExpiry } from './use-chat-feed-expiry'

const START = new Date('2026-10-05T00:00:00Z').getTime()

function setUp(initial: ChatHistoryItem[], { charactersPerSecond = 5, minimumSeconds = 3, voicingLookupSettled: initiallySettled = true } = {}) {
  const messages = ref(initial)
  const voicing = shallowRef(false)
  const voicingLookupSettled = shallowRef(initiallySettled)
  const enabled = shallowRef(true)
  const scope = effectScope()
  const { expiredBefore } = scope.run(() => useChatFeedExpiry({
    messages,
    voicing,
    voicingLookupSettled,
    enabled,
    charactersPerSecond,
    minimumSeconds,
  }))!
  return { messages, voicing, voicingLookupSettled, enabled, expiredBefore, scope }
}

/** Moves the clock, then lets the watchers react. */
async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
}

describe('useChatFeedExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides a message after the time to read its visible characters', async () => {
    // 30 characters at 5 per second take 6 seconds. Spaces do not count.
    const { expiredBefore } = setUp([{ role: 'user', content: '你好世界你好世界你好世界你好世界 aaaaa bbbbb cccc', createdAt: START }])

    await wait(5999)
    expect(expiredBefore.value).toBe(0)

    await wait(1)
    expect(expiredBefore.value).toBe(1)
  })

  it('shows a short message for the minimum time', async () => {
    const { expiredBefore } = setUp([{ role: 'user', content: 'ok', createdAt: START }])

    await wait(2999)
    expect(expiredBefore.value).toBe(0)

    await wait(1)
    expect(expiredBefore.value).toBe(1)
  })

  it('uses the minimum time that the reader set', async () => {
    const { expiredBefore } = setUp([{ role: 'user', content: 'ok', createdAt: START }], { minimumSeconds: 10 })

    await wait(9999)
    expect(expiredBefore.value).toBe(0)

    await wait(1)
    expect(expiredBefore.value).toBe(1)
  })

  it('never hides a short message before a longer one above it', async () => {
    const { expiredBefore } = setUp([
      { role: 'user', content: 'a'.repeat(50), createdAt: START },
      { role: 'user', content: 'ok', createdAt: START },
    ])

    await wait(5000)
    expect(expiredBefore.value).toBe(0)

    await wait(5000)
    expect(expiredBefore.value).toBe(2)
  })

  // ROOT CAUSE:
  //
  // A floating window guessed when a reply finished from local stream state,
  // which only the generating window has. A slow reply without speech counted
  // from its start, so it left as soon as it arrived.
  //
  // We fixed this by reading `completedAt`, which the generating window stores.
  it('counts a reply from when it finished generating', async () => {
    const { messages, expiredBefore } = setUp([])
    messages.value.push({ id: 'reply-1', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START - 60_000, completedAt: START })
    await wait(2999)
    expect(expiredBefore.value).toBe(0)

    await wait(1)
    expect(expiredBefore.value).toBe(1)
  })

  it('keeps a spoken reply until its speech ends', async () => {
    const { messages, voicing, expiredBefore } = setUp([])
    voicing.value = true
    messages.value.push({ id: 'reply-1', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START, completedAt: START })
    await wait(20_000)
    expect(expiredBefore.value).toBe(0)

    voicing.value = false
    await wait(0)
    expect(expiredBefore.value).toBe(1)
  })

  // ROOT CAUSE:
  //
  // The speech state reached a new window before its history. The reply was
  // matched to speech only when the speech state changed, so the history that
  // came later saw an old reply and hid it for good.
  //
  // We fixed this by holding the newest reply whenever speech output voices.
  it('keeps a spoken reply when the history arrives after the speech state', async () => {
    const { messages, voicing, expiredBefore } = setUp([])
    voicing.value = true
    await wait(0)

    messages.value = [{ id: 'reply-1', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START - 60_000, completedAt: START - 50_000 }]
    await wait(0)
    expect(expiredBefore.value).toBe(0)

    voicing.value = false
    await wait(0)
    expect(expiredBefore.value).toBe(1)
  })

  it('hides the messages of an earlier session at once', async () => {
    const { expiredBefore } = setUp([
      { role: 'user', content: 'hello', createdAt: START - 60_000 },
      { id: 'reply-1', role: 'assistant', content: 'hi', slices: [], tool_results: [], createdAt: START - 59_000 },
    ])
    await wait(0)

    expect(expiredBefore.value).toBe(2)
  })

  it('shows every message while disabled, and hides the read ones again when enabled', async () => {
    const { enabled, expiredBefore } = setUp([{ role: 'user', content: 'ok', createdAt: START }])
    await wait(3000)
    expect(expiredBefore.value).toBe(1)

    enabled.value = false
    await wait(0)
    expect(expiredBefore.value).toBe(0)

    enabled.value = true
    await wait(0)
    expect(expiredBefore.value).toBe(1)
  })

  it('does not bring back an expired reply when speech starts again', async () => {
    const { voicing, expiredBefore } = setUp([
      { id: 'reply-1', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START },
    ])
    await wait(3000)
    expect(expiredBefore.value).toBe(1)

    voicing.value = true
    await wait(0)
    expect(expiredBefore.value).toBe(1)
  })

  // ROOT CAUSE:
  //
  // A chat window that reopened while a reply was still spoken saw the reply
  // as old, and hid it for good before it learned that speech was playing.
  //
  // We fixed this by locking no message until the first speech lookup settles.
  it('keeps a reply that is still spoken when the window opens', async () => {
    // The session state reaches a new window after it mounts.
    const { messages, voicing, voicingLookupSettled, expiredBefore } = setUp([], { voicingLookupSettled: false })
    messages.value.push({ id: 'reply-1', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START - 60_000 })
    await wait(0)
    expect(expiredBefore.value).toBe(1)

    voicing.value = true
    voicingLookupSettled.value = true
    await wait(0)
    expect(expiredBefore.value).toBe(0)

    voicing.value = false
    await wait(0)
    expect(expiredBefore.value).toBe(1)
  })

  it('keeps a hidden reply hidden after a session switch with as many expired messages', async () => {
    const { messages, voicing, expiredBefore } = setUp([
      { id: 'reply-a', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START - 60_000 },
    ])
    await wait(0)
    expect(expiredBefore.value).toBe(1)

    messages.value = [{ id: 'reply-b', role: 'assistant', content: 'ok', slices: [], tool_results: [], createdAt: START - 60_000 }]
    await wait(0)
    voicing.value = true
    await wait(0)

    expect(expiredBefore.value).toBe(1)
  })

  it('stops its timer with the calling scope', async () => {
    const { scope } = setUp([{ role: 'user', content: 'ok', createdAt: START }])
    scope.stop()

    expect(vi.getTimerCount()).toBe(0)
  })
})
