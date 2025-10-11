import type { WebSocketEvent } from '@proj-airi/server-sdk'

import { Client } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useModsChannelServerStore = defineStore('mods:channels:proj-airi:server', () => {
  const connected = ref(false)
  const client = ref<Client>()

  const pendingSend = ref<Array<WebSocketEvent>>([])

  function initialize(options?: { token?: string }) {
    return new Promise<void>((resolve, reject) => {
      const disableFlag = [
        import.meta.env?.VITE_DISABLE_WEBSOCKET,
        import.meta.env?.DISABLE_WEBSOCKET,
      ].find(value => typeof value === 'string')

      const wsDisabled = typeof disableFlag === 'string'
        ? disableFlag.toLowerCase() === 'true'
        : false

      if (wsDisabled) {
        connected.value = false
        client.value = undefined
        pendingSend.value = []
        resolve()
        return
      }

      client.value = new Client({
        name: 'proj-airi:ui:stage',
        url: import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws',
        token: options?.token,
        possibleEvents: [
          'ui:configure',
          'module:authenticated',
        ],
        onError: (error) => {
          reject(error)
        },
      })

      client.value.onEvent('module:authenticated', (event) => {
        if (event.data.authenticated) {
          connected.value = true
          flush()
          resolve()
        }
      })
    })
  }

  function send(data: WebSocketEvent) {
    if (!client.value) {
      return
    }

    if (connected.value) {
      client.value.send(data)
    }
    else {
      pendingSend.value.push(data)
    }
  }

  function flush() {
    if (!client.value) {
      return
    }

    if (connected.value) {
      for (const update of pendingSend.value) {
        client.value.send(update)
      }

      pendingSend.value = []
    }
  }

  function dispose() {
    flush()

    client.value?.close()
    connected.value = false
    client.value = undefined
  }

  return {
    connected,

    initialize,
    send,
    dispose,
  }
})
