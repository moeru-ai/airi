import type { ClientConnection, ClientConnector, ClientEvents } from '@proj-airi/better-ws'
import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEventOptionalSource, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { ExtensionPeerClient } from '../src/extension-peer'

import { describe, expect, it, vi } from 'vitest'

import { createWebSocketExtensionPeer } from '../src/extension-peer'

type Listener = (data: WebSocketBaseEvent<string, unknown>) => Promise<void> | void

class FakeClient implements ExtensionPeerClient {
  readonly close = vi.fn(() => {})
  readonly connect = vi.fn(async () => {})
  readonly listeners = new Map<keyof WebSocketEvents, Set<Listener>>()
  readonly sent: WebSocketEventOptionalSource[] = []

  onEvent<E extends keyof WebSocketEvents>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents[E]>) => Promise<void> | void,
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

  send(data: WebSocketEventOptionalSource): boolean {
    this.sent.push(data)
    return true
  }

  sendOrThrow(data: WebSocketEventOptionalSource): void {
    this.sent.push(data)
  }
}

class FakeConnector implements ClientConnector<WebSocketEvent> {
  readonly attempts: Array<{
    connection: ClientConnection<WebSocketEvent>
    events: ClientEvents<WebSocketEvent>
  }> = []

  connect(events: ClientEvents<WebSocketEvent>) {
    const connection: ClientConnection<WebSocketEvent> = {
      close: () => events.close({ code: 1000, reason: 'closed', wasClean: true }),
      send: () => true,
    }

    this.attempts.push({ connection, events })
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
      client: fakeClient,
      extension: {
        id: 'airi-extension-chess',
        sessionId: 'session-1',
        version: '1.0.0',
      },
    })

    await peer.connect()
    peer.authenticatePeer({ peerId: 'peer-1', token: 'secret' })
    peer.announceExtension()

    expect(fakeClient.connect).toHaveBeenCalled()
    expect(fakeClient.sent.map(event => event.type)).toEqual([
      'peer:authenticate',
      'extension:announce',
    ])
    expect(fakeClient.sent[0]).toMatchObject({
      data: {
        peerId: 'peer-1',
        token: 'secret',
      },
      type: 'peer:authenticate',
    })
    expect(fakeClient.sent[1]).toMatchObject({
      data: {
        identity: {
          id: 'airi-extension-chess',
          sessionId: 'session-1',
          version: '1.0.0',
        },
      },
      type: 'extension:announce',
    })
  })

  it('announces extension modules under the owning extension identity', () => {
    const fakeClient = new FakeClient()
    const peer = createWebSocketExtensionPeer({
      client: fakeClient,
      extension: {
        id: 'airi-extension-chess',
        sessionId: 'session-1',
      },
    })

    peer.announceModule({
      id: 'chess-gamelet',
      name: 'Chess Gamelet',
      possibleEvents: [],
    })

    expect(fakeClient.sent[0]).toMatchObject({
      data: {
        identity: {
          extension: {
            id: 'airi-extension-chess',
            sessionId: 'session-1',
          },
          id: 'chess-gamelet',
        },
        name: 'Chess Gamelet',
        possibleEvents: [],
      },
      type: 'extension:module:announce',
    })
  })

  it('creates a manual peer client without auto-connect or auto-reconnect by default', async () => {
    const connector = new FakeConnector()
    const peer = createWebSocketExtensionPeer({
      clientOptions: {
        connector,
      },
      extension: {
        id: 'airi-extension-chess',
        sessionId: 'session-1',
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
