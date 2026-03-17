import type { ContextUpdate, WebSocketBaseEvent, WebSocketEvent, WebSocketEventOptionalSource, WebSocketEvents } from '@proj-airi/server-sdk'

import { Client, WebSocketEventSource } from '@proj-airi/server-sdk'
import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { useWebSocketInspectorStore } from '../../devtools/websocket-inspector'

export const useModsServerChannelStore = defineStore('mods:channels:proj-airi:server', () => {
  interface OnlineModuleSummary {
    name: string
    index?: number
    moduleId?: string
    pluginId?: string
  }

  const connected = ref(false)
  const connectedUrl = ref<string | null>(null)
  const connectedProtocol = ref<'wss' | 'ws' | null>(null)
  const client = ref<Client>()
  const initializing = ref<Promise<void> | null>(null)
  const pendingSend = ref<Array<WebSocketEvent>>([])
  const listenersInitialized = ref(false)
  const listenerDisposers = ref<Array<() => void>>([])
  const onlineModules = ref<OnlineModuleSummary[]>([])

  const defaultWebSocketUrl = import.meta.env.VITE_AIRI_WS_URL || 'localhost:6121/ws'
  const websocketUrl = useLocalStorage('settings/connection/websocket-url', defaultWebSocketUrl)
  const websocketProtocolCache = useLocalStorage<Record<string, 'wss' | 'ws'>>('settings/connection/websocket-protocol-cache', {})

  const basePossibleEvents: Array<keyof WebSocketEvents> = [
    'context:update',
    'error',
    'module:announce',
    'module:configure',
    'module:authenticated',
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

  function normalizeWsUrl(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed)
      return null

    const withProtocol = /^wss?:\/\//i.test(trimmed)
      ? trimmed
      : /^https?:\/\//i.test(trimmed)
        ? trimmed.replace(/^http/i, 'ws')
        : `ws://${trimmed}`

    try {
      const parsed = new URL(withProtocol)
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:')
        return null

      if (!parsed.pathname || parsed.pathname === '/')
        parsed.pathname = '/ws'

      return parsed
    }
    catch {
      return null
    }
  }

  function toEndpointKey(url: URL) {
    return `${url.host}${url.pathname}${url.search}`
  }

  function resolveCandidateUrls(rawValue: string) {
    const parsed = normalizeWsUrl(rawValue) ?? normalizeWsUrl(defaultWebSocketUrl)
    if (!parsed) {
      return ['wss://localhost:6121/ws', 'ws://localhost:6121/ws']
    }

    const endpointKey = toEndpointKey(parsed)
    const explicitProtocol = /^wss?:\/\//i.test(rawValue.trim())
    const cachedProtocol = websocketProtocolCache.value?.[endpointKey]
    const currentProtocol = parsed.protocol === 'wss:' ? 'wss' : 'ws'
    const primaryProtocol = cachedProtocol ?? (explicitProtocol ? currentProtocol : 'wss')
    const secondaryProtocol = primaryProtocol === 'wss' ? 'ws' : 'wss'
    const originAndPath = `${parsed.host}${parsed.pathname}${parsed.search}`

    return [`${primaryProtocol}://${originAndPath}`, `${secondaryProtocol}://${originAndPath}`]
  }

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
        url: resolveCandidateUrls(websocketUrl.value || defaultWebSocketUrl),
        token: options?.token,
        possibleEvents,
        onAnyMessage: (event: WebSocketEvent) => {
          useWebSocketInspectorStore().add('incoming', event)
        },
        onAnySend: (event: WebSocketEvent) => {
          useWebSocketInspectorStore().add('outgoing', event)
        },
        onError: () => {
          connected.value = false
          initializing.value = null
          clearListeners()
        },
        onClose: () => {
          connected.value = false
          connectedUrl.value = null
          connectedProtocol.value = null
          initializing.value = null
          clearListeners()

          console.warn('WebSocket server connection closed')
        },
        onConnected: (url: string) => {
          connectedUrl.value = url
          connectedProtocol.value = url.startsWith('wss://') ? 'wss' : 'ws'
          const parsed = normalizeWsUrl(url)
          if (parsed) {
            websocketProtocolCache.value = {
              ...websocketProtocolCache.value,
              [toEndpointKey(parsed)]: connectedProtocol.value ?? 'ws',
            }
          }
        },
      } as any)

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
    onlineModules.value = []
  }

  function initializeListeners() {
    if (!client.value)
    // No-op for now; keep placeholder for future shared listeners.

      return

    if (listenersInitialized.value) {
      return
    }

    const onModuleAnnounce = (event: WebSocketBaseEvent<'module:announce', WebSocketEvents['module:announce']>) => {
      const identity = event.data?.identity
      const next: OnlineModuleSummary = {
        name: event.data.name,
        index: undefined,
        moduleId: identity?.id,
        pluginId: identity?.plugin?.id,
      }

      const nextModules = onlineModules.value.filter(module => module.name !== next.name)
      nextModules.push(next)
      onlineModules.value = nextModules
    }

    const onRegistryModulesSync = (event: WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents['registry:modules:sync']>) => {
      onlineModules.value = event.data.modules.map(module => ({
        name: module.name,
        index: module.index,
        moduleId: module.identity.id,
        pluginId: module.identity.plugin.id,
      }))
    }

    client.value.onEvent('module:announce', onModuleAnnounce as any)
    client.value.onEvent('registry:modules:sync', onRegistryModulesSync as any)

    listenerDisposers.value.push(() => {
      client.value?.offEvent('module:announce', onModuleAnnounce as any)
      client.value?.offEvent('registry:modules:sync', onRegistryModulesSync as any)
    })

    listenersInitialized.value = true
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
    connectedUrl.value = null
    connectedProtocol.value = null
    initializing.value = null
    onlineModules.value = []
  }

  function hasModule(moduleName: string) {
    return onlineModules.value.some(module => module.name === moduleName || module.pluginId === moduleName)
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
    connectedUrl,
    connectedProtocol,
    ensureConnected,
    onlineModules,
    hasModule,

    initialize,
    send,
    sendContextUpdate,
    onContextUpdate,
    onEvent,
    dispose,
  }
})
