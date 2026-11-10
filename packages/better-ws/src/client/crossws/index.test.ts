import type { CrossWsConstructor } from '.'

import { describe, expect, it, vi } from 'vitest'

import { createCrossWsConnector } from '.'
import { createClient } from '../..'

// ROOT CAUSE:
//
// The mock narrowed message data to two types, but CrossWS exposes unknown data.
// This made the mock constructor incompatible with the production connector contract.
//
// The mock now derives its message event from the public constructor contract.
type CrossWsMessageEvent = Parameters<NonNullable<InstanceType<CrossWsConstructor>['onmessage']>>[0]

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static readonly CLOSED = 3
    static readonly CLOSING = 2
    static readonly CONNECTING = 0
    static readonly instances: MockWebSocket[] = []
    static readonly OPEN = 1

    onclose?: (event: { code?: number, reason?: string, wasClean?: boolean }) => void
    onerror?: (event: unknown | { error?: Error }) => void
    onmessage?: (event: CrossWsMessageEvent) => void
    onopen?: () => void
    ping = vi.fn()
    pong = vi.fn()

    readyState = MockWebSocket.CONNECTING

    readonly sent: string[] = []

    constructor(readonly url: string | URL, readonly protocols?: string | string[]) {
      MockWebSocket.instances.push(this)
    }

    close() {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.({ code: 1000, reason: 'closed', wasClean: true })
    }

    send(message: string) {
      this.sent.push(message)
    }
  }

  return { MockWebSocket }
})

function lastSocket() {
  const socket = MockWebSocket.instances.at(-1)
  if (!socket) {
    throw new Error('Expected a mock websocket instance.')
  }

  return socket
}

describe('createCrossWsConnector', () => {
  it('connects and forwards text messages through better-ws', async () => {
    const client = createClient({
      connector: createCrossWsConnector({
        url: 'ws://localhost:6121/ws',
        wsConstructor: MockWebSocket,
      }),
      reconnect: false,
    })
    const messages: string[] = []
    client.onMessage(({ message }) => {
      messages.push(message)
    })

    const connecting = client.connect()
    const socket = lastSocket()
    socket.readyState = MockWebSocket.OPEN
    socket.onopen?.()
    await connecting

    expect(client.state).toBe('ready')

    client.send('hello')
    socket.onmessage?.({ data: 'world' })

    expect(socket.sent).toEqual(['hello'])
    expect(messages).toEqual(['world'])
  })

  it('reports non-text messages as connector errors', async () => {
    const onFailed = vi.fn()
    const client = createClient({
      connector: createCrossWsConnector({
        url: 'ws://localhost:6121/ws',
        wsConstructor: MockWebSocket,
      }),
      reconnect: {
        onFailed,
        retries: 0,
      },
    })

    const connecting = client.connect()
    const socket = lastSocket()
    socket.readyState = MockWebSocket.OPEN
    socket.onopen?.()
    await connecting

    socket.onmessage?.({ data: new ArrayBuffer(1) })

    expect(onFailed).toHaveBeenCalledWith(expect.any(TypeError))
  })

  it('rejects when the socket closes before opening', async () => {
    const client = createClient({
      connector: createCrossWsConnector({
        url: 'ws://localhost:6121/ws',
        wsConstructor: MockWebSocket,
      }),
      reconnect: false,
    })

    const connecting = client.connect()
    const socket = lastSocket()
    socket.onclose?.({ code: 1006, reason: 'aborted', wasClean: false })

    await expect(connecting).rejects.toThrow('closed before opening')
  })
})
