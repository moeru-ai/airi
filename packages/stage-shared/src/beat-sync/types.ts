import type { AnalyserBeatEvent } from '@nekopaw/tempora'

export interface BeatSyncDetectorEventMap {
  beat: (e: AnalyserBeatEvent) => void
  stateChange: (state: BeatSyncDetectorState) => void
}

export interface BeatSyncDetectorState {
  isActive: boolean
}
