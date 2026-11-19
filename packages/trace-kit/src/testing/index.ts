import type { TraceProfileDefinition } from '../core/definitions'
import type { TraceRecord, TraceRecordInput } from '../core/types'
import type { TimelineState } from '../projections'

import { definitionRecordsOf } from '../core/define'
import { createTimelineProjection, TraceReader } from '../projections'

/**
 * Helpers for tests and stories that need trace records. Production code must not import this module.
 */

export interface RecordStamperOptions {
  /** @default 'window:main' */
  source?: string
  /** @default 'e1' */
  epoch?: string
  /** The clock of an input without its own clock. @default 'mono:collector' */
  clock?: string
}

/**
 * Returns a function that completes record inputs as the records of one source epoch, with `seq` from 0.
 *
 * @example
 * const stamp = createRecordStamper({ source: 'tab:a' })
 * stamp({ type: 'span.begin', ts: 0, track: 'agents/agent/llm', spanId: 's', name: 'chat' })
 * // => { clock: 'mono:collector', type: 'span.begin', ..., source: 'tab:a', epoch: 'e1', seq: 0 }
 */
export function createRecordStamper(options: RecordStamperOptions = {}): (input: TraceRecordInput) => TraceRecord {
  const { source = 'window:main', epoch = 'e1', clock = 'mono:collector' } = options
  let seq = 0
  return input => ({ clock, ...input, source, epoch, seq: seq++ })
}

export interface ReadTimelineOptions extends RecordStamperOptions {
  /** Profiles whose definitions come before the inputs, so tracks have their definitions. @default [] */
  profiles?: TraceProfileDefinition[]
}

/**
 * Reads record inputs into the timeline state that a viewer sees, with the definitions of `profiles` first.
 *
 * @example
 * const { state } = readTimeline([{ type: 'span.begin', ts: 0, track: 'agents/agent/llm', spanId: 's', name: 'chat' }], { profiles: [agentProfile] })
 * state.spans.size
 * // => 1
 */
export function readTimeline(inputs: TraceRecordInput[], options: ReadTimelineOptions = {}): { state: TimelineState, indexes: TraceReader['indexes'], records: TraceRecord[] } {
  const stamp = createRecordStamper(options)
  const records = [
    ...(options.profiles ?? []).flatMap(profile => definitionRecordsOf(profile, 0)),
    ...inputs,
  ].map(stamp)
  const timeline = createTimelineProjection()
  const reader = new TraceReader([timeline], options.clock ?? 'mono:collector')
  reader.handleRecords(records)
  return { state: reader.view(timeline), indexes: reader.indexes, records }
}

export { LONG_LEADING_SILENCE, VOICE_TURN, voiceTurnRecords } from './voice-turn'
