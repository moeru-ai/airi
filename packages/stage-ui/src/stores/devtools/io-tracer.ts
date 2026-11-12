import type { TraceFeedMessage, TraceRecord } from '@proj-airi/trace-kit'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'

import { errorMessageFrom } from '@moeru/std'
import { createTraceViewReader } from '@proj-airi/trace-kit/views'
import { defineStore } from 'pinia'
import { markRaw, shallowRef } from 'vue'

import { getTraceFeedSource } from '../../composables/use-trace'
import { seriesAsSampleChunks } from './io-tracer-export'

/**
 * Views read the projections at most this often. Records can arrive at hundreds per second, and each view update
 * walks the visible lanes.
 */
const VIEW_UPDATE_INTERVAL_MS = 50

/**
 * The tracer view state: one reader of the collector feed and its projections.
 *
 * State model:
 * - `reader` holds the projections in plain objects. It is not reactive.
 * - `version` changes at most every {@link VIEW_UPDATE_INTERVAL_MS} after records arrive. Views read the projections
 *   through computed values keyed on it.
 * - `subscribed` is true while the store reads the feed. `start` subscribes. `stop` unsubscribes, keeps the state, and
 *   holds `traceNow` at the time it paused.
 * - `clear` resets the projections. Records that arrive later still show.
 */
export const useIOTracerStore = defineStore('devtools:io-tracer', () => {
  const feed = getTraceFeedSource()
  const { reader: plainReader, timelineView, eventLogView, metricSamples } = createTraceViewReader(feed.traceClock)
  const reader = markRaw(plainReader)

  const version = shallowRef(0)
  const subscribed = shallowRef(false)
  const error = shallowRef<string>()
  const selection = shallowRef<TraceItemRef>()

  let subscription: { unsubscribe: () => void, setTracks: (tracks: string[] | '*') => void } | undefined
  /**
   * A trace clock value and the local clock when it arrived. The view runs its live clock from it.
   * Live records and `caughtUp` update it. Backlog records are old, so they do not.
   */
  let clockAnchor: { trace: number, local: number } | undefined
  /** The trace clock when the view paused. A paused view holds its now there, so the now line stops. */
  let pausedAt: number | undefined
  let session = 0
  let pendingUpdate: ReturnType<typeof setTimeout> | undefined

  function scheduleUpdate() {
    pendingUpdate ??= setTimeout(() => {
      pendingUpdate = undefined
      version.value = reader.version
    }, VIEW_UPDATE_INTERVAL_MS)
  }

  function handle(message: TraceFeedMessage) {
    reader.handle(message)
    if (message.kind === 'caughtUp' && message.now !== undefined)
      clockAnchor = { trace: message.now, local: performance.now() }
    else if (message.kind === 'record' && reader.caughtUp && message.record.observedTs !== undefined)
      clockAnchor = { trace: message.record.observedTs, local: performance.now() }
    scheduleUpdate()
  }

  /** An estimate of the trace clock now. Undefined until the feed caught up. A paused view returns the time it paused. */
  function traceNow(): number | undefined {
    if (!subscribed.value && pausedAt !== undefined)
      return pausedAt
    return clockAnchor ? clockAnchor.trace + (performance.now() - clockAnchor.local) : undefined
  }

  /** Subscribes to the collector feed. The backlog arrives first. A second call while subscribed does nothing. */
  async function start() {
    if (subscribed.value)
      return
    subscribed.value = true
    pausedAt = undefined
    error.value = undefined
    const current = ++session
    // A new subscription sends the backlog again, so the projections start empty.
    reader.reset()
    try {
      const next = await feed.subscribe((message) => {
        if (current === session)
          handle(message)
      }, '*')
      // `stop` ran while the subscription started. Drop the late subscription.
      if (current !== session) {
        next.unsubscribe()
        return
      }
      subscription = next
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to read traces'
      subscribed.value = false
    }
  }

  function stop() {
    pausedAt = traceNow()
    session++
    subscription?.unsubscribe()
    subscription = undefined
    subscribed.value = false
  }

  function clear() {
    reader.reset()
    // A cleared view still runs its clock. The next records start a fresh timeline.
    reader.caughtUp = true
    selection.value = undefined
    version.value = reader.version
  }

  /** Tells the collector the track paths that the view shows, so producers skip costly series of other tracks. */
  function setVisibleTracks(tracks: string[] | '*') {
    subscription?.setTracks(tracks)
  }

  function select(next: TraceItemRef | undefined) {
    selection.value = next
  }

  /**
   * The records of the event log and the series of the timeline as JSON lines. The event log has no samples, so the
   * series follow as chunks on the trace clock. The record format makes the file readable later.
   */
  function recordsAsJsonLines(): string {
    const records: TraceRecord[] = [
      ...eventLogView().entries.map(entry => entry.record),
      ...seriesAsSampleChunks(timelineView().tracks.values(), feed.traceClock, crypto.randomUUID()),
    ]
    return records.map(record => JSON.stringify(record)).join('\n')
  }

  function saveRecords() {
    const text = recordsAsJsonLines()
    if (!text)
      return
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'application/jsonl' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `trace-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return {
    reader,
    traceClock: feed.traceClock,
    version,
    subscribed,
    error,
    selection,
    start,
    stop,
    clear,
    select,
    setVisibleTracks,
    saveRecords,
    traceNow,
    timelineView,
    eventLogView,
    metricSamples,
  }
})
