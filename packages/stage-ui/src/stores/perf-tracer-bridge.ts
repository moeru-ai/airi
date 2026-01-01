import type { TraceEvent } from '@proj-airi/stage-shared'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { watch } from 'vue'

interface PerfTracerMessageEnable {
  type: 'enable'
  token?: string
  origin: string
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

export const usePerfTracerBridgeStore = defineStore('perfTracerBridge', () => {
  const instanceId = Math.random().toString(36).slice(2, 10)
  const { post, data } = useBroadcastChannel<PerfTracerMessage, PerfTracerMessage>({ name: PERF_TRACER_CHANNEL })

  let release: (() => void) | undefined
  let unsubscribe: (() => void) | undefined

  function enableLocal(token = 'perf-bridge') {
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
      post({ type: 'event', event, origin: instanceId })
    }, { label: 'perf-bridge' })
  }

  function stopForwarding() {
    unsubscribe?.()
    unsubscribe = undefined
  }

  watch(data, (message) => {
    if (!message)
      return
    if (message.origin === instanceId)
      return

    if (message.type === 'enable') {
      enableLocal(message.token)
      startForwarding()
    }
    else if (message.type === 'disable') {
      stopForwarding()
      disableLocal()
    }
    else if (message.type === 'event') {
      // Replay remote events into the local tracer; requires tracer enabled to pass through.
      defaultPerfTracer.emit(message.event)
    }
  })

  function requestEnable(token?: string) {
    post({ type: 'enable', token, origin: instanceId })
  }

  function requestDisable(token?: string) {
    post({ type: 'disable', token, origin: instanceId })
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
