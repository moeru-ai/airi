import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { describe, expect, it, vi } from 'vitest'

import { IOTraceHub } from '.'

function span(spanId: string, endMs: number): SerializedIOSpan {
  return {
    attributes: {},
    ended: true,
    endTimeNano: String(endMs * 1e6),
    events: [],
    kind: 0,
    name: 'LLM inference',
    parentSpanId: '',
    spanId,
    startTimeNano: String((endMs - 10) * 1e6),
    status: { code: 0, message: '' },
    traceId: 'trace-1',
  }
}

function createHub(options: { collecting?: boolean, maxSpans?: number, maxAgeMs?: number, now?: () => number } = {}) {
  let stored = options.collecting ?? true
  const hub = new IOTraceHub({
    getStoredCollecting: () => stored,
    setStoredCollecting: (collecting) => {
      stored = collecting
    },
    maxSpans: options.maxSpans,
    maxAgeMs: options.maxAgeMs,
    now: options.now ?? (() => 1_000_000),
  })
  return { hub, stored: () => stored }
}

describe('ioTraceHub', () => {
  it('returns the spans that ended before a subscription', () => {
    const { hub } = createHub()
    hub.publish(span('a', 999_000))
    hub.publish(span('b', 999_500))

    const { spans } = hub.subscribe(vi.fn())

    expect(spans.map(s => s.spanId)).toEqual(['a', 'b'])
  })

  it('sends each later span to a subscriber, and nothing after it unsubscribes', () => {
    const { hub } = createHub()
    const listener = vi.fn()
    const { unsubscribe } = hub.subscribe(listener)

    hub.publish(span('a', 999_000))
    unsubscribe()
    hub.publish(span('b', 999_500))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(span('a', 999_000))
  })

  it('keeps no spans while collecting is off, but still sends them to subscribers', () => {
    const { hub } = createHub({ collecting: false })
    const listener = vi.fn()
    hub.subscribe(listener)

    hub.publish(span('a', 999_000))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(hub.getState().bufferedSpans).toBe(0)
  })

  it('drops the oldest spans above the span limit', () => {
    const { hub } = createHub({ maxSpans: 2 })
    hub.publish(span('a', 999_000))
    hub.publish(span('b', 999_100))
    hub.publish(span('c', 999_200))

    const { spans } = hub.subscribe(vi.fn())

    expect(spans.map(s => s.spanId)).toEqual(['b', 'c'])
  })

  it('drops spans that ended earlier than the age limit', () => {
    let now = 1_000_000
    const { hub } = createHub({ maxAgeMs: 1000, now: () => now })
    hub.publish(span('old', 999_500))
    hub.publish(span('new', 999_900))
    now = 1_000_600

    const { spans } = hub.subscribe(vi.fn())

    expect(spans.map(s => s.spanId)).toEqual(['new'])
  })

  it('stores the collecting setting and clears kept spans when collecting stops', () => {
    const { hub, stored } = createHub()
    hub.publish(span('a', 999_000))

    const state = hub.setCollecting(false)

    expect(state.collecting).toBe(false)
    expect(state.bufferedSpans).toBe(0)
    expect(stored()).toBe(false)
  })
})
