export interface VoiceInputRecordingSegment {
  id: number
  trigger: VoiceInputSessionTrigger
}

export type VoiceInputSessionTrigger = 'manual' | 'vad' | 'volume'

export function createVoiceInputRecordingSegment(id: number, trigger: VoiceInputSessionTrigger): VoiceInputRecordingSegment {
  return { id, trigger }
}

export function resolveActiveVoiceInputRecordingSegmentAfterStop(
  activeSegment: undefined | VoiceInputRecordingSegment,
  stoppedSegment: undefined | VoiceInputRecordingSegment,
) {
  return isSameVoiceInputRecordingSegment(activeSegment, stoppedSegment)
    ? undefined
    : activeSegment
}

function isSameVoiceInputRecordingSegment(
  left: undefined | VoiceInputRecordingSegment,
  right: undefined | VoiceInputRecordingSegment,
) {
  return !!left && !!right && left.id === right.id
}
