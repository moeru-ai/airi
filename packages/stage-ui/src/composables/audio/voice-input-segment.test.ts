import { describe, expect, it } from 'vitest'

import {
  createVoiceInputRecordingSegment,
  resolveActiveVoiceInputRecordingSegmentAfterStop,
} from './voice-input-segment'

describe('voice input recording segment tracking', () => {
  it('does not clear a newer active segment when an older segment finishes stopping', () => {
    const stoppedSegment = createVoiceInputRecordingSegment(1, 'volume')
    const newerActiveSegment = createVoiceInputRecordingSegment(2, 'vad')

    expect(resolveActiveVoiceInputRecordingSegmentAfterStop(newerActiveSegment, stoppedSegment))
      .toBe(newerActiveSegment)
  })

  it('clears the active segment when the stopped segment is still current', () => {
    const stoppedSegment = createVoiceInputRecordingSegment(1, 'manual')

    expect(resolveActiveVoiceInputRecordingSegmentAfterStop(stoppedSegment, stoppedSegment))
      .toBeUndefined()
  })
})
