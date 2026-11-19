import type { TraceFeedMessage, TraceFeedSource, TraceRecord } from '@proj-airi/trace-kit'

import { definitionRecordsOf } from '@proj-airi/trace-kit'
import { agentProfile } from '@proj-airi/trace-kit/agent'
import { createRecordStamper, VOICE_TURN, voiceTurnRecords } from '@proj-airi/trace-kit/testing'
import { createTraceViewReader } from '@proj-airi/trace-kit/views'
import { voiceProfile } from '@proj-airi/trace-kit/voice'

/** The clock of the story trace. The fixture times are on it. */
export const STORY_TRACE_CLOCK = 'mono:collector'

/** The records of the voice turn fixture, with the definitions of the app profiles first. */
export function storyTraceRecords(): TraceRecord[] {
  const stamp = createRecordStamper({ clock: STORY_TRACE_CLOCK })
  return [
    ...definitionRecordsOf(voiceProfile, 0),
    ...definitionRecordsOf(agentProfile, 0),
    ...voiceTurnRecords(),
  ].map(stamp)
}

/**
 * The voice turn fixture, read by the projections of the IO tracer, at the end of the turn. The fixture is a fixed
 * trace, like a file replay, so the reader keeps every sample.
 */
export function readStoryTrace() {
  const trace = createTraceViewReader(STORY_TRACE_CLOCK, { seriesRetention: false })
  trace.reader.handleRecords(storyTraceRecords())
  return {
    state: trace.timelineView(),
    indexes: trace.reader.indexes,
    eventLog: trace.eventLogView(),
    samples: trace.metricSamples(),
    now: VOICE_TURN.end,
  }
}

/** A feed that serves the voice turn fixture as its backlog, so the IO tracer store reads it like a live collector. */
export function storyTraceFeed(): TraceFeedSource {
  return {
    traceClock: STORY_TRACE_CLOCK,
    subscribe: async (onMessage: (message: TraceFeedMessage) => void) => {
      for (const record of storyTraceRecords())
        onMessage({ kind: 'record', record })
      onMessage({ kind: 'caughtUp', cursor: {}, traceClock: STORY_TRACE_CLOCK, now: VOICE_TURN.end })
      return { unsubscribe: () => {}, setTracks: () => {} }
    },
  }
}
