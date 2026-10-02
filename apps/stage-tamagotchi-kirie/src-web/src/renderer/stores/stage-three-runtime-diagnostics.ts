import type {
  ThreeHitTestReadTracePayload,
  ThreeRendererMemorySnapshot,
  ThreeSceneRenderInfoTracePayload,
  VrmDisposeEndTracePayload,
  VrmDisposeStartTracePayload,
  VrmLifecycleReason,
  VrmLoadEndTracePayload,
  VrmLoadErrorTracePayload,
  VrmLoadStartTracePayload,
  VrmSceneSummarySnapshot,
  VrmUpdateFrameTracePayload,
} from '@proj-airi/stage-ui-three/trace'

import type { StageThreeRuntimeTraceEnvelope, StageThreeRuntimeTraceForwardedPayload } from '../../shared/eventa'

import {
  acquireStageThreeRuntimeTrace,
  getStageThreeRuntimeTraceContext,
  stageThreeTraceHitTestReadEvent,
  stageThreeTraceRenderInfoEvent,
  stageThreeTraceVrmDisposeEndEvent,
  stageThreeTraceVrmDisposeStartEvent,
  stageThreeTraceVrmLoadEndEvent,
  stageThreeTraceVrmLoadErrorEvent,
  stageThreeTraceVrmLoadStartEvent,
  stageThreeTraceVrmUpdateFrameEvent,
} from '@proj-airi/stage-ui-three/trace'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { stageThreeRuntimeTraceForwardedEvent } from '../../shared/eventa'
import {
  getStageThreeRuntimeTraceBroadcastContext,
  getStageThreeRuntimeTraceBroadcastOriginId,
  initializeStageThreeRuntimeTraceBridge,
  setStageThreeRuntimeTraceRemoteSubscription,
} from '../bridges/stage-three-runtime-trace'

export const TRACE_HISTORY_LIMIT = 20

export interface StageThreeRuntimeThreeRenderDiagnostics {
  drawCalls: number
  geometries: number
  lastTimestampMs: number
  lines: number
  points: number
  renderCount: number
  textures: number
  triangles: number
}

export interface StageThreeRuntimeVrmUpdateDiagnostics {
  animationMixerMs: number
  blinkAndSaccadeMs: number
  deltaMs: number
  emoteMs: number
  expressionMs: number
  frameCount: number
  humanoidMs: number
  lastTimestampMs: number
  lipSyncMs: number
  lookAtMs: number
  springBoneMs: number
  totalMs: number
  vrmFrameHookMs: number
  vrmRuntimeHookMs: number
}

export interface StageThreeRuntimeHitTestDiagnostics {
  lastDurationMs: number
  lastReadHeight: number
  lastReadWidth: number
  lastTimestampMs: number
  readCount: number
  totalDurationMs: number
}

export interface StageThreeRuntimeVrmLifecycleDiagnostics {
  lastDisposeDurationMs: number
  lastDisposeEndAt: number
  lastDisposeStartAt: number
  lastErrorMessage: string
  lastLoadDurationMs: number
  lastLoadEndAt: number
  lastLoadStartAt: number
  lastModelSrc: string
  lastReason?: VrmLifecycleReason
}

export interface StageThreeRuntimeResourceSnapshotRecord {
  modelSrc?: string
  phase: 'after-dispose' | 'after-load' | 'before-dispose'
  reason?: VrmLifecycleReason
  rendererMemory?: ThreeRendererMemorySnapshot
  sceneSummary?: VrmSceneSummarySnapshot
  ts: number
}

export interface StageThreeRuntimeResourceSnapshotDiagnostics {
  history: StageThreeRuntimeResourceSnapshotRecord[]
  lastAfterDispose?: StageThreeRuntimeResourceSnapshotRecord
  lastAfterLoad?: StageThreeRuntimeResourceSnapshotRecord
  lastBeforeDispose?: StageThreeRuntimeResourceSnapshotRecord
}

export function createDefaultStageThreeRenderDiagnostics(): StageThreeRuntimeThreeRenderDiagnostics {
  return {
    drawCalls: 0,
    geometries: 0,
    lastTimestampMs: 0,
    lines: 0,
    points: 0,
    renderCount: 0,
    textures: 0,
    triangles: 0,
  }
}

export function createDefaultStageVrmUpdateDiagnostics(): StageThreeRuntimeVrmUpdateDiagnostics {
  return {
    animationMixerMs: 0,
    blinkAndSaccadeMs: 0,
    deltaMs: 0,
    emoteMs: 0,
    expressionMs: 0,
    frameCount: 0,
    humanoidMs: 0,
    lastTimestampMs: 0,
    lipSyncMs: 0,
    lookAtMs: 0,
    springBoneMs: 0,
    totalMs: 0,
    vrmFrameHookMs: 0,
    vrmRuntimeHookMs: 0,
  }
}

export function createDefaultStageHitTestDiagnostics(): StageThreeRuntimeHitTestDiagnostics {
  return {
    lastDurationMs: 0,
    lastReadHeight: 0,
    lastReadWidth: 0,
    lastTimestampMs: 0,
    readCount: 0,
    totalDurationMs: 0,
  }
}

export function createDefaultStageVrmLifecycleDiagnostics(): StageThreeRuntimeVrmLifecycleDiagnostics {
  return {
    lastDisposeDurationMs: 0,
    lastDisposeEndAt: 0,
    lastDisposeStartAt: 0,
    lastErrorMessage: '',
    lastLoadDurationMs: 0,
    lastLoadEndAt: 0,
    lastLoadStartAt: 0,
    lastModelSrc: '',
  }
}

export function createDefaultStageResourceSnapshotDiagnostics(): StageThreeRuntimeResourceSnapshotDiagnostics {
  return {
    history: [],
  }
}

export function pushTraceHistory(
  history: StageThreeRuntimeResourceSnapshotRecord[],
  record: StageThreeRuntimeResourceSnapshotRecord,
) {
  const nextHistory = [...history, record]
  return nextHistory.slice(-TRACE_HISTORY_LIMIT)
}

export function applyThreeRenderTracePayload(
  current: StageThreeRuntimeThreeRenderDiagnostics,
  payload: ThreeSceneRenderInfoTracePayload,
): StageThreeRuntimeThreeRenderDiagnostics {
  return {
    drawCalls: payload.drawCalls,
    geometries: payload.geometries,
    lastTimestampMs: payload.ts,
    lines: payload.lines,
    points: payload.points,
    renderCount: current.renderCount + 1,
    textures: payload.textures,
    triangles: payload.triangles,
  }
}

export function applyHitTestTracePayload(
  current: StageThreeRuntimeHitTestDiagnostics,
  payload: ThreeHitTestReadTracePayload,
): StageThreeRuntimeHitTestDiagnostics {
  return {
    lastDurationMs: payload.durationMs,
    lastReadHeight: payload.readHeight,
    lastReadWidth: payload.readWidth,
    lastTimestampMs: payload.ts,
    readCount: current.readCount + 1,
    totalDurationMs: current.totalDurationMs + payload.durationMs,
  }
}

export function applyVrmUpdateTracePayload(
  current: StageThreeRuntimeVrmUpdateDiagnostics,
  payload: VrmUpdateFrameTracePayload,
): StageThreeRuntimeVrmUpdateDiagnostics {
  return {
    animationMixerMs: payload.animationMixerMs,
    blinkAndSaccadeMs: payload.blinkAndSaccadeMs,
    deltaMs: payload.deltaMs,
    emoteMs: payload.emoteMs,
    expressionMs: payload.expressionMs,
    frameCount: current.frameCount + 1,
    humanoidMs: payload.humanoidMs,
    lastTimestampMs: payload.ts,
    lipSyncMs: payload.lipSyncMs,
    lookAtMs: payload.lookAtMs,
    springBoneMs: payload.springBoneMs,
    totalMs: payload.durationMs,
    vrmFrameHookMs: payload.vrmFrameHookMs,
    vrmRuntimeHookMs: payload.vrmRuntimeHookMs,
  }
}

function applyLoadStartPayload(
  current: StageThreeRuntimeVrmLifecycleDiagnostics,
  payload: VrmLoadStartTracePayload,
): StageThreeRuntimeVrmLifecycleDiagnostics {
  return {
    ...current,
    lastErrorMessage: '',
    lastLoadStartAt: payload.ts,
    lastModelSrc: payload.modelSrc ?? '',
    lastReason: payload.reason,
  }
}

function applyLoadEndPayload(
  current: StageThreeRuntimeVrmLifecycleDiagnostics,
  payload: VrmLoadEndTracePayload,
): StageThreeRuntimeVrmLifecycleDiagnostics {
  return {
    ...current,
    lastErrorMessage: '',
    lastLoadDurationMs: payload.durationMs ?? 0,
    lastLoadEndAt: payload.ts,
    lastModelSrc: payload.modelSrc ?? current.lastModelSrc,
    lastReason: payload.reason,
  }
}

function applyLoadErrorPayload(
  current: StageThreeRuntimeVrmLifecycleDiagnostics,
  payload: VrmLoadErrorTracePayload,
): StageThreeRuntimeVrmLifecycleDiagnostics {
  return {
    ...current,
    lastErrorMessage: payload.errorMessage ?? '',
    lastModelSrc: payload.modelSrc ?? current.lastModelSrc,
    lastReason: payload.reason,
  }
}

function applyDisposeStartPayload(
  current: StageThreeRuntimeVrmLifecycleDiagnostics,
  payload: VrmDisposeStartTracePayload,
): StageThreeRuntimeVrmLifecycleDiagnostics {
  return {
    ...current,
    lastDisposeStartAt: payload.ts,
    lastModelSrc: payload.modelSrc ?? current.lastModelSrc,
    lastReason: payload.reason,
  }
}

function applyDisposeEndPayload(
  current: StageThreeRuntimeVrmLifecycleDiagnostics,
  payload: VrmDisposeEndTracePayload,
): StageThreeRuntimeVrmLifecycleDiagnostics {
  return {
    ...current,
    lastDisposeDurationMs: payload.durationMs ?? 0,
    lastDisposeEndAt: payload.ts,
    lastModelSrc: payload.modelSrc ?? current.lastModelSrc,
    lastReason: payload.reason,
  }
}

function createSnapshotRecord(
  phase: StageThreeRuntimeResourceSnapshotRecord['phase'],
  payload: VrmDisposeStartTracePayload | VrmDisposeEndTracePayload | VrmLoadEndTracePayload,
): StageThreeRuntimeResourceSnapshotRecord {
  return {
    modelSrc: payload.modelSrc,
    phase,
    reason: payload.reason,
    rendererMemory: payload.rendererMemory,
    sceneSummary: payload.sceneSummary,
    ts: payload.ts,
  }
}

export function applySnapshotRecord(
  current: StageThreeRuntimeResourceSnapshotDiagnostics,
  record: StageThreeRuntimeResourceSnapshotRecord,
): StageThreeRuntimeResourceSnapshotDiagnostics {
  const next: StageThreeRuntimeResourceSnapshotDiagnostics = {
    ...current,
    history: pushTraceHistory(current.history, record),
  }

  if (record.phase === 'after-load')
    next.lastAfterLoad = record
  else if (record.phase === 'before-dispose')
    next.lastBeforeDispose = record
  else if (record.phase === 'after-dispose')
    next.lastAfterDispose = record

  return next
}

export const useStageThreeRuntimeDiagnosticsStore = defineStore('stageThreeRuntimeDiagnostics', () => {
  const tracing = ref(false)
  const threeRender = ref<StageThreeRuntimeThreeRenderDiagnostics>(createDefaultStageThreeRenderDiagnostics())
  const vrmUpdate = ref<StageThreeRuntimeVrmUpdateDiagnostics>(createDefaultStageVrmUpdateDiagnostics())
  const hitTest = ref<StageThreeRuntimeHitTestDiagnostics>(createDefaultStageHitTestDiagnostics())
  const vrmLifecycle = ref<StageThreeRuntimeVrmLifecycleDiagnostics>(createDefaultStageVrmLifecycleDiagnostics())
  const resourceSnapshots = ref<StageThreeRuntimeResourceSnapshotDiagnostics>(createDefaultStageResourceSnapshotDiagnostics())

  const localTraceContext = getStageThreeRuntimeTraceContext()
  const remoteTraceContext = getStageThreeRuntimeTraceBroadcastContext()
  const localTraceToken = 'stage-three-runtime-diagnostics:local'
  const remoteTraceOriginId = getStageThreeRuntimeTraceBroadcastOriginId()

  let releaseLocalTrace: (() => void) | undefined
  let stopLocalSubscriptions: Array<() => void> = []
  let stopRemoteSubscriptions: Array<() => void> = []

  function resetSamples() {
    threeRender.value = createDefaultStageThreeRenderDiagnostics()
    vrmUpdate.value = createDefaultStageVrmUpdateDiagnostics()
    hitTest.value = createDefaultStageHitTestDiagnostics()
    vrmLifecycle.value = createDefaultStageVrmLifecycleDiagnostics()
    resourceSnapshots.value = createDefaultStageResourceSnapshotDiagnostics()
  }

  function applyRenderPayload(payload: ThreeSceneRenderInfoTracePayload) {
    threeRender.value = applyThreeRenderTracePayload(threeRender.value, payload)
  }

  function applyHitTestPayload(payload: ThreeHitTestReadTracePayload) {
    hitTest.value = applyHitTestTracePayload(hitTest.value, payload)
  }

  function applyVrmUpdatePayload(payload: VrmUpdateFrameTracePayload) {
    vrmUpdate.value = applyVrmUpdateTracePayload(vrmUpdate.value, payload)
  }

  function applyVrmLoadStartPayload(payload: VrmLoadStartTracePayload) {
    vrmLifecycle.value = applyLoadStartPayload(vrmLifecycle.value, payload)
  }

  function applyVrmLoadEndPayload(payload: VrmLoadEndTracePayload) {
    vrmLifecycle.value = applyLoadEndPayload(vrmLifecycle.value, payload)
    resourceSnapshots.value = applySnapshotRecord(resourceSnapshots.value, createSnapshotRecord('after-load', payload))
  }

  function applyVrmLoadErrorPayload(payload: VrmLoadErrorTracePayload) {
    vrmLifecycle.value = applyLoadErrorPayload(vrmLifecycle.value, payload)
  }

  function applyVrmDisposeStartPayload(payload: VrmDisposeStartTracePayload) {
    vrmLifecycle.value = applyDisposeStartPayload(vrmLifecycle.value, payload)
    resourceSnapshots.value = applySnapshotRecord(resourceSnapshots.value, createSnapshotRecord('before-dispose', payload))
  }

  function applyVrmDisposeEndPayload(payload: VrmDisposeEndTracePayload) {
    vrmLifecycle.value = applyDisposeEndPayload(vrmLifecycle.value, payload)
    resourceSnapshots.value = applySnapshotRecord(resourceSnapshots.value, createSnapshotRecord('after-dispose', payload))
  }

  function applyForwardedTraceEnvelope(payload: StageThreeRuntimeTraceForwardedPayload) {
    if (payload.origin === remoteTraceOriginId)
      return

    const envelope: StageThreeRuntimeTraceEnvelope = payload.envelope

    switch (envelope.type) {
      case 'three-render-info':
        applyRenderPayload(envelope.payload)
        break
      case 'three-hit-test-read':
        applyHitTestPayload(envelope.payload)
        break
      case 'vrm-update-frame':
        applyVrmUpdatePayload(envelope.payload)
        break
      case 'vrm-load-start':
        applyVrmLoadStartPayload(envelope.payload)
        break
      case 'vrm-load-end':
        applyVrmLoadEndPayload(envelope.payload)
        break
      case 'vrm-load-error':
        applyVrmLoadErrorPayload(envelope.payload)
        break
      case 'vrm-dispose-start':
        applyVrmDisposeStartPayload(envelope.payload)
        break
      case 'vrm-dispose-end':
        applyVrmDisposeEndPayload(envelope.payload)
        break
      default:
        break
    }
  }

  function subscribeLocalEvents() {
    stopLocalSubscriptions = [
      localTraceContext.on(stageThreeTraceRenderInfoEvent, event => event?.body && applyRenderPayload(event.body)),
      localTraceContext.on(stageThreeTraceHitTestReadEvent, event => event?.body && applyHitTestPayload(event.body)),
      localTraceContext.on(stageThreeTraceVrmUpdateFrameEvent, event => event?.body && applyVrmUpdatePayload(event.body)),
      localTraceContext.on(stageThreeTraceVrmLoadStartEvent, event => event?.body && applyVrmLoadStartPayload(event.body)),
      localTraceContext.on(stageThreeTraceVrmLoadEndEvent, event => event?.body && applyVrmLoadEndPayload(event.body)),
      localTraceContext.on(stageThreeTraceVrmLoadErrorEvent, event => event?.body && applyVrmLoadErrorPayload(event.body)),
      localTraceContext.on(stageThreeTraceVrmDisposeStartEvent, event => event?.body && applyVrmDisposeStartPayload(event.body)),
      localTraceContext.on(stageThreeTraceVrmDisposeEndEvent, event => event?.body && applyVrmDisposeEndPayload(event.body)),
    ]
  }

  function subscribeRemoteEvents() {
    stopRemoteSubscriptions = [
      remoteTraceContext.on(stageThreeRuntimeTraceForwardedEvent, (event) => {
        if (!event?.body)
          return

        applyForwardedTraceEnvelope(event.body)
      }),
    ]
  }

  function startTracing() {
    if (tracing.value)
      return

    initializeStageThreeRuntimeTraceBridge()
    resetSamples()
    releaseLocalTrace = acquireStageThreeRuntimeTrace(localTraceToken)
    subscribeLocalEvents()
    subscribeRemoteEvents()
    void setStageThreeRuntimeTraceRemoteSubscription(true).catch((error) => {
      console.warn('[StageThreeRuntimeDiagnostics] Failed to enable remote trace subscription.', error)
    })
    tracing.value = true
  }

  function stopTracing() {
    if (!tracing.value)
      return

    for (const stopSubscription of stopLocalSubscriptions)
      stopSubscription()
    for (const stopSubscription of stopRemoteSubscriptions)
      stopSubscription()

    stopLocalSubscriptions = []
    stopRemoteSubscriptions = []
    void setStageThreeRuntimeTraceRemoteSubscription(false).catch((error) => {
      console.warn('[StageThreeRuntimeDiagnostics] Failed to disable remote trace subscription.', error)
    })
    releaseLocalTrace?.()
    releaseLocalTrace = undefined
    tracing.value = false
  }

  return {
    hitTest,
    resourceSnapshots,
    resetSamples,
    startTracing,
    stopTracing,
    threeRender,
    tracing,
    vrmLifecycle,
    vrmUpdate,
  }
})
