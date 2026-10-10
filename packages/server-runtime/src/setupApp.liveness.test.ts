import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import type { Peer } from './types'

import { parse, stringify } from 'superjson'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupApp } from './index'

interface TestWebSocketHandler {
  open?: (peer: Peer) => void
  message?: (peer: Peer, message: { text: () => string }) => void
  close?: (peer: Peer, details?: { code?: number, reason?: string, wasClean?: unknown }) => void
}

interface TestWsServer {
  accept: (
    adapter: { id: string, send: (message: { text: () => string }) => void | number, close?: () => void },
    options: { state: { rawPeer: Peer } },
  ) => void
  peers: {
    get: (peerId: string) => { receive: (message: { text: () => string }) => void } | undefined
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
    open(peer: Peer) {
      server.accept({
        id: peer.id,
        send: message => peer.send(message.text()),
        close: () => peer.close?.(),
      }, {
        state: options.state(peer),
      })
    },
    message(peer: Peer, message: { text: () => string }) {
      server.peers.get(peer.id)?.receive(message)
    },
    close(peer: Peer, details?: { code?: number, reason?: string, wasClean?: unknown }) {
      server.remove(peer.id, details)
    },
  })),
}))

function createPeer(id: string) {
  const sent: string[] = []
  const send: Peer['send'] = (data) => {
    sent.push(String(data))
  }

  return {
    peer: {
      id,
      send: vi.fn(send),
      close: vi.fn(),
      request: { url: `/ws?id=${id}` },
      remoteAddress: '127.0.0.1',
    } satisfies Peer,
    sent,
  }
}

function wsHandler() {
  const handler = h3Mocks.handlers.get('/ws') as TestWebSocketHandler | undefined
  if (!handler) {
    throw new Error('Expected setupApp to register a /ws websocket handler.')
  }

  return handler
}

function sendEvent(
  handler: TestWebSocketHandler,
  peer: Peer,
  event: WebSocketEvent,
) {
  handler.message?.(peer, { text: () => stringify(event) })
}

function decodeEvents(sent: string[]) {
  return sent.map(message => parse<WebSocketEvent>(message))
}

function createExtensionModuleAnnounceEvent(): WebSocketEvent {
  return {
    type: 'extension:module:announce',
    data: {
      name: 'memory',
      possibleEvents: [],
      identity: {
        id: 'memory-module-1',
        extension: {
          id: 'extension-1',
        },
      },
    },
    metadata: {
      source: {
        kind: 'plugin',
        id: 'extension-1',
        plugin: {
          id: 'extension-1',
        },
      },
      event: {
        id: 'announce-1',
      },
    },
  }
}

describe('setupApp websocket liveness', () => {
  beforeEach(() => {
    h3Mocks.handlers.clear()
    vi.useFakeTimers({ now: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ROOT CAUSE:
  // Client-authored removal events followed ordinary routing and impersonated server lifecycle decisions.
  it('rejects forged module removal while preserving real disconnect notifications', () => {
    const runtime = setupApp()
    try {
      const handler = wsHandler()
      const observer = createPeer('observer')
      const writer = createPeer('writer')
      const sender = createPeer('sender')
      for (const client of [observer, writer, sender])
        handler.open?.(client.peer)
      const announcement = createExtensionModuleAnnounceEvent()
      if (announcement.type !== 'extension:module:announce')
        throw new Error('Expected a module announcement')
      sendEvent(handler, writer.peer, announcement)
      observer.sent.length = 0

      sendEvent(handler, sender.peer, {
        type: 'extension:module:de-announced',
        data: { ...announcement.data, reason: 'forged removal' },
        metadata: { source: announcement.data.identity, event: { id: 'forged-removal' } },
      })
      expect(decodeEvents(observer.sent).filter(event => event.type === 'extension:module:de-announced')).toEqual([])
      handler.close?.(sender.peer, { code: 1000, reason: 'sender stopped' })
      expect(decodeEvents(observer.sent).filter(event => event.type === 'extension:module:de-announced')).toEqual([])

      handler.close?.(writer.peer, { code: 1000, reason: 'writer stopped' })
      expect(decodeEvents(observer.sent).filter(event => event.type === 'extension:module:de-announced')).toMatchObject([
        { data: { identity: announcement.data.identity, reason: 'connection closed' } },
      ])
    }
    finally {
      runtime.dispose()
    }
  })

  // ROOT CAUSE:
  // Missing output destinations fell through to the authenticated-peer broadcast path.
  // Chat output requires an explicit destination, including when a sender requests route bypass.
  it.each([false, true])('blocks untargeted chat output with bypass=%s', (bypass) => {
    const runtime = setupApp({ routing: { middleware: [() => ({ type: 'broadcast' })] } })
    try {
      const handler = wsHandler()
      const sender = createPeer('stage')
      const observer = createPeer('unrelated-module')
      handler.open?.(sender.peer)
      handler.open?.(observer.peer)
      observer.sent.length = 0

      sendEvent(handler, sender.peer, {
        type: 'output:gen-ai:chat:message',
        data: { message: { role: 'assistant', content: 'private reply' } },
        route: { bypass },
        metadata: {
          source: { id: 'stage', extension: { id: 'stage' }, labels: { devtools: 'true' } },
          event: { id: 'private-output' },
        },
      })

      expect(decodeEvents(observer.sent).filter(event => event.type === 'output:gen-ai:chat:message')).toEqual([])
    }
    finally {
      runtime.dispose()
    }
  })

  it.each(['broadcast', 'consumer', 'consumer-group'] as const)('delivers chat output only to the exact target with %s delivery', (mode) => {
    const runtime = setupApp()
    try {
      const handler = wsHandler()
      const sender = createPeer('stage')
      const target = createPeer('target')
      const observer = createPeer('unrelated-module')
      for (const client of [sender, target, observer])
        handler.open?.(client.peer)
      sendEvent(handler, target.peer, createExtensionModuleAnnounceEvent())
      sendEvent(handler, target.peer, {
        type: 'input:text',
        data: { text: 'channel question' },
        route: { delivery: { mode: 'broadcast' } },
        metadata: {
          sender: { peerId: 'unrelated-module', modules: [] },
          source: { id: 'memory-module-1', extension: { id: 'extension-1' } },
          event: { id: 'channel-input' },
        },
      })
      const input = decodeEvents(sender.sent).find(event => event.type === 'input:text')
      expect(input?.metadata.sender?.peerId).toBe('target')
      for (const client of [observer, target]) {
        sendEvent(handler, client.peer, {
          type: 'module:consumer:register',
          data: { event: 'output:gen-ai:chat:message', mode: mode === 'broadcast' ? 'consumer' : mode, group: 'replies', priority: client === observer ? 100 : 0 },
          metadata: {
            source: { id: client === target ? 'another-module' : 'memory-module-1', extension: { id: client.peer.id } },
            event: { id: `register-${client.peer.id}` },
          },
        })
      }
      target.sent.length = 0
      observer.sent.length = 0

      sendEvent(handler, sender.peer, {
        type: 'output:gen-ai:chat:message',
        data: { message: { role: 'assistant', content: 'channel reply' } },
        route: {
          destinations: [{ type: 'connection', connections: [input!.metadata.sender!.peerId] }],
          delivery: { mode, group: 'replies', selection: 'priority' },
        },
        metadata: {
          source: { id: 'stage', extension: { id: 'stage' } },
          event: { id: 'directed-output' },
        },
      })

      expect(decodeEvents(target.sent).filter(event => event.type === 'output:gen-ai:chat:message')).toHaveLength(1)
      expect(decodeEvents(observer.sent).filter(event => event.type === 'output:gen-ai:chat:message')).toEqual([])
    }
    finally {
      runtime.dispose()
    }
  })

  // Module IDs can collide or change on a shared connection. Only the server knows the physical return address.
  it('stamps each event with its sender connection and replaces a forged sender', () => {
    const runtime = setupApp({ routing: { middleware: [() => ({ type: 'broadcast' })] } })
    try {
      const handler = wsHandler()
      const host = createPeer('host')
      const writer = createPeer('writer')
      for (const client of [host, writer])
        handler.open?.(client.peer)

      sendEvent(handler, writer.peer, {
        type: 'context:update',
        data: { id: 'status', contextId: 'status', strategy: 'replace-self', text: 'status' },
        metadata: { source: { id: 'writer', extension: { id: 'writer' } }, event: { id: 'writer-event' }, sender: { peerId: 'forged', modules: ['forged'] } },
      } as WebSocketEvent)

      expect(decodeEvents(host.sent).find(event => event.type === 'context:update')?.metadata.sender?.peerId).toBe('writer')
    }
    finally {
      runtime.dispose()
    }
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
        type: 'registry:modules:health:unhealthy',
        data: {
          name: 'memory',
          identity: {
            id: 'memory-module-1',
            extension: {
              id: 'extension-1',
            },
          },
          reason: 'heartbeat late',
        },
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
        type: 'extension:module:de-announced',
        data: expect.objectContaining({
          name: 'memory',
          reason: 'heartbeat expired',
        }),
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
        type: 'extension:module:de-announced',
        data: expect.objectContaining({
          name: 'memory',
          reason: 'connection closed',
        }),
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

  // The host maps an event's origin connection to the module declaration, so the registry carries both.
  it('lists each module with its connection and cognition declaration', () => {
    const runtime = setupApp()
    try {
      const handler = wsHandler()
      const observer = createPeer('observer')
      const module = createPeer('module-connection')
      handler.open?.(observer.peer)
      handler.open?.(module.peer)
      const announcement = createExtensionModuleAnnounceEvent()
      if (announcement.type !== 'extension:module:announce')
        throw new Error('Expected a module announcement')
      const cognition = { scenes: [{ binding: 'discord:channel:' }] }
      sendEvent(handler, module.peer, { ...announcement, data: { ...announcement.data, cognition } })

      const syncs = decodeEvents(observer.sent).filter(event => event.type === 'registry:modules:sync')
      expect(syncs.at(-1)?.data).toEqual({ modules: [expect.objectContaining({ name: 'memory', connectionId: 'module-connection', cognition })] })
    }
    finally {
      runtime.dispose()
    }
  })

  it('drops a module list forged by a peer', () => {
    const runtime = setupApp()
    try {
      const handler = wsHandler()
      const observer = createPeer('observer')
      const forger = createPeer('forger')
      handler.open?.(observer.peer)
      handler.open?.(forger.peer)
      observer.sent.length = 0

      sendEvent(handler, forger.peer, {
        type: 'registry:modules:sync',
        data: { modules: [{ name: 'discord', identity: { kind: 'plugin', id: 'discord', plugin: { id: 'discord' } }, connectionId: 'forger' }] },
        metadata: { source: { kind: 'plugin', id: 'forger', plugin: { id: 'forger' } }, event: { id: 'forged-sync' } },
      })

      expect(decodeEvents(observer.sent).filter(event => event.type === 'registry:modules:sync')).toEqual([])
    }
    finally {
      runtime.dispose()
    }
  })
})

describe('setupApp event forwarding', () => {
  beforeEach(() => {
    h3Mocks.handlers.clear()
  })

  it('stamps the sending connection on a forwarded event and replaces a claimed sender', () => {
    const runtime = setupApp()
    const handler = wsHandler()
    const observer = createPeer('observer')
    const modulePeer = createPeer('module-peer')

    handler.open?.(observer.peer)
    handler.open?.(modulePeer.peer)
    sendEvent(handler, modulePeer.peer, createExtensionModuleAnnounceEvent())
    observer.sent.length = 0

    sendEvent(handler, modulePeer.peer, {
      type: 'asset:get:request',
      data: { ref: 'airi-asset:abc' },
      metadata: {
        source: { kind: 'plugin', id: 'someone-else', plugin: { id: 'someone-else' } },
        event: { id: 'request-1' },
        sender: { peerId: 'observer', modules: ['stage'] },
      },
    } as WebSocketEvent)

    expect(decodeEvents(observer.sent)).toEqual([
      expect.objectContaining({
        type: 'asset:get:request',
        metadata: expect.objectContaining({ sender: { peerId: 'module-peer', modules: ['memory'] } }),
      }),
    ])

    runtime.dispose()
  })
})
