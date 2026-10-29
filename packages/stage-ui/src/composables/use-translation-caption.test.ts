import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import { useTranslationCaption } from './use-translation-caption'

function setup() {
  const scope = effectScope()
  const sessionId = ref('session-a')
  const caption = scope.run(() => useTranslationCaption(sessionId))!
  const turn = { sessionId: 'session-a', turnId: 'turn-a', speaks: true }
  caption.begin(turn)
  return { scope, sessionId, caption, turn }
}

afterEach(() => vi.useRealTimers())

describe('translation caption', () => {
  it('keeps chunk boundaries and whitespace without inserted separators', () => {
    const { scope, caption, turn } = setup()
    for (const chunk of ['你', '好', ' ', 'world'])
      caption.append(chunk, turn)
    expect(caption.text.value).toBe('你好 world')
    scope.stop()
  })

  it('ignores background replies and chunks from a replaced turn', () => {
    const { scope, caption, turn } = setup()
    caption.append('first', turn)
    caption.begin({ ...turn, turnId: 'background', speaks: false })
    caption.append('hidden', { ...turn, turnId: 'background' })
    expect(caption.text.value).toBe('first')
    const next = { ...turn, turnId: 'next' }
    caption.begin(next)
    caption.append('late', turn)
    expect(caption.text.value).toBe('')
    caption.append('second', next)
    expect(caption.text.value).toBe('second')
    scope.stop()
  })

  it('clears and rejects stale chunks after session switch and cancellation', () => {
    const { scope, sessionId, caption, turn } = setup()
    caption.append('first', turn)
    sessionId.value = 'session-b'
    caption.append('late', turn)
    expect(caption.text.value).toBe('')
    sessionId.value = 'session-a'
    caption.append('still late', turn)
    expect(caption.text.value).toBe('')
    caption.begin(turn)
    caption.append('new', turn)
    caption.cancel({ ...turn, turnId: 'other' })
    expect(caption.text.value).toBe('new')
    caption.cancel(turn)
    caption.append('cancelled', turn)
    expect(caption.text.value).toBe('')
    scope.stop()
  })

  it('replaces a previous tool-round translation and expires without losing chunk context', () => {
    vi.useFakeTimers()
    const { scope, caption, turn } = setup()
    caption.append('first round', turn)
    caption.append('', turn)
    caption.append('next', turn)
    expect(caption.text.value).toBe('next')
    vi.advanceTimersByTime(10_000)
    expect(caption.text.value).toBe('')
    caption.append(' round', turn)
    expect(caption.text.value).toBe('next round')
    scope.stop()
    expect(caption.text.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })
})
