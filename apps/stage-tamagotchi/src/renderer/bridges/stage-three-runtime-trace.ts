import type { Eventa } from '@moeru/eventa'

import type { StageThreeRuntimeTraceEnvelope } from '../../shared/eventa'

import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
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

import {
  stageThreeRuntimeTraceForwardedEvent,
  stageThreeRuntimeTraceRemoteDisableEvent,
  stageThreeRuntimeTraceRemoteEnableEvent,
} from '../../shared/eventa'

const STAGE_THREE_RUNTIME_TRACE_CHANNEL = 'airi::stage-three-runtime-trace'
const relayTraceLeaseToken = 'stage-three-runtime-trace:broadcast-relay'
const localTraceContext = getStageThreeRuntimeTraceContext()
const instanceId = Math.random().toString(36).slice(2, 10)
const replayOrder: Array<StageThreeRuntimeTraceEnvelope['type']> = [
  'vrm-load-start',
  'vrm-load-end',
  'vrm-load-error',
  'vrm-dispose-start',
  'vrm-dispose-end',
  'three-hit-test-read',
  'three-render-info',
  'vrm-update-frame',
]

let initialized = false
let broadcastContext: ReturnType<typeof createBroadcastChannelContext>['context'] | undefined
let channel: BroadcastChannel | undefined
let releaseRelayTrace: (() => void) | undefined
const remoteSubscribers = new Set<string>()
const latestEnvelopes = new Map<StageThreeRuntimeTraceEnvelope['type'], StageThreeRuntimeTraceEnvelope>()

function getChannel() {
  channel ??= new BroadcastChannel(STAGE_THREE_RUNTIME_TRACE_CHANNEL)
  return channel
}

export function getStageThreeRuntimeTraceBroadcastContext() {
  broadcastContext ??= createBroadcastChannelContext(getChannel()).context
  return broadcastContext
}

export function getStageThreeRuntimeTraceBroadcastOriginId() {
  return instanceId
}

function applyCollectionState(active: boolean) {
  if (active) {
    releaseRelayTrace ??= acquireStageThreeRuntimeTrace(relayTraceLeaseToken)
    return
  }

  releaseRelayTrace?.()
  releaseRelayTrace = undefined
}

function emitTraceEnvelope(envelope: StageThreeRuntimeTraceEnvelope) {
  latestEnvelopes.set(envelope.type, envelope)
  getStageThreeRuntimeTraceBroadcastContext().emit(stageThreeRuntimeTraceForwardedEvent, {
    envelope,
    origin: instanceId,
  })
}

function replayLatestTraceEnvelopes() {
  const context = getStageThreeRuntimeTraceBroadcastContext()

  for (const type of replayOrder) {
    const envelope = latestEnvelopes.get(type)
    if (!envelope)
      continue

    context.emit(stageThreeRuntimeTraceForwardedEvent, {
      envelope,
      origin: instanceId,
    })
  }
}

function forwardTraceEvent<T>(eventa: Eventa<T>, createEnvelope: (payload: T) => StageThreeRuntimeTraceEnvelope) {
  localTraceContext.on(eventa, (event) => {
    if (!event?.body)
      return

    emitTraceEnvelope(createEnvelope(event.body))
  })
}

export async function setStageThreeRuntimeTraceRemoteSubscription(active: boolean) {
  const eventa = active ? stageThreeRuntimeTraceRemoteEnableEvent : stageThreeRuntimeTraceRemoteDisableEvent
  getStageThreeRuntimeTraceBroadcastContext().emit(eventa, { origin: instanceId })
}

export function initializeStageThreeRuntimeTraceBridge() {
  if (initialized)
    return

  initialized = true

  const context = getStageThreeRuntimeTraceBroadcastContext()

  context.on(stageThreeRuntimeTraceRemoteEnableEvent, (event) => {
    const origin = event?.body?.origin
    if (!origin || origin === instanceId)
      return

    remoteSubscribers.add(origin)
    applyCollectionState(remoteSubscribers.size > 0)
    replayLatestTraceEnvelopes()
  })

  context.on(stageThreeRuntimeTraceRemoteDisableEvent, (event) => {
    const origin = event?.body?.origin
    if (!origin || origin === instanceId)
      return

    remoteSubscribers.delete(origin)
    applyCollectionState(remoteSubscribers.size > 0)
  })

  forwardTraceEvent(stageThreeTraceRenderInfoEvent, payload => ({ type: 'three-render-info', payload }))
  forwardTraceEvent(stageThreeTraceHitTestReadEvent, payload => ({ type: 'three-hit-test-read', payload }))
  forwardTraceEvent(stageThreeTraceVrmUpdateFrameEvent, payload => ({ type: 'vrm-update-frame', payload }))
  forwardTraceEvent(stageThreeTraceVrmLoadStartEvent, payload => ({ type: 'vrm-load-start', payload }))
  forwardTraceEvent(stageThreeTraceVrmLoadEndEvent, payload => ({ type: 'vrm-load-end', payload }))
  forwardTraceEvent(stageThreeTraceVrmLoadErrorEvent, payload => ({ type: 'vrm-load-error', payload }))
  forwardTraceEvent(stageThreeTraceVrmDisposeStartEvent, payload => ({ type: 'vrm-dispose-start', payload }))
  forwardTraceEvent(stageThreeTraceVrmDisposeEndEvent, payload => ({ type: 'vrm-dispose-end', payload }))
}
