import type { IOTraceHubState, SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

export const IO_TRACE_HUB_MAX_SPANS = 5000
export const IO_TRACE_HUB_MAX_AGE_MS = 30 * 60 * 1000

interface IOTraceHubOptions {
  getStoredCollecting: () => boolean
  setStoredCollecting: (collecting: boolean) => void
  maxSpans?: number
  maxAgeMs?: number
  /** Epoch milliseconds. */
  now?: () => number
}

type SpanListener = (span: SerializedIOSpan) => void

function endTimeMs(span: SerializedIOSpan): number {
  return Number(span.endTimeNano) / 1e6
}

/**
 * Receives the IO spans of every renderer window in one place.
 *
 * Each span goes to every listener, such as the disk recording and open tracer windows.
 * While collecting is on, the hub also keeps recent spans, so a tracer window can show what happened before it opened.
 */
export class IOTraceHub {
  private readonly listeners = new Set<SpanListener>()
  private readonly maxSpans: number
  private readonly maxAgeMs: number
  private readonly now: () => number
  private spans: SerializedIOSpan[] = []
  private collecting: boolean

  constructor(private readonly options: IOTraceHubOptions) {
    this.maxSpans = options.maxSpans ?? IO_TRACE_HUB_MAX_SPANS
    this.maxAgeMs = options.maxAgeMs ?? IO_TRACE_HUB_MAX_AGE_MS
    this.now = options.now ?? Date.now
    this.collecting = options.getStoredCollecting()
  }

  getState(): IOTraceHubState {
    this.prune()
    return {
      collecting: this.collecting,
      bufferedSpans: this.spans.length,
      maxSpans: this.maxSpans,
      maxAgeMs: this.maxAgeMs,
    }
  }

  setCollecting(collecting: boolean): IOTraceHubState {
    this.collecting = collecting
    if (!collecting)
      this.spans = []
    this.options.setStoredCollecting(collecting)
    return this.getState()
  }

  publish(span: SerializedIOSpan): void {
    if (!span.ended)
      return

    if (this.collecting) {
      this.spans.push(span)
      this.prune()
    }

    for (const listener of this.listeners)
      listener(span)
  }

  /**
   * Returns the kept spans and adds `listener` for each later span.
   *
   * One call does both, so no span ends between the copy and the first call of `listener`.
   */
  subscribe(listener: SpanListener): { spans: SerializedIOSpan[], unsubscribe: () => void } {
    this.prune()
    this.listeners.add(listener)
    return {
      spans: [...this.spans],
      unsubscribe: () => this.listeners.delete(listener),
    }
  }

  private prune(): void {
    const cutoff = this.now() - this.maxAgeMs
    // Spans arrive at about the time that they end, so the spans with the oldest ends are at the front.
    let first = 0
    while (first < this.spans.length && endTimeMs(this.spans[first]!) < cutoff)
      first++
    first = Math.max(first, this.spans.length - this.maxSpans)
    if (first > 0)
      this.spans = this.spans.slice(first)
  }
}
