import type { TraceEvent } from '@proj-airi/stage-shared'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { watch } from 'vue'

type PerfTracerMode = 'forward' | 'receive'
type PerfTracerState = 'idle' | PerfTracerMode

interface PerfTracerMessageEnable {
  type: 'enable'
  token?: string
  origin: string
  mode?: PerfTracerMode
}

interface PerfTracerMessageDisable {
  type: 'disable'
  token?: string
  origin: string
}

interface PerfTracerMessageEvent {
  type: 'event'
  event: TraceEvent
  origin: string
}

type PerfTracerMessage = PerfTracerMessageEnable | PerfTracerMessageDisable | PerfTracerMessageEvent

const PERF_TRACER_CHANNEL = 'airi-perf-tracer'
const RELAY_META_KEY = '__perfTracerRelayedFrom'
const BRIDGE_TOKEN = 'perf-bridge'

export const usePerfTracerBridgeStore = defineStore('perfTracerBridge', () => {
  const instanceId = Math.random().toString(36).slice(2, 10)
  const { post, data } = useBroadcastChannel<PerfTracerMessage, PerfTracerMessage>({ name: PERF_TRACER_CHANNEL })

  let release: (() => void) | undefined
  let unsubscribe: (() => void) | undefined
  let state: PerfTracerState = 'idle'

  function enableLocal(token = BRIDGE_TOKEN) {
    if (release)
      return
    release = defaultPerfTracer.acquire(token)
  }

  function disableLocal() {
    release?.()
    release = undefined
  }

  function startForwarding() {
    if (unsubscribe)
      return
    unsubscribe = defaultPerfTracer.subscribeSafe((event) => {
      if (event.tracerId !== 'markdown' && event.tracerId !== 'chat')
        return
      if (event.meta?.[RELAY_META_KEY])
        return
      post({
        type: 'event',
        event: {
          ...event,
          meta: { ...event.meta, [RELAY_META_KEY]: instanceId },
        },
        origin: instanceId,
      })
    }, { label: 'perf-bridge' })
  }

  function stopForwarding() {
    unsubscribe?.()
    unsubscribe = undefined
  }

  function transition(next: PerfTracerState, token = BRIDGE_TOKEN) {
    if (state === next)
      return
    if (next === 'idle') {
      stopForwarding()
      disableLocal()
    }
    else if (next === 'receive') {
      enableLocal(token)
      stopForwarding()
    }
    else if (next === 'forward') {
      enableLocal(token)
      startForwarding()
    }
    state = next
  }

  watch(data, (message) => {
    if (!message)
      return
    if (message.origin === instanceId)
      return

    if (message.type === 'enable') {
      const mode: PerfTracerMode = message.mode ?? 'forward'
      const token = message.token ?? BRIDGE_TOKEN
      transition(mode, token)
    }
    else if (message.type === 'disable') {
      transition('idle')
    }
    else if (message.type === 'event') {
      if (state === 'idle')
        return
      // Replay remote events into the local tracer; requires tracer enabled to pass through.
      const relayedFrom = message.event.meta?.[RELAY_META_KEY] ?? message.origin
      defaultPerfTracer.emit({
        ...message.event,
        meta: { ...message.event.meta, [RELAY_META_KEY]: relayedFrom },
      })
    }
  })

  function requestEnable(token?: string, mode: PerfTracerMode = 'forward', localState: PerfTracerState = mode) {
    const tokenToUse = token ?? BRIDGE_TOKEN
    transition(localState, tokenToUse)
    post({ type: 'enable', token: tokenToUse, origin: instanceId, mode })
  }

  function requestDisable(token?: string) {
    transition('idle')
    post({ type: 'disable', token: token ?? BRIDGE_TOKEN, origin: instanceId })
  }

  return {
    requestEnable,
    requestDisable,
    enableLocal,
    disableLocal,
    startForwarding,
    stopForwarding,
  }
})
