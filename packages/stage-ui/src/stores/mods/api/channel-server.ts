import type { ContextUpdate, InputContextUpdate, WebSocketBaseEvent, WebSocketEvent, WebSocketEventOptionalSource, WebSocketEvents } from '@proj-airi/server-sdk'
import type { CommonContentPart } from '@xsai/shared-chat'

import { Client, WebSocketEventSource } from '@proj-airi/server-sdk'
import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useWebSocketInspectorStore } from '../../devtools/websocket-inspector'

interface ChannelListenerEntry {
  type: keyof WebSocketEvents
  callback: (event: WebSocketBaseEvent<any, any>) => void | Promise<void>
  boundClient?: Client
}

const REPLAYABLE_EVENT_TYPES = new Set<keyof WebSocketEvents>([
  'module:announced',
  'module:de-announced',
  'registry:modules:health:healthy',
  'registry:modules:health:unhealthy',
  'registry:modules:sync',
])

export const useModsServerChannelStore = defineStore('mods:channels:proj-airi:server', () => {
  const connected = ref(false)
  const client = ref<Client>()
  const initializing = ref<Promise<void> | null>(null)
  const pendingSend = ref<Array<WebSocketEvent>>([])
  const pendingSendCount = computed(() => pendingSend.value.length)

  const defaultWebSocketUrl = import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws'
  const websocketUrl = useLocalStorage('settings/connection/websocket-url', defaultWebSocketUrl)
  const registeredListeners: ChannelListenerEntry[] = []
  const replayableEvents = new Map<keyof WebSocketEvents, WebSocketBaseEvent<any, any>>()

  const basePossibleEvents: Array<keyof WebSocketEvents> = [
    'context:update',
    'error',
    'module:announce',
    'module:announced',
    'module:configure',
    'module:de-announced',
    'module:consumer:register',
    'module:consumer:unregister',
    'module:authenticated',
    'registry:modules:health:healthy',
    'registry:modules:health:unhealthy',
    'registry:modules:sync',
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
          if (REPLAYABLE_EVENT_TYPES.has(event.type as keyof WebSocketEvents))
            replayableEvents.set(event.type as keyof WebSocketEvents, event as WebSocketBaseEvent<any, any>)

          useWebSocketInspectorStore().add('incoming', event)
        },
        onAnySend: (event) => {
          useWebSocketInspectorStore().add('outgoing', event)
        },
        onError: (error) => {
          connected.value = false
          initializing.value = null
          clearListeners()
          replayableEvents.clear()

          console.warn('WebSocket server connection error:', error)
        },
        onClose: () => {
          connected.value = false
          initializing.value = null
          clearListeners()
          replayableEvents.clear()

          console.warn('WebSocket server connection closed')
        },
        onReady: () => {
          connected.value = true
          flush()
          initializeListeners()
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
    for (const listener of registeredListeners) {
      if (listener.boundClient) {
        listener.boundClient.offEvent(listener.type, listener.callback as any)
        listener.boundClient = undefined
      }
    }
  }

  function initializeListeners() {
    if (!client.value)
      return

    for (const listener of registeredListeners) {
      if (listener.boundClient === client.value)
        continue

      listener.boundClient?.offEvent(listener.type, listener.callback as any)
      client.value.onEvent(listener.type, listener.callback as any)
      listener.boundClient = client.value
    }
  }

  function registerListener<E extends keyof WebSocketEvents>(
    type: E,
    callback: (event: WebSocketBaseEvent<E, WebSocketEvents[E]>) => void | Promise<void>,
  ) {
    if (!client.value && !initializing.value)
      void initialize()

    const entry: ChannelListenerEntry = {
      type,
      callback: callback as any,
    }
    registeredListeners.push(entry)
    initializeListeners()

    const replayableEvent = replayableEvents.get(type)
    if (replayableEvent)
      void Promise.resolve(callback(replayableEvent as WebSocketBaseEvent<E, WebSocketEvents[E]>))

    return () => {
      const index = registeredListeners.indexOf(entry)
      if (index >= 0)
        registeredListeners.splice(index, 1)

      entry.boundClient?.offEvent(type, callback as any)
      entry.boundClient = undefined
    }
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
    return registerListener('context:update', callback)
  }

  function onEvent<E extends keyof WebSocketEvents>(
    type: E,
    callback: (event: WebSocketBaseEvent<E, WebSocketEvents[E]>) => void | Promise<void>,
  ) {
    return registerListener(type, callback)
  }

  function sendContextUpdate(message: InputContextUpdate) {
    const id = nanoid()
    send({
      type: 'context:update',
      data: { id, contextId: id, ...message },
    } as WebSocketEventOptionalSource<string | CommonContentPart[]>)
  }

  function dispose() {
    flush()
    clearListeners()
    replayableEvents.clear()

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
    pendingSendCount,
    ensureConnected,

    initialize,
    send,
    sendContextUpdate,
    onContextUpdate,
    onEvent,
    getPendingSendSnapshot: () => [...pendingSend.value],
    dispose,
  }
})
