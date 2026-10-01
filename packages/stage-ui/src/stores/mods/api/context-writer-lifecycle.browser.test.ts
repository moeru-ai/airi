import type { ClientConnector, ClientEvents, ExtensionModuleIdentity, WebSocketEvent } from '@proj-airi/server-sdk'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { ContextUpdateStrategy, parseEvent, stringifyEvent, WebSocketEventSource } from '@proj-airi/server-sdk'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatContextStore } from '../../chat/context-store'
import { useModsServerChannelStore } from './channel-server'
import { useContextBridgeStore } from './context-bridge'

const serverMetadata = {
  source: { kind: 'plugin' as const, plugin: { id: WebSocketEventSource.Server }, id: 'server-1' },
  event: { id: 'server-event' },
}

/** Simulates only the network boundary. Stores, protocol parsing, and SDK dispatch remain real. */
class ServerTransport implements ClientConnector<string> {
  private events?: ClientEvents<string>

  connect(events: ClientEvents<string>) {
    this.events = events
    return {
      send: (text: string) => {
        const event = parseEvent(text)
        if (event.type === 'module:authenticate') {
          queueMicrotask(() => this.emit({ type: 'module:authenticated', data: { authenticated: true }, metadata: serverMetadata }))
        }
        else if (event.type === 'extension:module:announce') {
          queueMicrotask(() => {
            this.emit({ type: 'module:authenticated', data: { authenticated: true }, metadata: serverMetadata })
            this.emit({ type: 'extension:module:announced', data: event.data, metadata: serverMetadata })
          })
        }
        return true
      },
      close: () => events.close({ code: 1000, reason: 'test disposed', wasClean: true }),
    }
  }

  emit(event: WebSocketEvent) {
    if (!this.events)
      throw new Error('Expected an active transport')
    this.events.message(stringifyEvent(event))
  }
}

describe('context writer lifecycle', () => {
  let pinia: ReturnType<typeof createPinia>
  let transport: ServerTransport
  let app: ReturnType<typeof createApp>
  let container: HTMLDivElement
  let bridge: ReturnType<typeof useContextBridgeStore> | undefined

  beforeEach(async () => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    bridge = undefined
    container = document.createElement('div')
    document.body.append(container)
    app = createApp({
      setup() {
        bridge = useContextBridgeStore(pinia)
        return () => null
      },
    })
    app.use(pinia).use(PiniaColada).use(createI18n({ legacy: false, locale: 'en', messages: { en } })).mount(container)
    transport = new ServerTransport()
    await useModsServerChannelStore(pinia).initialize({ connector: () => transport })
    bridge = useContextBridgeStore(pinia)
    await bridge.initialize()
  })

  afterEach(async () => {
    await bridge?.dispose()
    useModsServerChannelStore(pinia).dispose()
    app.unmount()
    container.remove()
    disposePinia(pinia)
    localStorage.clear()
  })

  function publish(identity: ExtensionModuleIdentity, id: string) {
    transport.emit({
      type: 'context:update',
      data: { id, contextId: 'status', strategy: ContextUpdateStrategy.ReplaceSelf, text: 'online', ttlMs: 60_000 },
      metadata: { source: identity, event: { id } },
    })
  }

  // ROOT CAUSE:
  // The bridge ignored module removal, so disconnected writers stayed visible until their observation TTL expired.
  it('removes only the departing extension module before TTL expiry', async () => {
    const writer = { extension: { id: 'weather' }, id: 'station' }
    const sibling = { extension: { id: 'other-weather' }, id: 'station' }
    publish(writer, 'writer-context')
    publish(sibling, 'sibling-context')
    const contexts = useChatContextStore(pinia)
    let removals = 0
    contexts.$onAction(({ name, after }) => {
      if (name === 'removeContextWriter')
        after(() => removals++)
    })
    await vi.waitFor(() => expect(Object.keys(contexts.getContextsSnapshot())).toHaveLength(2))

    const removal: WebSocketEvent = {
      type: 'extension:module:de-announced',
      data: { name: 'weather', identity: writer, possibleEvents: [], reason: 'connection closed' },
      metadata: serverMetadata,
    }
    transport.emit(removal)

    await vi.waitFor(() => expect(removals).toBe(1))
    await vi.waitFor(() => expect(Object.keys(contexts.getContextsSnapshot())).toEqual(['other-weather:station']))
    expect(contexts.contextHistory).toHaveLength(2)
    publish(writer, 'reconnected-context')
    await vi.waitFor(() => expect(contexts.activeContexts['weather:station']?.[0]?.id).toBe('reconnected-context'))
    transport.emit(removal)
    await vi.waitFor(() => expect(removals).toBe(2))
    expect(contexts.writerRemovalHistory).toHaveLength(1)
    expect(contexts.activeContexts['weather:station']?.[0]?.id).toBe('reconnected-context')
  })
})
