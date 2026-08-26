import type { FilesetResolver, Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface FaceState {
  hasFace?: boolean
  landmarks2d?: Landmark2D[]
}

export interface FrameSource {
  getFrame: () => TexImageSource
}

export interface HandState {
  handedness: 'Left' | 'Right'
  landmarks2d: Landmark2D[]
  score?: number
}
export type Landmark2D = NormalizedLandmark

export type Landmark3D = Landmark

export interface MocapBackend {
  init: (config: MocapConfig) => Promise<void>
  isBusy: () => boolean
  run: (frame: TexImageSource, jobs: MocapJob[], nowMs: number) => Promise<PerceptionPartial>
}

export interface MocapConfig {
  enabled: Record<MocapJob, boolean>
  hz: Record<MocapJob, number>
  maxPeople: 1
}

export interface MocapEngine {
  init: () => Promise<void>
  resetState: () => void
  start: (
    source: FrameSource,
    onState: (state: PerceptionState) => void,
    options?: { onError?: (error: unknown) => void },
  ) => void
  stop: () => void
  updateConfig: (config: MocapConfig) => void
}

export type MocapJob = 'face' | 'hands' | 'pose'

export interface PerceptionPartial {
  face?: FaceState
  hands?: HandState[]
  pose?: PoseState
}

export interface PerceptionQuality {
  backend: 'mediapipe'
  droppedFrames?: number
  fps: number
  latencyMs?: number
  mode: 'split-tasks'
}

export interface PerceptionState extends PerceptionPartial {
  quality: PerceptionQuality
  t: number
}

export interface PoseState {
  landmarks2d?: Landmark2D[]
  worldLandmarks?: Landmark3D[]
}

export type VisionTaskModule = typeof import('@mediapipe/tasks-vision')

// Indirect export from @mediapipe/tasks-vision
export type VisionTaskWasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
