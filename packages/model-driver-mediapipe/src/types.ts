export interface Vec2 { x: number, y: number }
export interface Vec3 { x: number, y: number, z?: number }

export type Landmark2D = Vec3 & {
  visibility?: number
  presence?: number
}

export type Landmark3D = Vec3 & {
  visibility?: number
  presence?: number
}

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

export type PerceptionState = PerceptionPartial & {
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

export interface MediaPipeAssetsConfig {
  wasmRoot: string
  modelAssetPath: {
    pose: string
    hands: string
    face: string
  }
}
