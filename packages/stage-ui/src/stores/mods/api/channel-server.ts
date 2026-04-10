import type {
  ContextUpdate,
  InputContextUpdate,
  WebSocketBaseEvent,
  WebSocketEvent,
  WebSocketEventOptionalSource,
  WebSocketEvents,
  WebSocketLikeConstructor,
} from '@proj-airi/server-sdk'
import type { CommonContentPart } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'
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

function hasReconnectableWebSocketScheme(url: string | undefined) {
  if (!url) {
    return false
  }

  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:'
  }
  catch {
    return false
  }
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
  const websocketConstructor = ref<WebSocketLikeConstructor>()
  const hasEverConnected = ref(false)
  const pendingSend = ref<Array<WebSocketEvent>>([])
  const pendingSendCount = computed(() => pendingSend.value.length)
  const reconnectedCallbacks = new Set<() => void>()

  const defaultWebSocketUrl = import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws'
  const websocketUrl = useLocalStorage('settings/connection/websocket-url', defaultWebSocketUrl)
  const websocketAuthToken = useLocalStorage('settings/connection/websocket-auth-token', '')
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

  async function initialize(options?: {
    token?: string
    possibleEvents?: Array<keyof WebSocketEvents>
    websocketConstructor?: WebSocketLikeConstructor
  }) {
    if (connected.value && client.value)
      return Promise.resolve()
    if (initializing.value)
      return initializing.value

    if (options?.websocketConstructor) {
      websocketConstructor.value = options.websocketConstructor
    }

    const possibleEvents = Array.from(new Set<keyof WebSocketEvents>([
      ...basePossibleEvents,
      ...(options?.possibleEvents ?? []),
    ]))

    initializing.value = new Promise<void>((resolve) => {
      client.value = new Client({
        name: isStageWeb() ? WebSocketEventSource.StageWeb : isStageTamagotchi() ? WebSocketEventSource.StageTamagotchi : WebSocketEventSource.StageWeb,
        url: websocketUrl.value || defaultWebSocketUrl,
        token: options?.token ?? (websocketAuthToken.value || undefined),
        websocketConstructor: websocketConstructor.value,
        heartbeat: {
          // Keep client and server heartbeat windows aligned to reduce false-positive disconnects.
          readTimeout: 60_000,
          pingInterval: 20_000,
        },
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
          // Do not clear listeners or replay cache here.
          // onError may be recoverable while the SDK is reconnecting.
          if (import.meta.env.DEV) {
            console.info('WebSocket server connection error:', {
              message: errorMessageFrom(error) ?? 'Unknown websocket error',
              error,
            })
          }
        },
        onClose: () => {
          connected.value = false

          if (!hasEverConnected.value) {
            // First handshake failed: clear lock so initialize() can be retried externally.
            initializing.value = null
          }
          // Runtime disconnect: keep initialize/listeners for SDK auto-reconnect.
          // Terminal failure: handled by onStateChange status === 'failed'.
        },
        onStateChange: ({ status }) => {
          if (status === 'failed') {
            // SDK entered terminal state (auth terminal / retries exhausted / autoReconnect disabled).
            connected.value = false
            initializing.value = null
            console.warn('WebSocket server connection failed')
          }
        },
        onReady: () => {
          const isReconnect = hasEverConnected.value

          hasEverConnected.value = true
          connected.value = true
          flush()
          initializeListeners()

          if (isReconnect) {
            for (const callback of reconnectedCallbacks) {
              try {
                callback()
              }
              catch (error) {
                console.error('Error in reconnected callback:', error)
              }
            }
          }
          if (isReconnect && import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('WebSocket server connection re-established')
          }
        },
      })

      client.value.onEvent('module:authenticated', (event) => {
        if (event.data.authenticated) {
          if (!hasEverConnected.value) {
            // First connection can flush immediately after authentication.
            connected.value = true
            flush()
            initializeListeners()
          }
          // On reconnect, wait for onReady (after announce) before flushing business events.
          resolve()

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

  function onReconnected(callback: () => void) {
    reconnectedCallbacks.add(callback)

    return () => {
      reconnectedCallbacks.delete(callback)
    }
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
    hasEverConnected.value = false
    connected.value = false
    initializing.value = null
    clearListeners()
    replayableEvents.clear()

    if (client.value) {
      client.value.close()
      client.value = undefined
    }
  }

  watch([websocketUrl, websocketAuthToken], ([newUrl, newToken], [oldUrl, oldToken]) => {
    if (newUrl === oldUrl && newToken === oldToken)
      return

    if (!hasReconnectableWebSocketScheme(newUrl))
      return

    if (client.value || initializing.value) {
      dispose()
      void initialize()
    }
  })

  return {
    connected,
    pendingSendCount,
    websocketAuthToken,
    websocketUrl,
    ensureConnected,

    initialize,
    send,
    sendContextUpdate,
    onContextUpdate,
    onEvent,
    onReconnected,
    getPendingSendSnapshot: () => [...pendingSend.value],
    dispose,
  }
})
