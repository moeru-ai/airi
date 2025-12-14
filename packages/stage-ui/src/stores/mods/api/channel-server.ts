import type { ContextMessage, WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { Client } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useModsServerChannelStore = defineStore('mods:channels:proj-airi:server', () => {
  const connected = ref(false)
  const client = ref<Client>()
  const initializing = ref<Promise<void> | null>(null)

  const pendingSend = ref<Array<WebSocketEvent>>([])

  function initialize(options?: { token?: string, possibleEvents?: Array<keyof WebSocketEvents> }) {
    if (connected.value && client.value)
      return Promise.resolve()
    if (initializing.value)
      return initializing.value

    const possibleEvents = Array.from(new Set<keyof WebSocketEvents>([
      'ui:configure',
      'context:update',
      ...(options?.possibleEvents ?? []),
    ]))

    initializing.value = new Promise<void>((resolve, reject) => {
      client.value = new Client({
        name: 'proj-airi:ui:stage',
        url: import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws',
        token: options?.token,
        possibleEvents,
        onError: (error) => {
          client.value = undefined
          connected.value = false
          initializing.value = null
          reject(error)
        },
        onClose: () => {
          connected.value = false
          initializing.value = null
        },
      })

      client.value.onEvent('module:authenticated', (event) => {
        if (event.data.authenticated) {
          connected.value = true
          flush()
          initializeListeners()
          resolve()
          return
        }

        connected.value = false
      })
    })

    return initializing.value
  }

  function initializeListeners() {
    if (!client.value)
      // No-op for now; keep placeholder for future shared listeners.
      // eslint-disable-next-line no-useless-return
      return
  }

  function send(data: WebSocketEvent) {
    if (!client.value && !initializing.value)
      void initialize()

    if (client.value && connected.value) {
      client.value.send(data)
    }
    else {
      pendingSend.value.push(data)
    }
  }

  function flush() {
    if (client.value && connected.value) {
      for (const update of pendingSend.value) {
        client.value.send(update)
      }

      pendingSend.value = []
    }
  }

  function onContextUpdate(callback: (event: WebSocketBaseEvent<'context:update', ContextMessage>) => void | Promise<void>) {
    if (!client.value && !initializing.value)
      void initialize()

    client.value?.onEvent('context:update', callback as any)

    return () => {
      client.value?.offEvent('context:update', callback as any)
    }
  }

  function sendContextUpdate(message: ContextMessage) {
    send({
      type: 'context:update',
      data: message,
    })
  }

  function dispose() {
    flush()

    client.value?.close()
    connected.value = false
    client.value = undefined
    initializing.value = null
  }

  return {
    connected,

    initialize,
    send,
    sendContextUpdate,
    onContextUpdate,
    dispose,
  }
})
