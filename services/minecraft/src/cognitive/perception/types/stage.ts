import type { PerceptionFrame } from '../frame'

export interface PerceptionStage {
  name: string
  tick?: (deltaMs: number) => void
  handle: (frame: PerceptionFrame) => PerceptionFrame | null
}
