import type { TraceRecord } from './types'

/**
 * One message of a collector feed to a viewer.
 *
 * A subscription first sends the pinned set (`pinned: true`), the gaps, the buffered records, and the series rings.
 * Then it sends `caughtUp`, and after that each later record.
 * `gap` and `caughtUp` are feed markers, not trace records. The disk recording does not write them.
 */
export type TraceFeedMessage
  = | {
    kind: 'record'
    record: TraceRecord
    /** The record came from the pinned set, which stays outside the buffer limits. */
    pinned?: boolean
    /** The record arrived after the watermark of its source. It changes the view with a `late` mark. */
    late?: boolean
  }
  /** The buffer evicted records in this range of the trace clock. */
  | { kind: 'gap', from: number, to: number }
  /** The kept points of one series, on the trace clock. Old points are reduced to the min and max of each second. */
  | { kind: 'series', source: string, track: string, key: string, times: number[], values: number[] }
  /**
   * The end of the backlog. `cursor` has the last `seq` of each `source/epoch`. `now` is the trace clock at that moment,
   * so a viewer can run a live clock before the next record arrives.
   */
  | { kind: 'caughtUp', cursor: Record<string, number>, traceClock: string, now?: number }

/**
 * A collector feed that a tracer view reads.
 *
 * The host sets one: a local collector, a hub in another process, or a fixture in a story. The view store subscribes
 * to it and gives each message to its reader.
 */
export interface TraceFeedSource {
  /** The clock that the collector converts every value to. A reader converts to the same clock. */
  traceClock: string
  /**
   * Calls `onMessage` with the backlog and then with each later message.
   * `tracks` are the track paths that the view shows, so producers can skip costly series of other tracks.
   */
  subscribe: (onMessage: (message: TraceFeedMessage) => void, tracks: string[] | '*') => Promise<{ unsubscribe: () => void, setTracks: (tracks: string[] | '*') => void }>
}
