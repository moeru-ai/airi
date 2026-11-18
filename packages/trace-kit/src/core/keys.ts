import type { TraceRef } from './types'

/**
 * Key of one epoch of a source: `source/epoch`. The cursor of `caughtUp` uses it. A source and an epoch do not
 * contain `/`, so the key is unambiguous.
 */
export function epochKeyOf(source: string, epoch: string): string {
  return `${source}/${epoch}`
}

/** Stable key of a record: `source/epoch/seq`. */
export function recordKey(ref: TraceRef): string {
  return `${ref.source}/${ref.epoch}/${ref.seq}`
}

/**
 * Stable key of a span: `source/epoch/spanId`. A span ID is unique only inside one epoch of one source.
 *
 * @example
 * spanKeyOf('window:main', 'e1', 'llm-1')
 * // => 'window:main/e1/llm-1'
 */
export function spanKeyOf(source: string, epoch: string, spanId: string): string {
  return `${source}/${epoch}/${spanId}`
}

/**
 * The clock of a media stream. Its values are frame positions, and its snapshots pair them with a monotonic clock.
 *
 * @example
 * streamClockOf('capture:mic')
 * // => 'audio:capture:mic'
 */
export function streamClockOf(streamId: string): string {
  return `audio:${streamId}`
}
