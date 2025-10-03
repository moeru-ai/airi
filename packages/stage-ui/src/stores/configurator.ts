import { Client } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { onMounted, ref } from 'vue'

export const useConfiguratorForAiriSdk = defineStore('configurator:adapter:proj-airi:server-sdk', () => {
  const connected = ref(false)
  const client = ref<Client>()
  const pendingUpdates = ref<Array<{
    moduleName: string
    config: Record<string, unknown>
  }>>([])

  function flushPending() {
    if (client.value && connected.value) {
      for (const update of pendingUpdates.value) {
        client.value.send({
          type: 'ui:configure' as const,
          data: {
            moduleName: update.moduleName,
            config: update.config,
          },
        })
      }

      pendingUpdates.value = []
    }
  }

  function updateFor(moduleName: string, config: Record<string, unknown>) {
    if (client.value && connected.value) {
      client.value.send({
        type: 'ui:configure' as const,
        data: {
          moduleName,
          config,
        },
      })

      return
    }

    pendingUpdates.value.push({ moduleName, config })
  }

  function init(options?: { token?: string }) {
    return new Promise((resolve, reject) => {
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
          flushPending()
          resolve(true)
        }
      })
    })
  }

  function clearAllPending() {
    pendingUpdates.value = []
  }

  function dispose() {
    flushPending()

    client.value?.close()
    connected.value = false
    client.value = undefined
  }

  onMounted(() => {
    init()
  })

  return {
    connected,
    client,

    flushPending,
    clearAllPending,
    updateFor,

    dispose,
    init,
  }
})
