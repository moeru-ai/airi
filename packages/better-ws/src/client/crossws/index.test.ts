import { describe, expect, it, vi } from 'vitest'

import { createCrossWsConnector } from '.'
import { createClient } from '../..'

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    static readonly instances: MockWebSocket[] = []

    readonly sent: string[] = []
    readyState = MockWebSocket.CONNECTING
    onclose?: (event: { code?: number, reason?: string, wasClean?: boolean }) => void
    onerror?: (event: { error?: Error } | unknown) => void
    onmessage?: (event: { data: string | ArrayBuffer }) => void
    onopen?: () => void

    constructor(readonly url: string | URL, readonly protocols?: string | string[]) {
      MockWebSocket.instances.push(this)
    }

    send(message: string) {
      this.sent.push(message)
    }

    close() {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.({ code: 1000, reason: 'closed', wasClean: true })
    }

    ping = vi.fn()
    pong = vi.fn()
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
        retries: 0,
        onFailed,
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
