export type VoiceInputSessionTrigger = 'manual' | 'vad' | 'volume'

export interface VoiceInputRecordingSegment {
  id: number
  trigger: VoiceInputSessionTrigger
  metadata?: Record<string, unknown>
}

export function createVoiceInputRecordingSegment(id: number, trigger: VoiceInputSessionTrigger, metadata?: Record<string, unknown>): VoiceInputRecordingSegment {
  return { id, trigger, ...(metadata ? { metadata } : {}) }
}

function isSameVoiceInputRecordingSegment(
  left: VoiceInputRecordingSegment | undefined,
  right: VoiceInputRecordingSegment | undefined,
) {
  return !!left && !!right && left.id === right.id
}

export function resolveActiveVoiceInputRecordingSegmentAfterStop(
  activeSegment: VoiceInputRecordingSegment | undefined,
  stoppedSegment: VoiceInputRecordingSegment | undefined,
) {
  return isSameVoiceInputRecordingSegment(activeSegment, stoppedSegment)
    ? undefined
    : activeSegment
}
