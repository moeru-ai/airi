import type { AnalyserBeatEvent } from '@nekopaw/tempora'

export interface BeatSyncDetectorState {
  isActive: boolean
}

export interface BeatSyncDetectorEventMap {
  stateChange: (state: BeatSyncDetectorState) => void
  beat: (e: AnalyserBeatEvent) => void
}
