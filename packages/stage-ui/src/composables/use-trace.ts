import type { TraceFeedSource, TraceProfileDefinition, TraceRecord, TraceSink, TraceSpan } from '@proj-airi/trace-kit'

import { errorMessageFrom } from '@moeru/std'
import { TraceSource } from '@proj-airi/trace-kit'
import { agentProfile } from '@proj-airi/trace-kit/agent'
import { TraceCollector } from '@proj-airi/trace-kit/collector'
import { voiceProfile } from '@proj-airi/trace-kit/voice'
import { shallowRef } from 'vue'

import * as v from 'valibot'

/**
 * The channel that carries the records of every tab of one origin.
 * Tests of stage-web read it too, so they see the records of the page.
 */
export const TRACE_BROADCAST_CHANNEL = 'airi-trace'

/** Snapshots of the tab clock against the wall clock. Tabs of one origin share no monotonic clock. */
const LOCAL_SNAPSHOT_INTERVAL_MS = 15_000

/** The collector compacts series, evicts old records, and checks deadlines on each tick. */
const COLLECTOR_TICK_MS = 1000

/** Profiles that every source of the app announces. */
const APP_PROFILES: TraceProfileDefinition[] = [voiceProfile, agentProfile]

/**
 * Where the source of this runtime sends its records.
 *
 * Tamagotchi sets a transport to the hub in the main process. Without one, the runtime keeps a local collector, which
 * receives the records of this tab and of the other tabs of the origin.
 */
export interface TraceTransport {
  /** A placeholder ID. The collector of the host can replace it, for example with the ID of the window. */
  source: string
  /** The monotonic clock key of this runtime. A reload starts a new clock, so the key names the run. */
  clock: string
  runtime: string
  send: (record: TraceRecord) => void
  /** Extra attributes of `source.started`, for example the route of the window. */
  attrs?: Record<string, string>
}

interface LocalRuntime {
  collector: TraceCollector
  channel?: BroadcastChannel
  wanted: SharedWantedTracks
}

/** How often a tab repeats the tracks that its viewers want. */
const WANTED_ANNOUNCE_MS = 5000
/** Another tab that did not repeat its wanted tracks for this long is gone, for example after a crash. */
const WANTED_EXPIRE_MS = 12_000

type WantedTracks = ReadonlySet<string> | '*'

const WantedMessageSchema = v.union([
  v.object({ type: v.literal('wanted'), tab: v.string(), tracks: v.union([v.literal('*'), v.array(v.string())]) }),
  v.object({ type: v.literal('wanted-query') }),
])

/**
 * The tracks that the viewers of every tab of the origin want.
 *
 * Each tab has its own collector, so a viewer in one tab subscribes only there. A producer in another tab would skip
 * its costly series, for example the playback level, while the viewer waits for them. So each tab announces the tracks
 * of its own viewers on the trace channel, and the source of each tab wants the union of all tabs.
 *
 * A tab repeats its announcement every {@link WANTED_ANNOUNCE_MS}, and another tab drops it after
 * {@link WANTED_EXPIRE_MS} without a repeat. A tab announces nothing when it hides, and a new tab asks the others.
 */
export class SharedWantedTracks {
  private own: WantedTracks = new Set()
  private readonly others = new Map<string, { tracks: WantedTracks, at: number }>()
  private sinceAnnounceMs = 0

  constructor(
    private readonly tab: string,
    private readonly channel: BroadcastChannel | undefined,
    private readonly apply: (tracks: WantedTracks) => void,
  ) {
    channel?.postMessage({ type: 'wanted-query' })
  }

  /** The union of the tracks that the viewers of every tab want. */
  get current(): WantedTracks {
    const all = [this.own, ...[...this.others.values()].map(entry => entry.tracks)]
    if (all.includes('*'))
      return '*'
    return new Set(all.flatMap(tracks => [...tracks as ReadonlySet<string>]))
  }

  setOwn(tracks: WantedTracks) {
    this.own = tracks
    this.announce()
    this.apply(this.current)
  }

  /** Handles a message of the trace channel. Returns false for a message of another kind. */
  receive(data: unknown, now: number): boolean {
    const result = v.safeParse(WantedMessageSchema, data)
    if (!result.success)
      return false
    const message = result.output
    if (message.type === 'wanted-query') {
      this.announce()
      return true
    }
    if (message.tracks.length === 0)
      this.others.delete(message.tab)
    else
      this.others.set(message.tab, { tracks: message.tracks === '*' ? '*' : new Set(message.tracks), at: now })
    this.apply(this.current)
    return true
  }

  /** Repeats the announcement and drops the tabs that went silent. */
  tick(now: number, elapsedMs: number) {
    this.sinceAnnounceMs += elapsedMs
    if (this.sinceAnnounceMs >= WANTED_ANNOUNCE_MS) {
      this.sinceAnnounceMs = 0
      if (this.own === '*' || this.own.size > 0)
        this.announce()
    }
    let dropped = false
    for (const [tab, entry] of this.others) {
      if (now - entry.at > WANTED_EXPIRE_MS) {
        this.others.delete(tab)
        dropped = true
      }
    }
    if (dropped)
      this.apply(this.current)
  }

  /** Tells the other tabs that this tab wants nothing, for example when it unloads. */
  leave() {
    this.channel?.postMessage({ type: 'wanted', tab: this.tab, tracks: [] })
  }

  private announce() {
    this.channel?.postMessage({ type: 'wanted', tab: this.tab, tracks: this.own === '*' ? '*' : [...this.own] })
  }
}

let transport: TraceTransport | undefined
let source: TraceSource | undefined
let local: LocalRuntime | undefined
let feedSource: TraceFeedSource | undefined

/**
 * The actor ID of the chat agent of this app in the agent and voice profiles.
 * The app runs one agent at a time, so its tracks share this ID. The character ID goes in `gen_ai.agent.id`.
 */
export const LOCAL_AGENT_ACTOR = 'agent'

/**
 * The open voice input of the voice host: its ID and its chat session.
 * Speech recognition, end-of-turn judgements, and the rephrase of that input carry its ID.
 * The voice host sets it when an input starts and clears it when the input settles. The microphone has one input at a time.
 */
export const activeVoiceInput = shallowRef<{ inputId: string, sessionId: string } | undefined>()

/**
 * Sets the transport of this runtime. A source that already exists stops, and the next record starts a new epoch on
 * the new transport. Returns a function that removes the transport.
 */
export function configureTraceTransport(next: TraceTransport): () => void {
  source?.stop()
  source = undefined
  transport = next
  return () => {
    if (transport !== next)
      return
    source?.stop()
    source = undefined
    transport = undefined
  }
}

/**
 * The sink of this runtime. Producers write to it.
 *
 * It is created at the first use. Without a transport, it also starts the local collector of the tab.
 */
export function getTraceSink(): TraceSink {
  return getTraceSource()
}

/** The source of this runtime, for `wants` updates and clock records. */
export function getTraceSource(): TraceSource {
  if (source)
    return source

  if (transport) {
    const send = transport.send
    const channel = openChannel()
    source = new TraceSource({
      ...transport,
      profiles: APP_PROFILES,
      // Tests of the page read the channel in both hosts, so the records also go there.
      send: (record) => {
        send(record)
        channel?.postMessage({ type: 'record', record })
      },
    })
    return source
  }

  const runtime = startLocalRuntime()
  const tabClock = runtime.collector.traceClock
  source = new TraceSource({
    source: `tab:${tabClock.slice('mono:tab:'.length)}`,
    clock: tabClock,
    runtime: 'browser',
    profiles: APP_PROFILES,
    send: (record) => {
      runtime.collector.ingest(record)
      runtime.channel?.postMessage({ type: 'record', record })
    },
  })
  // Other tabs can have answered before this source existed.
  source.setWanted(runtime.wanted.current)
  return source
}

let broadcast: BroadcastChannel | undefined

/** The channel of this page. One instance for each page, so a page does not receive its own records. */
function openChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined')
    return undefined
  broadcast ??= new BroadcastChannel(TRACE_BROADCAST_CHANNEL)
  return broadcast
}

/** Sets the feed that tracer views read, until the returned function runs. */
export function setTraceFeedSource(next: TraceFeedSource): () => void {
  feedSource = next
  return () => {
    if (feedSource === next)
      feedSource = undefined
  }
}

/** The feed of the host collector, or the feed of the local collector of this tab. */
export function getTraceFeedSource(): TraceFeedSource {
  if (feedSource)
    return feedSource

  getTraceSource()
  const runtime = startLocalRuntime()
  return {
    traceClock: runtime.collector.traceClock,
    subscribe: async (onMessage, tracks) => {
      const subscription = runtime.collector.subscribe(onMessage, tracks)
      return { unsubscribe: subscription.unsubscribe, setTracks: subscription.setTracks }
    },
  }
}

/**
 * Starts the local collector of this tab.
 *
 * The collector clock is the monotonic clock of the tab. Each tab writes snapshots of its clock against the wall clock,
 * so the records of other tabs convert through the wall clock. That has the precision of the wall clock only.
 *
 * Lifecycle: one runtime for each page. It runs until the page unloads.
 */
function startLocalRuntime(): LocalRuntime {
  if (local)
    return local

  const tabClock = `mono:tab:${crypto.randomUUID().slice(0, 8)}`
  const channel = openChannel()
  // The producers of this tab also serve the viewers of other tabs.
  const wanted = new SharedWantedTracks(tabClock, channel, tracks => source?.setWanted(tracks))
  const collector = new TraceCollector({
    clock: tabClock,
    now: () => performance.now(),
    onWantedChange: tracks => wanted.setOwn(tracks),
  })

  channel?.addEventListener('message', (event: MessageEvent) => {
    // Records of other tabs cross a trust boundary only in name, but the schema check keeps a bad tab from breaking
    // the views of this tab.
    if (event.data?.type === 'record')
      collector.ingestUntrusted(event.data.record)
    else
      wanted.receive(event.data, performance.now())
  })
  globalThis.addEventListener?.('pagehide', () => wanted.leave())

  const snapshot = () => {
    const now = performance.now()
    source?.emit({ type: 'clock.snapshot', ts: now, values: [{ clock: tabClock, value: now }, { clock: 'wall:browser', value: performance.timeOrigin + now }], uncertaintyMs: 1 })
  }
  let sinceSnapshotMs = 0
  setInterval(() => {
    collector.tick()
    wanted.tick(performance.now(), COLLECTOR_TICK_MS)
    sinceSnapshotMs += COLLECTOR_TICK_MS
    if (sinceSnapshotMs >= LOCAL_SNAPSHOT_INTERVAL_MS) {
      sinceSnapshotMs = 0
      snapshot()
    }
  }, COLLECTOR_TICK_MS)
  // The source is created right after this runtime. Its first snapshot follows its `source.started`.
  queueMicrotask(snapshot)

  local = { collector, channel, wanted }
  return local
}

/**
 * Runs `work` and ends `span` when it settles.
 *
 * A rejection after `signal` aborted is a cancellation that the caller chose, so the span ends `cancelled`. Any other
 * rejection ends it with `error`. The rejection still reaches the caller.
 */
export async function runInTraceSpan<T>(span: TraceSpan, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  try {
    const result = await work()
    span.end()
    return result
  }
  catch (error) {
    if (signal.aborted)
      span.end({ status: 'cancelled', reason: 'aborted' })
    else
      span.end({ status: 'error', message: errorMessageFrom(error) ?? 'Operation failed' })
    throw error
  }
}
