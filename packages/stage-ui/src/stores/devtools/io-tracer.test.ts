import type { TraceFeedMessage, TraceFeedSource } from '@proj-airi/trace-kit'

import { createRecordStamper } from '@proj-airi/trace-kit/testing'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setTraceFeedSource } from '../../composables/use-trace'
import { useIOTracerStore } from './io-tracer'

let record = createRecordStamper({ source: 'window:a', clock: 'mono:test' })

/** A feed that keeps a backlog and pushes later messages to the open subscriptions. */
function createFakeFeed() {
  const backlog: TraceFeedMessage[] = []
  const listeners = new Set<(message: TraceFeedMessage) => void>()
  const unsubscribe = vi.fn()
  const setTracks = vi.fn()
  const source: TraceFeedSource = {
    traceClock: 'mono:test',
    subscribe: async (onMessage) => {
      for (const message of backlog)
        onMessage(message)
      onMessage({ kind: 'caughtUp', cursor: {}, traceClock: 'mono:test', now: 100 })
      listeners.add(onMessage)
      return {
        unsubscribe: () => {
          listeners.delete(onMessage)
          unsubscribe()
        },
        setTracks,
      }
    },
  }
  return {
    source,
    backlog,
    unsubscribe,
    setTracks,
    push: (message: TraceFeedMessage) => listeners.forEach(listener => listener(message)),
  }
}

describe('useIOTracerStore', () => {
  let feed: ReturnType<typeof createFakeFeed>
  let stopFeed: () => void

  beforeEach(() => {
    record = createRecordStamper({ source: 'window:a', clock: 'mono:test' })
    feed = createFakeFeed()
    stopFeed = setTraceFeedSource(feed.source)
    setActivePinia(createPinia())
  })

  afterEach(() => {
    useIOTracerStore().stop()
    stopFeed()
  })

  it('reads the backlog and later records into the timeline', async () => {
    feed.backlog.push({ kind: 'record', record: record({ type: 'span.begin', ts: 10, track: 'agents/agent/llm', spanId: 's1', name: 'chat' }) })
    const store = useIOTracerStore()

    await store.start()
    feed.push({ kind: 'record', record: record({ type: 'span.end', ts: 40, track: 'agents/agent/llm', spanId: 's1', status: 'ok' }) })

    const span = store.timelineView().spans.get('window:a/e1/s1')
    expect(span?.start).toBe(10)
    expect(span?.end).toBe(40)
    expect(store.subscribed).toBe(true)
    await vi.waitFor(() => expect(store.version).toBe(store.reader.version))
  })

  it('estimates the trace clock from the caughtUp marker', async () => {
    const store = useIOTracerStore()
    expect(store.traceNow()).toBeUndefined()

    await store.start()

    expect(store.traceNow()).toBeGreaterThanOrEqual(100)
  })

  it('stops reading the feed and keeps what it read', async () => {
    const store = useIOTracerStore()
    await store.start()
    feed.push({ kind: 'record', record: record({ type: 'instant', ts: 1, track: 't', name: 'kept' }) })

    store.stop()
    feed.push({ kind: 'record', record: record({ type: 'instant', ts: 2, track: 't', name: 'dropped' }) })

    expect(feed.unsubscribe).toHaveBeenCalledOnce()
    expect(store.subscribed).toBe(false)
    expect(store.timelineView().tracks.get('t')?.instants.map(instant => instant.name)).toEqual(['kept'])
  })

  it('clears the projections and the selection', async () => {
    const store = useIOTracerStore()
    await store.start()
    feed.push({ kind: 'record', record: record({ type: 'instant', ts: 1, track: 't', name: 'old' }) })
    store.select({ kind: 'instant', key: 'window:a/e1/0' })

    store.clear()
    feed.push({ kind: 'record', record: record({ type: 'instant', ts: 2, track: 't', name: 'new' }) })

    expect(store.selection).toBeUndefined()
    expect(store.timelineView().tracks.get('t')?.instants.map(instant => instant.name)).toEqual(['new'])
  })

  it('reads the backlog again after a restart, without duplicates', async () => {
    feed.backlog.push({ kind: 'record', record: record({ type: 'instant', ts: 1, track: 't', name: 'once' }) })
    const store = useIOTracerStore()
    await store.start()
    store.stop()

    await store.start()

    expect(store.timelineView().tracks.get('t')?.instants).toHaveLength(1)
    expect(store.eventLogView().entries).toHaveLength(1)
  })

  it('passes the visible tracks to the feed', async () => {
    const store = useIOTracerStore()
    await store.start()

    store.setVisibleTracks(['participants/user/input'])

    expect(feed.setTracks).toHaveBeenCalledWith(['participants/user/input'])
  })
})
