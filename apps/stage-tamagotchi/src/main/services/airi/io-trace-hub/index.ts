import type { IOTraceHubState } from '@proj-airi/stage-shared/types/io-trace'
import type { TraceFeedMessage } from '@proj-airi/trace-kit'
import type { FlightRecorderDump, TraceCollectorOptions } from '@proj-airi/trace-kit/collector'

import { TraceCollector } from '@proj-airi/trace-kit/collector'

/** How often the hub runs collector upkeep: series compaction, eviction, heartbeats, and deadlines. */
const TICK_INTERVAL_MS = 1000

interface IOTraceHubOptions {
  getStoredCollecting: () => boolean
  setStoredCollecting: (collecting: boolean) => void
  /** The hub clock. It is the trace clock of every view. @default performance.now */
  now?: () => number
  collector?: Partial<TraceCollectorOptions>
}

/**
 * Receives the trace records of every renderer window in one place.
 *
 * The hub owns one {@link TraceCollector}. Each record goes to every subscriber, such as the disk recording and open
 * tracer windows. While collecting is on, the collector also keeps recent records, so a tracer window can show what
 * happened before it opened. While it is off, the collector keeps only the pinned set: live sources, open spans, and
 * definitions.
 *
 * Lifecycle: `start` begins the upkeep timer, and `dispose` stops it. Both are idempotent.
 */
export class IOTraceHub {
  readonly collector: TraceCollector
  private collecting: boolean
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly wantedListeners = new Set<(tracks: string[] | '*') => void>()
  private wanted: string[] | '*' = []
  private readonly flightDumpListeners = new Set<(dump: FlightRecorderDump) => void>()

  constructor(private readonly options: IOTraceHubOptions) {
    const now = options.now ?? (() => performance.now())
    this.collector = new TraceCollector({
      ...options.collector,
      now,
      flightRecorder: { onDump: dump => this.flightDumpListeners.forEach(listener => listener(dump)) },
      onWantedChange: (tracks) => {
        this.wanted = tracks === '*' ? '*' : [...tracks]
        for (const listener of this.wantedListeners)
          listener(this.wanted)
      },
    })
    this.collecting = options.getStoredCollecting()
    this.collector.setBuffering(this.collecting)
  }

  /** The value of the hub clock now. Windows pair it with their own clock. */
  now(): number {
    return (this.options.now ?? (() => performance.now()))()
  }

  start(): void {
    this.timer ??= setInterval(() => this.collector.tick(), TICK_INTERVAL_MS)
  }

  dispose(): void {
    if (this.timer)
      clearInterval(this.timer)
    this.timer = undefined
  }

  getState(): IOTraceHubState {
    const stats = this.collector.stats
    return {
      collecting: this.collecting,
      bufferedRecords: stats.bufferedRecords,
      bufferedBytes: stats.bufferedBytes,
      maxBytes: stats.maxBytes,
      maxAgeMs: stats.maxAgeMs,
      late: stats.late,
      dropped: stats.dropped,
    }
  }

  setCollecting(collecting: boolean): IOTraceHubState {
    this.collecting = collecting
    this.collector.setBuffering(collecting)
    this.options.setStoredCollecting(collecting)
    return this.getState()
  }

  /**
   * Validates and ingests records of a window. Returns the sources of the valid records, so the caller can map the
   * window to its source and report a lost source when the window closes.
   */
  ingest(records: readonly unknown[]): Set<string> {
    const sources = new Set<string>()
    for (const record of records) {
      if (this.collector.ingestUntrusted(record))
        sources.add((record as { source: string }).source)
    }
    return sources
  }

  /** A window closed or crashed. Its live epoch is lost unless it stopped first. */
  closeSource(source: string): void {
    this.collector.closeSource(source)
  }

  /** A clock ping counts as a heartbeat of its source. */
  touch(source: string): void {
    this.collector.touch(source)
  }

  /** The system resumed. The hub clock can stop or continue through sleep, so it writes a discontinuity. */
  markResume(): void {
    this.collector.record({ type: 'clock.discontinuity', ts: this.now(), of: this.collector.traceClock, reason: 'resume' })
  }

  /**
   * Adds a viewer. It receives the backlog first, then each later message. One call does both, so no record falls
   * between the backlog and the first live message.
   */
  subscribe(listener: (message: TraceFeedMessage) => void, tracks: string[] | '*'): { unsubscribe: () => void, setTracks: (tracks: string[] | '*') => void } {
    return this.collector.subscribe(listener, tracks)
  }

  /** Calls `listener` with the buffer around each failed or overdue span, also when recording is off. */
  onFlightDump(listener: (dump: FlightRecorderDump) => void): () => void {
    this.flightDumpListeners.add(listener)
    return () => this.flightDumpListeners.delete(listener)
  }

  /** The tracks that viewers show now. */
  get wantedTracks(): string[] | '*' {
    return this.wanted
  }

  /** Calls `listener` with the tracks that viewers show now, and on each change. */
  onWantedChange(listener: (tracks: string[] | '*') => void): () => void {
    this.wantedListeners.add(listener)
    listener(this.wanted)
    return () => this.wantedListeners.delete(listener)
  }
}
