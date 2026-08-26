import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import type { Peer } from './types'

import { parse, stringify } from 'superjson'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupApp } from './index'

interface TestWebSocketHandler {
  close?: (peer: Peer, details?: { code?: number, reason?: string, wasClean?: unknown }) => void
  message?: (peer: Peer, message: { text: () => string }) => void
  open?: (peer: Peer) => void
}

interface TestWsServer {
  accept: (
    adapter: { close?: () => void, id: string, send: (message: { text: () => string }) => number | void },
    options: { state: { rawPeer: Peer } },
  ) => void
  peers: {
    get: (peerId: string) => undefined | { receive: (message: { text: () => string }) => void }
  }
  remove: (peerId: string, details?: { code?: number, reason?: string, wasClean?: unknown }) => void
}

const h3Mocks = vi.hoisted(() => ({
  handlers: new Map<string, unknown>(),
}))

vi.mock('h3', () => ({
  H3: class {
    get(path: string, handler: unknown) {
      h3Mocks.handlers.set(path, handler)
    }
  },
}))

vi.mock('@proj-airi/better-ws/server/h3', () => ({
  toH3Handler: vi.fn((server: TestWsServer, options: { state: (peer: Peer) => { rawPeer: Peer } }) => ({
    close(peer: Peer, details?: { code?: number, reason?: string, wasClean?: unknown }) {
      server.remove(peer.id, details)
    },
    message(peer: Peer, message: { text: () => string }) {
      server.peers.get(peer.id)?.receive(message)
    },
    open(peer: Peer) {
      server.accept({
        close: () => peer.close?.(),
        id: peer.id,
        send: message => peer.send(message.text()),
      }, {
        state: options.state(peer),
      })
    },
  })),
}))

function createExtensionModuleAnnounceEvent(): WebSocketEvent {
  return {
    data: {
      identity: {
        extension: {
          id: 'extension-1',
        },
        id: 'memory-module-1',
      },
      name: 'memory',
      possibleEvents: [],
    },
    metadata: {
      event: {
        id: 'announce-1',
      },
      source: {
        id: 'extension-1',
        kind: 'plugin',
        plugin: {
          id: 'extension-1',
        },
      },
    },
    type: 'extension:module:announce',
  }
}

function createPeer(id: string) {
  const sent: string[] = []
  const send: Peer['send'] = (data) => {
    sent.push(String(data))
  }

  return {
    peer: {
      close: vi.fn(),
      id,
      remoteAddress: '127.0.0.1',
      request: { url: `/ws?id=${id}` },
      send: vi.fn(send),
    } satisfies Peer,
    sent,
  }
}

function decodeEvents(sent: string[]) {
  return sent.map(message => parse<WebSocketEvent>(message))
}

function sendEvent(
  handler: TestWebSocketHandler,
  peer: Peer,
  event: WebSocketEvent,
) {
  handler.message?.(peer, { text: () => stringify(event) })
}

function wsHandler() {
  const handler = h3Mocks.handlers.get('/ws') as TestWebSocketHandler | undefined
  if (!handler) {
    throw new Error('Expected setupApp to register a /ws websocket handler.')
  }

  return handler
}

describe('setupApp websocket liveness', () => {
  beforeEach(() => {
    h3Mocks.handlers.clear()
    vi.useFakeTimers({ now: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('broadcasts extension module unhealthy events from better-ws liveness checks', () => {
    const runtime = setupApp({ heartbeat: { readTimeout: 20_000 } })
    const handler = wsHandler()
    const observer = createPeer('observer')
    const modulePeer = createPeer('module-peer')

    handler.open?.(observer.peer)
    handler.open?.(modulePeer.peer)
    sendEvent(handler, modulePeer.peer, createExtensionModuleAnnounceEvent())
    observer.sent.length = 0

    vi.advanceTimersByTime(25_000)

    expect(decodeEvents(observer.sent)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data: {
          identity: {
            extension: {
              id: 'extension-1',
            },
            id: 'memory-module-1',
          },
          name: 'memory',
          reason: 'heartbeat late',
        },
        type: 'registry:modules:health:unhealthy',
      }),
    ]))

    runtime.dispose()
  })

  it('de-announces expired extension modules when better-ws removes stale peers', () => {
    const runtime = setupApp({ heartbeat: { readTimeout: 20_000 } })
    const handler = wsHandler()
    const observer = createPeer('observer')
    const modulePeer = createPeer('module-peer')

    handler.open?.(observer.peer)
    handler.open?.(modulePeer.peer)
    sendEvent(handler, modulePeer.peer, createExtensionModuleAnnounceEvent())
    observer.sent.length = 0

    vi.advanceTimersByTime(25_000)
    handler.message?.(observer.peer, { text: () => 'pong' })
    observer.sent.length = 0
    vi.advanceTimersByTime(25_000)

    expect(modulePeer.peer.close).toHaveBeenCalledOnce()
    expect(decodeEvents(observer.sent)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'memory',
          reason: 'heartbeat expired',
        }),
        type: 'extension:module:de-announced',
      }),
    ]))

    runtime.dispose()
  })

  it('de-announces extension modules before accepting a same-id reconnect', () => {
    const runtime = setupApp({ heartbeat: { readTimeout: 20_000 } })
    const handler = wsHandler()
    const observer = createPeer('observer')
    const firstModulePeer = createPeer('module-peer')
    const secondModulePeer = createPeer('module-peer')

    handler.open?.(observer.peer)
    handler.open?.(firstModulePeer.peer)
    sendEvent(handler, firstModulePeer.peer, createExtensionModuleAnnounceEvent())
    observer.sent.length = 0

    handler.open?.(secondModulePeer.peer)

    expect(decodeEvents(observer.sent)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'memory',
          reason: 'connection closed',
        }),
        type: 'extension:module:de-announced',
      }),
    ]))

    runtime.dispose()
  })

  it('closes each raw peer once during runtime disposal', () => {
    const runtime = setupApp({ heartbeat: { readTimeout: 20_000 } })
    const handler = wsHandler()
    const peer = createPeer('peer-1')

    handler.open?.(peer.peer)
    runtime.dispose()

    expect(peer.peer.close).toHaveBeenCalledOnce()
  })
})
