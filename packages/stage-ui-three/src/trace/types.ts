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
  nodeConstraintMs: number
  springBoneMs: number
  vrmFrameHookMs: number
  vrmRuntimeHookMs: number
}

export type ThreeSceneTracePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error'
export type ThreeSceneTraceModelPhase = 'no-model' | 'loading' | 'ready' | 'error'
export type ThreeSceneTraceComponentState = 'pending' | 'loading' | 'mounted'
export type ThreeSceneTracePhaseCause
  = | 'binding:complete'
    | 'binding:start'
    | 'component:unmount'
    | 'controls-ready'
    | 'controls-ref:detached'
    | 'model-ref:detached'
    | 'props:model-src'
    | 'tres:ready'
    | 'vrm:error'
    | 'vrm:load-start'
    | 'vrm:loaded'
export type ThreeSceneTraceSubtreeKey = 'controlsRef' | 'dirLightRef' | 'modelRef' | 'tresCanvasRef'
export type ThreeSceneTraceSubtreeAction = 'attached' | 'detached'
export type ThreeSceneTraceTransactionAction = 'begin' | 'end' | 'reset'
export type ThreeSceneTraceTransactionReason
  = | 'component-unmount'
    | 'initial-load'
    | 'model-reload'
    | 'model-switch'
    | 'no-model'
    | 'subtree-remount'
    | 'unknown'

export interface ThreeScenePhaseTracePayload extends StageThreeRuntimeTraceBasePayload {
  cause: ThreeSceneTracePhaseCause
  from?: ThreeSceneTracePhase
  modelSrc?: string
  to: ThreeSceneTracePhase
  transactionDepth: number
}

export interface ThreeSceneSubtreeTracePayload extends StageThreeRuntimeTraceBasePayload {
  action: ThreeSceneTraceSubtreeAction
  key: ThreeSceneTraceSubtreeKey
  scenePhase: ThreeSceneTracePhase
  transactionDepth: number
}

export interface ThreeSceneTransactionTracePayload extends StageThreeRuntimeTraceBasePayload {
  action: ThreeSceneTraceTransactionAction
  depth: number
  reason: ThreeSceneTraceTransactionReason
  scenePhase: ThreeSceneTracePhase
}

export interface ThreeSceneComponentStateTracePayload extends StageThreeRuntimeTraceBasePayload {
  canvasReady: boolean
  controlsReady: boolean
  from?: ThreeSceneTraceComponentState
  modelPhase: ThreeSceneTraceModelPhase
  scenePhase: ThreeSceneTracePhase
  to: ThreeSceneTraceComponentState
  transactionDepth: number
}

export interface ThreeSceneMutationLockTracePayload extends StageThreeRuntimeTraceBasePayload {
  locked: boolean
  scenePhase: ThreeSceneTracePhase
  transactionDepth: number
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
    | 'model-reload'
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

export type VrmCacheAction = 'clear' | 'stash' | 'take'
export type VrmCacheResult = 'empty' | 'evicted' | 'hit' | 'miss' | 'stored'

export interface VrmCacheTracePayload extends StageThreeRuntimeTraceBasePayload {
  action: VrmCacheAction
  modelSrc?: string
  result: VrmCacheResult
  scopeKey: string
}
