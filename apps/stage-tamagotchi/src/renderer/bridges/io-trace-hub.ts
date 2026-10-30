import type { EventContext } from '@moeru/eventa'
import type { TraceFeedMessage, TraceRecord } from '@proj-airi/trace-kit'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { configureTraceTransport, getTraceSource, setTraceFeedSource } from '@proj-airi/stage-ui/composables/use-trace'
import { measureClockOffset } from '@proj-airi/trace-kit'

import {
  ioTraceHubEmit,
  ioTraceHubFeed,
  ioTraceHubPing,
  ioTraceHubResync,
  ioTraceHubSetTracks,
  ioTraceHubSubscribe,
  ioTraceHubUnsubscribe,
  ioTraceHubWanted,
} from '../../shared/eventa'

const log = useLogg('electron:io-trace-hub').useGlobalConfig()

/** Records of this window go to the hub in batches. A batch waits at most this long. */
const EMIT_BATCH_MS = 16

/** The window measures its clock against the hub clock this often. A ping also counts as a heartbeat. */
const CLOCK_PING_INTERVAL_MS = 15_000

/** The key in session storage that keeps the source ID of this window across reloads. */
const SOURCE_ID_KEY = 'airi:trace-source-id'

/** The hub clock. Every view converts to it. */
const HUB_CLOCK = 'mono:collector'

/**
 * Returns the trace source ID of this window.
 *
 * Session storage survives a reload of the same window and is separate for each window, so a reload keeps the source
 * and starts a new epoch, and two windows never share a source.
 */
function windowSourceId(): string {
  try {
    const stored = sessionStorage.getItem(SOURCE_ID_KEY)
    if (stored)
      return stored
    const created = `window:${crypto.randomUUID().slice(0, 8)}`
    sessionStorage.setItem(SOURCE_ID_KEY, created)
    return created
  }
  catch {
    // NOTICE:
    // Session storage throws in a sandboxed or opaque origin. A random ID works, but a reload looks like a new source.
    // Root cause: the HTML Web Storage spec throws SecurityError for an opaque origin.
    // Source: https://html.spec.whatwg.org/multipage/webstorage.html
    // Removal condition: the main process assigns window source IDs.
    return `window:${crypto.randomUUID().slice(0, 8)}`
  }
}

/**
 * Connects the trace source of this window to the trace hub in the main process.
 *
 * - Records of this window go to the hub in batches.
 * - The window pings the hub at start, every {@link CLOCK_PING_INTERVAL_MS}, when it becomes visible, and after a
 *   system resume. Each ping writes a clock snapshot that pairs the window clock with the hub clock.
 * - Tracer views of this window read the hub feed, so they show the records of every window, and the records that the
 *   hub kept before the view opened.
 *
 * Returns a function that stops the bridge. It writes `source.stopped` and removes the timers and listeners.
 */
export function initializeIOTraceHubBridge(context: EventContext<any, any>): () => void {
  const emit = defineInvoke(context, ioTraceHubEmit)
  const ping = defineInvoke(context, ioTraceHubPing)
  const subscribe = defineInvoke(context, ioTraceHubSubscribe)
  const setTracks = defineInvoke(context, ioTraceHubSetTracks)
  const unsubscribe = defineInvoke(context, ioTraceHubUnsubscribe)

  const sourceId = windowSourceId()
  // Each page load has its own time origin, so the clock key names the load.
  const clock = `mono:${sourceId}:${crypto.randomUUID().slice(0, 8)}`

  let batch: TraceRecord[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  function flush() {
    flushTimer = undefined
    const records = batch
    batch = []
    if (records.length > 0)
      void emit({ records }).catch(error => log.withError(error).error('Failed to send trace records'))
  }

  const stopTransport = configureTraceTransport({
    source: sourceId,
    clock,
    runtime: 'electron-renderer',
    attrs: { route: globalThis.location?.hash ?? '' },
    send: (record) => {
      batch.push(record)
      flushTimer ??= setTimeout(flush, EMIT_BATCH_MS)
    },
  })

  async function measureClock() {
    const sample = await measureClockOffset({ ping: () => ping(), now: () => performance.now() })
    if (!sample)
      return
    getTraceSource().emit({
      type: 'clock.snapshot',
      ts: sample.local,
      values: [{ clock, value: sample.local }, { clock: HUB_CLOCK, value: sample.remote }],
      uncertaintyMs: sample.uncertaintyMs,
    })
  }

  const measure = () => void measureClock().catch(error => log.withError(error).warn('Failed to measure the trace clock'))
  measure()
  const pingTimer = setInterval(measure, CLOCK_PING_INTERVAL_MS)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible')
      measure()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  const stopWanted = context.on(ioTraceHubWanted, (event) => {
    if (event.body)
      getTraceSource().setWanted(event.body.tracks)
  })
  const stopResync = context.on(ioTraceHubResync, () => {
    // A monotonic clock can stop or continue through sleep. Earlier snapshots do not hold for later values.
    getTraceSource().emit({ type: 'clock.discontinuity', ts: performance.now(), of: clock, reason: 'resume' })
    measure()
  })

  const stopFeedSource = setTraceFeedSource({
    traceClock: HUB_CLOCK,
    subscribe: async (onMessage, tracks) => {
      // Live batches can arrive before the backlog is applied. Hold them until then. The reader drops duplicates.
      let pending: TraceFeedMessage[] | undefined = []
      const stopFeed = context.on(ioTraceHubFeed, (event) => {
        for (const message of event.body ?? []) {
          if (pending)
            pending.push(message)
          else
            onMessage(message)
        }
      })
      try {
        const backlog = await subscribe({ tracks })
        for (const message of backlog?.messages ?? [])
          onMessage(message)
        const held = pending
        pending = undefined
        for (const message of held)
          onMessage(message)
        return {
          unsubscribe: () => {
            stopFeed()
            void unsubscribe().catch(error => log.withError(error).error('Failed to unsubscribe from the trace hub'))
          },
          setTracks: next => void setTracks({ tracks: next }).catch(error => log.withError(error).error('Failed to set trace tracks')),
        }
      }
      catch (error) {
        stopFeed()
        throw error
      }
    },
  })

  return () => {
    clearInterval(pingTimer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    stopWanted()
    stopResync()
    stopFeedSource()
    stopTransport()
    flush()
  }
}
