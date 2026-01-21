import type { ContextUpdate, WebSocketBaseEvent, WebSocketEvent, WebSocketEventOptionalSource, WebSocketEvents } from '@proj-airi/server-sdk'

import { Client, WebSocketEventSource } from '@proj-airi/server-sdk'
import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { useWebSocketInspectorStore } from '../../devtools/websocket-inspector'

export const useModsServerChannelStore = defineStore('mods:channels:proj-airi:server', () => {
  const connected = ref(false)
  const client = ref<Client>()
  const initializing = ref<Promise<void> | null>(null)
  const pendingSend = ref<Array<WebSocketEvent>>([])
  const listenersInitialized = ref(false)
  const listenerDisposers = ref<Array<() => void>>([])

  const defaultWebSocketUrl = import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws'
  const websocketUrl = useLocalStorage('settings/connection/websocket-url', defaultWebSocketUrl)

  const basePossibleEvents: Array<keyof WebSocketEvents> = [
    'context:update',
    'error',
    'module:announce',
    'module:configure',
    'module:authenticated',
    'spark:notify',
    'spark:emit',
    'spark:command',
    'input:text',
    'input:text:voice',
    'output:gen-ai:chat:message',
    'output:gen-ai:chat:complete',
    'output:gen-ai:chat:tool-call',
    'ui:configure',
  ]

  async function initialize(options?: { token?: string, possibleEvents?: Array<keyof WebSocketEvents> }) {
    if (connected.value && client.value)
      return Promise.resolve()
    if (initializing.value)
      return initializing.value

    const possibleEvents = Array.from(new Set<keyof WebSocketEvents>([
      ...basePossibleEvents,
      ...(options?.possibleEvents ?? []),
    ]))

    initializing.value = new Promise<void>((resolve) => {
      client.value = new Client({
        name: isStageWeb() ? WebSocketEventSource.StageWeb : isStageTamagotchi() ? WebSocketEventSource.StageTamagotchi : WebSocketEventSource.StageWeb,
        url: websocketUrl.value || defaultWebSocketUrl,
        token: options?.token,
        possibleEvents,
        onAnyMessage: (event) => {
          useWebSocketInspectorStore().add('incoming', event)
        },
        onAnySend: (event) => {
          useWebSocketInspectorStore().add('outgoing', event)
        },
        onError: (error) => {
          connected.value = false
          initializing.value = null
          clearListeners()

          console.warn('WebSocket server connection error:', error)
        },
        onClose: () => {
          connected.value = false
          initializing.value = null
          clearListeners()

          console.warn('WebSocket server connection closed')
        },
      })

      client.value.onEvent('module:authenticated', (event) => {
        if (event.data.authenticated) {
          connected.value = true
          flush()
          initializeListeners()
          resolve()

          // eslint-disable-next-line no-console
          console.log('WebSocket server connection established and authenticated')

          return
        }

        connected.value = false
      })
    })
  }

  async function ensureConnected() {
    await initializing.value
    if (!connected.value) {
      return await initialize()
    }
  }

  function clearListeners() {
    for (const disposer of listenerDisposers.value) {
      try {
        disposer()
      }
      catch (error) {
        console.warn('Failed to dispose channel listener:', error)
      }
    }
    listenerDisposers.value = []
    listenersInitialized.value = false
  }

  function initializeListeners() {
    if (!client.value)
      // No-op for now; keep placeholder for future shared listeners.
      // eslint-disable-next-line no-useless-return
      return
  }

  function send<C = undefined>(data: WebSocketEventOptionalSource<C>) {
    if (!client.value && !initializing.value)
      void initialize()

    if (client.value && connected.value) {
      client.value.send(data as WebSocketEvent)
    }
    else {
      pendingSend.value.push(data as WebSocketEvent)
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

  function onContextUpdate(callback: (event: WebSocketBaseEvent<'context:update', ContextUpdate>) => void | Promise<void>) {
    if (!client.value && !initializing.value)
      void initialize()

    client.value?.onEvent('context:update', callback as any)

    return () => {
      client.value?.offEvent('context:update', callback as any)
    }
  }

  function onEvent<E extends keyof WebSocketEvents>(
    type: E,
    callback: (event: WebSocketBaseEvent<E, WebSocketEvents[E]>) => void | Promise<void>,
  ) {
    if (!client.value && !initializing.value)
      void initialize()

    client.value?.onEvent(type, callback as any)

    return () => {
      client.value?.offEvent(type, callback as any)
    }
  }

  function sendContextUpdate(message: Omit<ContextUpdate, 'id' | 'contextId'> & Partial<Pick<ContextUpdate, 'id' | 'contextId'>>) {
    const id = nanoid()
    send({ type: 'context:update', data: { id, contextId: id, ...message } })
  }

  function dispose() {
    flush()
    clearListeners()

    if (client.value) {
      client.value.close()
      client.value = undefined
    }
    connected.value = false
    initializing.value = null
  }

  watch(websocketUrl, (newUrl, oldUrl) => {
    if (newUrl === oldUrl)
      return

    if (client.value || initializing.value) {
      dispose()
      void initialize()
    }
  })

  return {
    connected,
    ensureConnected,

    initialize,
    send,
    sendContextUpdate,
    onContextUpdate,
    onEvent,
    dispose,
  }
})
