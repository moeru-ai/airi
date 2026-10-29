import type { TraceRecord } from '../core/types'
import type { TraceProjection } from './reader'

import { recordKey } from '../core/types'

export interface EventLogEntry {
  key: string
  time: number
  record: TraceRecord
  late?: boolean
  pinned?: boolean
  estimated?: boolean
}

export interface EventLogState {
  entries: EventLogEntry[]
  /** Keys of the entries, so a pinned copy and its buffered copy show once. */
  keys: Set<string>
  /** Entries that the limit dropped. */
  dropped: number
}

/**
 * A list of records in apply order, with their converted time. The viewer filters it.
 *
 * Series records are left out, because they are many and the timeline draws them.
 */
export function createEventLogProjection(options?: {
  /** @default 20000 */
  limit?: number
}): TraceProjection<EventLogState> {
  const limit = options?.limit ?? 20_000
  return {
    key: 'event-log',
    reset: () => ({ entries: [], keys: new Set(), dropped: 0 }),
    handleRecord(state, record, context) {
      if (record.type === 'sample' || record.type === 'sample.chunk')
        return state
      const key = recordKey(record)
      if (state.keys.has(key))
        return state
      state.keys.add(key)
      state.entries.push({
        key,
        time: context.time,
        record,
        ...(context.late ? { late: true } : {}),
        ...(context.pinned ? { pinned: true } : {}),
        ...(context.estimated ? { estimated: true } : {}),
      })
      if (state.entries.length > limit) {
        const removed = state.entries.splice(0, state.entries.length - limit)
        for (const entry of removed)
          state.keys.delete(entry.key)
        state.dropped += removed.length
      }
      return state
    },
    select: state => state,
  }
}
