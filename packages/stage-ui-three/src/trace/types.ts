import type { VRM } from '@pixiv/three-vrm'
import type { AnimationMixer } from 'three'

export interface StageThreeRuntimeTraceBasePayload {
  originId?: string
  ts: number
}

export interface ThreeRendererMemorySnapshot {
  calls: number
  geometries: number
  jsHeapUsedBytes?: number
  lines: number
  points: number
  programs?: number
  textures: number
  triangles: number
}

export interface ThreeSceneRenderInfoTracePayload extends StageThreeRuntimeTraceBasePayload {
  drawCalls: number
  geometries: number
  lines: number
  points: number
  textures: number
  triangles: number
}

export interface ThreeHitTestReadTracePayload extends StageThreeRuntimeTraceBasePayload {
  durationMs: number
  radius: number
  readHeight: number
  readWidth: number
}

export interface VrmUpdateFrameTracePayload extends StageThreeRuntimeTraceBasePayload {
  animationMixerMs: number
  blinkAndSaccadeMs: number
  deltaMs: number
  durationMs: number
  emoteMs: number
  expressionMs: number
  humanoidMs: number
  lipSyncMs: number
  lookAtMs: number
  springBoneMs: number
  vrmFrameHookMs: number
}

export interface VrmSceneSummarySnapshot {
  animationActionCount: number
  materialCount: number
  meshCount: number
  sceneChildCount: number
  skinnedMeshCount: number
  textureRefCount: number
}

export type VrmLifecycleReason
  = | 'component-unmount'
    | 'initial-load'
    | 'manual-reload'
    | 'model-switch'

export interface VrmLifecycleTracePayload extends StageThreeRuntimeTraceBasePayload {
  durationMs?: number
  errorMessage?: string
  modelSrc?: string
  reason: VrmLifecycleReason
  rendererMemory?: ThreeRendererMemorySnapshot
  sceneSummary?: VrmSceneSummarySnapshot
}

export type VrmLoadStartTracePayload = VrmLifecycleTracePayload
export type VrmLoadEndTracePayload = VrmLifecycleTracePayload
export type VrmLoadErrorTracePayload = VrmLifecycleTracePayload
export type VrmDisposeStartTracePayload = VrmLifecycleTracePayload
export type VrmDisposeEndTracePayload = VrmLifecycleTracePayload

export interface VrmSceneSnapshotInput {
  mixer?: AnimationMixer
  vrm?: VRM
}
