import type { ClientConnection, ClientConnector, ClientEvents } from '@proj-airi/better-ws'
import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEventOptionalSource, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { ExtensionPeerClient } from '../src/extension-peer'

import { describe, expect, it, vi } from 'vitest'

import { createWebSocketExtensionPeer } from '../src/extension-peer'

type Listener = (data: WebSocketBaseEvent<string, unknown>) => void | Promise<void>

class FakeClient implements ExtensionPeerClient {
  readonly sent: WebSocketEventOptionalSource[] = []
  readonly connect = vi.fn(async () => {})
  readonly close = vi.fn(() => {})
  readonly listeners = new Map<keyof WebSocketEvents, Set<Listener>>()

  send(data: WebSocketEventOptionalSource): boolean {
    this.sent.push(data)
    return true
  }

  sendOrThrow(data: WebSocketEventOptionalSource): void {
    this.sent.push(data)
  }

  onEvent<E extends keyof WebSocketEvents>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents[E]>) => void | Promise<void>,
  ) {
    let listeners = this.listeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(event, listeners)
    }

    const listener = callback as Listener
    listeners.add(listener)

    return () => {
      listeners?.delete(listener)
    }
  }
}

class FakeConnector implements ClientConnector<WebSocketEvent> {
  readonly attempts: Array<{
    events: ClientEvents<WebSocketEvent>
    connection: ClientConnection<WebSocketEvent>
  }> = []

  connect(events: ClientEvents<WebSocketEvent>) {
    const connection: ClientConnection<WebSocketEvent> = {
      send: () => true,
      close: () => events.close({ code: 1000, reason: 'closed', wasClean: true }),
    }

    this.attempts.push({ events, connection })
    return connection
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('websocket extension peer', () => {
  it('authenticates the websocket peer separately from the extension session', async () => {
    const fakeClient = new FakeClient()
    const peer = createWebSocketExtensionPeer({
      extension: {
        id: 'airi-extension-chess',
        version: '1.0.0',
        sessionId: 'session-1',
      },
      client: fakeClient,
    })

    await peer.connect()
    peer.authenticatePeer({ token: 'secret', peerId: 'peer-1' })
    peer.announceExtension()

    expect(fakeClient.connect).toHaveBeenCalled()
    expect(fakeClient.sent.map(event => event.type)).toEqual([
      'peer:authenticate',
      'extension:announce',
    ])
    expect(fakeClient.sent[0]).toMatchObject({
      type: 'peer:authenticate',
      data: {
        token: 'secret',
        peerId: 'peer-1',
      },
    })
    expect(fakeClient.sent[1]).toMatchObject({
      type: 'extension:announce',
      data: {
        identity: {
          id: 'airi-extension-chess',
          version: '1.0.0',
          sessionId: 'session-1',
        },
      },
    })
  })

  it('announces extension modules under the owning extension identity', () => {
    const fakeClient = new FakeClient()
    const peer = createWebSocketExtensionPeer({
      extension: {
        id: 'airi-extension-chess',
        sessionId: 'session-1',
      },
      client: fakeClient,
    })

    peer.announceModule({
      id: 'chess-gamelet',
      name: 'Chess Gamelet',
      possibleEvents: [],
    })

    expect(fakeClient.sent[0]).toMatchObject({
      type: 'extension:module:announce',
      data: {
        name: 'Chess Gamelet',
        identity: {
          id: 'chess-gamelet',
          extension: {
            id: 'airi-extension-chess',
            sessionId: 'session-1',
          },
        },
        possibleEvents: [],
      },
    })
  })

  it('creates a manual peer client without auto-connect or auto-reconnect by default', async () => {
    const connector = new FakeConnector()
    const peer = createWebSocketExtensionPeer({
      extension: {
        id: 'airi-extension-chess',
        sessionId: 'session-1',
      },
      clientOptions: {
        connector,
      },
    })

    expect(connector.attempts).toHaveLength(0)

    await peer.connect()
    expect(connector.attempts).toHaveLength(1)

    connector.attempts[0]!.connection.close()
    await flushMicrotasks()

    expect(connector.attempts).toHaveLength(1)
  })
})
