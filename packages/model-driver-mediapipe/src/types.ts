import type { FilesetResolver, Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'

export type VisionTaskModule = typeof import('@mediapipe/tasks-vision')

// Indirect export from @mediapipe/tasks-vision
export type VisionTaskWasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

export type Landmark2D = NormalizedLandmark
export type Landmark3D = Landmark

export interface PoseState {
  landmarks2d?: Landmark2D[]
  worldLandmarks?: Landmark3D[]
}

export interface HandState {
  handedness: 'Left' | 'Right'
  landmarks2d: Landmark2D[]
  score?: number
}

export interface FaceState {
  hasFace?: boolean
  landmarks2d?: Landmark2D[]
}

export interface PerceptionQuality {
  fps: number
  latencyMs?: number
  droppedFrames?: number
  backend: 'mediapipe'
  mode: 'split-tasks'
}

export interface PerceptionPartial {
  pose?: PoseState
  hands?: HandState[]
  face?: FaceState
}

export interface PerceptionState extends PerceptionPartial {
  t: number
  quality: PerceptionQuality
}

export type MocapJob = 'pose' | 'hands' | 'face'

export interface MocapConfig {
  enabled: Record<MocapJob, boolean>
  hz: Record<MocapJob, number>
  maxPeople: 1
}

export interface FrameSource {
  getFrame: () => TexImageSource
}

export interface MocapBackend {
  init: (config: MocapConfig) => Promise<void>
  isBusy: () => boolean
  run: (frame: TexImageSource, jobs: MocapJob[], nowMs: number) => Promise<PerceptionPartial>
}

export interface MocapEngine {
  init: () => Promise<void>
  start: (
    source: FrameSource,
    onState: (state: PerceptionState) => void,
    options?: { onError?: (error: unknown) => void },
  ) => void
  stop: () => void
  updateConfig: (config: MocapConfig) => void
  resetState: () => void
}
