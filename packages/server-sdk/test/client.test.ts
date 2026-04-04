import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import superjson from 'superjson'

import { afterEach, describe, expect, it, vi } from 'vitest'

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  static instances: MockWebSocket[] = []

  readonly sent: string[] = []
  readyState = MockWebSocket.CONNECTING
  onclose?: () => void
  onerror?: (event: { error?: Error }) => void
  onmessage?: (event: { data: string }) => void
  onopen?: () => void

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  ping() {}
  pong() {}
}

class InjectedMockWebSocket extends MockWebSocket {
  static instances: InjectedMockWebSocket[] = []

  constructor(url: string) {
    super(url)
    InjectedMockWebSocket.instances.push(this)
  }
}

vi.mock('crossws/websocket', () => ({
  default: MockWebSocket,
}))

const { Client } = await import('../src/client')

function lastSocket() {
  const socket = MockWebSocket.instances.at(-1)
  if (!socket) {
    throw new Error('No mock websocket instance created')
  }

  return socket
}

function parseSent(socket: MockWebSocket, index = -1) {
  const payload = socket.sent.at(index)
  if (!payload) {
    throw new Error(`No sent payload at index ${index}`)
  }

  return superjson.parse<WebSocketEvent>(payload)
}

function emitOpen(socket: MockWebSocket) {
  socket.readyState = MockWebSocket.OPEN
  socket.onopen?.()
}

function emitMessage(socket: MockWebSocket, event: WebSocketEvent) {
  socket.onmessage?.({
    data: superjson.stringify(event),
  })
}

afterEach(() => {
  MockWebSocket.instances.length = 0
  InjectedMockWebSocket.instances.length = 0
  vi.useRealTimers()
})

describe('client', () => {
  it('resolves connect only after authentication and self announcement', async () => {
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
      token: 'secret',
    })

    const connected = client.connect()
    const socket = lastSocket()

    emitOpen(socket)

    expect(parseSent(socket)).toMatchObject({
      type: 'module:authenticate',
      data: { token: 'secret' },
    })

    emitMessage(socket, {
      type: 'module:authenticated',
      data: { authenticated: true },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'auth-1' },
      },
    })

    const announceEvent = parseSent(socket)
    expect(announceEvent).toMatchObject({
      type: 'module:announce',
      data: { name: 'test-plugin' },
    })

    emitMessage(socket, {
      type: 'module:announced',
      data: {
        name: 'test-plugin',
        identity: announceEvent.data.identity,
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'announce-1' },
      },
    })

    await expect(connected).resolves.toBeUndefined()
    expect(client.connectionStatus).toBe('ready')
    expect(client.isReady).toBe(true)
  })

  it('fails terminally on invalid token', async () => {
    const client = new Client({
      autoConnect: false,
      autoReconnect: true,
      name: 'test-plugin',
      token: 'wrong-token',
    })

    const connected = client.connect()
    const socket = lastSocket()

    emitOpen(socket)
    emitMessage(socket, {
      type: 'error',
      data: { message: 'invalid token' },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'error-1' },
      },
    })

    await expect(connected).rejects.toThrow('invalid token')
    expect(client.connectionStatus).toBe('failed')
  })

  it('returns an unsubscribe function from onEvent', () => {
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
    })

    const listener = vi.fn()
    const dispose = client.onEvent('input:text', listener)

    dispose()
    expect(() => client.offEvent('input:text', listener)).not.toThrow()
  })

  it('uses an injected websocket constructor when provided', async () => {
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
      websocketConstructor: InjectedMockWebSocket,
    })

    const connected = client.connect()
    const socket = InjectedMockWebSocket.instances.at(-1)

    expect(socket).toBeDefined()
    expect(MockWebSocket.instances).toHaveLength(1)

    if (!socket) {
      throw new Error('No custom mock websocket instance created')
    }

    emitOpen(socket)
    const announceEvent = parseSent(socket)

    emitMessage(socket, {
      type: 'module:announced',
      data: {
        name: 'test-plugin',
        identity: announceEvent.data.identity,
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'announce-1' },
      },
    })

    await expect(connected).resolves.toBeUndefined()
  })

  it('supports timeout-aware ensureConnected without cancelling the shared connect task', async () => {
    vi.useFakeTimers()

    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
    })

    const timedOut = client.ensureConnected({ timeout: 50 })
    const timedOutAssertion = expect(timedOut).rejects.toThrow('Connection timed out after 50ms')
    const socket = lastSocket()

    await vi.advanceTimersByTimeAsync(50)
    await timedOutAssertion

    emitOpen(socket)
    const announceEvent = parseSent(socket)

    emitMessage(socket, {
      type: 'module:announced',
      data: {
        name: 'test-plugin',
        identity: announceEvent.data.identity,
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'announce-1' },
      },
    })

    await expect(client.ensureConnected()).resolves.toBeUndefined()
    expect(client.isReady).toBe(true)
  })

  it('supports abort-aware connect', async () => {
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
    })

    const controller = new AbortController()
    const connecting = client.connect({ abortSignal: controller.signal })

    lastSocket()
    controller.abort()

    await expect(connecting).rejects.toThrow('Connection aborted')
    expect(client.connectionStatus).toBe('connecting')
  })

  it('notifies external state listeners', async () => {
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
    })

    const listener = vi.fn()
    const dispose = client.onConnectionStateChange(listener)
    const connected = client.connect()
    const socket = lastSocket()

    emitOpen(socket)

    const announceEvent = parseSent(socket)
    emitMessage(socket, {
      type: 'module:announced',
      data: {
        name: 'test-plugin',
        identity: announceEvent.data.identity,
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'announce-1' },
      },
    })

    await connected

    expect(listener).toHaveBeenCalledWith({ previousStatus: 'idle', status: 'connecting' })
    expect(listener).toHaveBeenCalledWith({ previousStatus: 'connecting', status: 'announcing' })
    expect(listener).toHaveBeenCalledWith({ previousStatus: 'announcing', status: 'ready' })

    dispose()
  })

  it('retries after connect timeout and eventually connects on a later socket', async () => {
    vi.useFakeTimers()

    const client = new Client({
      autoConnect: false,
      autoReconnect: true,
      connectTimeoutMs: 50,
      name: 'test-plugin',
    })

    const connecting = client.connect()
    const firstSocket = lastSocket()
    const firstCloseSpy = vi.spyOn(firstSocket, 'close')

    await vi.advanceTimersByTimeAsync(50)
    expect(firstCloseSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(MockWebSocket.instances).toHaveLength(2)

    const secondSocket = lastSocket()
    emitOpen(secondSocket)
    const announceEvent = parseSent(secondSocket)

    emitMessage(secondSocket, {
      type: 'module:announced',
      data: {
        name: 'test-plugin',
        identity: announceEvent.data.identity,
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'announce-retry-1' },
      },
    })

    await expect(connecting).resolves.toBeUndefined()
    expect(client.connectionStatus).toBe('ready')
  })

  it('does not emit onReady twice when sync fallback already moved status to ready', async () => {
    const onReady = vi.fn()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      name: 'test-plugin',
      onReady,
    })

    const connecting = client.connect()
    const socket = lastSocket()
    emitOpen(socket)

    const announceEvent = parseSent(socket)
    const selfIdentity = announceEvent.data.identity

    emitMessage(socket, {
      type: 'registry:modules:sync',
      data: {
        modules: [{ name: 'test-plugin', identity: selfIdentity }],
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'sync-1' },
      },
    })

    emitMessage(socket, {
      type: 'module:announced',
      data: {
        name: 'test-plugin',
        identity: selfIdentity,
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
        event: { id: 'announce-1' },
      },
    })

    await expect(connecting).resolves.toBeUndefined()
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})
