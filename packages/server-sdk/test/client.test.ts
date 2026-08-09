import type { ClientConnection, ClientConnector, ClientEvents } from '@proj-airi/better-ws'
import type { WebSocketEvent, WebSocketEventOf } from '@proj-airi/server-shared/types'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { Client } from '../src/client'

class Deferred<T> {
  promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (error: unknown) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

class FakeConnection<C = undefined> implements ClientConnection<WebSocketEvent<C>> {
  readonly sent: Array<WebSocketEvent<C>> = []
  readonly pongs: number[] = []
  closed = false

  constructor(private readonly events: ClientEvents<WebSocketEvent<C>>) {}

  send(message: WebSocketEvent<C>) {
    this.sent.push(message)
    return true
  }

  close() {
    if (this.closed) {
      return
    }

    this.closed = true
    this.events.close({ code: 1000, reason: 'closed', wasClean: true })
  }

  pong() {
    this.pongs.push(Date.now())
    return true
  }
}

class FakeConnector<C = undefined> implements ClientConnector<WebSocketEvent<C>> {
  readonly attempts: Array<{
    deferred: Deferred<ClientConnection<WebSocketEvent<C>>>
    events: ClientEvents<WebSocketEvent<C>>
    connection?: FakeConnection<C>
  }> = []

  connect(events: ClientEvents<WebSocketEvent<C>>) {
    const deferred = new Deferred<ClientConnection<WebSocketEvent<C>>>()
    this.attempts.push({ deferred, events })
    return deferred.promise
  }

  open(index = this.attempts.length - 1) {
    const attempt = this.attempts[index]
    if (!attempt) {
      throw new Error(`Missing fake connector attempt at index ${index}.`)
    }

    const connection = new FakeConnection<C>(attempt.events)
    attempt.connection = connection
    attempt.deferred.resolve(connection)
    return connection
  }

  reject(error: unknown, index = this.attempts.length - 1) {
    const attempt = this.attempts[index]
    if (!attempt) {
      throw new Error(`Missing fake connector attempt at index ${index}.`)
    }

    attempt.deferred.reject(error)
  }

  emit(message: WebSocketEvent<C>, index = this.attempts.length - 1) {
    const attempt = this.attempts[index]
    if (!attempt) {
      throw new Error(`Missing fake connector attempt at index ${index}.`)
    }

    attempt.events.message(message)
  }
}

function serverEvent<E extends WebSocketEvent['type']>(
  type: E,
  data: WebSocketEventOf<E>['data'],
): WebSocketEventOf<E> {
  return {
    type,
    data,
    metadata: {
      source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
      event: { id: `${type}-1` },
    },
  } as WebSocketEventOf<E>
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function flushAsyncTasks() {
  await flushMicrotasks()
  await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('client', () => {
  it('routes default autoConnect failures through onError without unhandled rejections', async () => {
    const connector = new FakeConnector()
    const onError = vi.fn()
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    let client: Client | undefined
    try {
      client = new Client({
        autoReconnect: false,
        connector,
        name: 'test-plugin',
        onError,
      })

      const failure = new Error('server unavailable')
      connector.reject(failure)
      await flushAsyncTasks()

      expect(onError).toHaveBeenCalledWith(failure)
      expect(unhandledRejections).toEqual([])
    }
    finally {
      client?.close()
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('runs module authentication and announcement in the better-ws prepare step', async () => {
    const connector = new FakeConnector()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      name: 'test-plugin',
      token: 'secret',
    })

    const connected = client.connect()
    const connection = connector.open()
    await flushMicrotasks()

    expect(client.connectionStatus).toBe('authenticating')
    expect(connection.sent.at(-1)).toMatchObject({
      type: 'module:authenticate',
      data: { token: 'secret' },
    })

    connector.emit(serverEvent('module:authenticated', { authenticated: true }))
    await flushMicrotasks()

    const announceEvent = connection.sent.at(-1) as WebSocketEventOf<'extension:module:announce'>

    expect(client.connectionStatus).toBe('announcing')
    expect(announceEvent).toMatchObject({
      type: 'extension:module:announce',
      data: { name: 'test-plugin' },
    })

    connector.emit(serverEvent('extension:module:announced', {
      name: 'test-plugin',
      identity: announceEvent.data.identity,
    }))

    await expect(connected).resolves.toBeUndefined()
    expect(client.connectionStatus).toBe('ready')
    expect(client.isReady).toBe(true)
  })

  it('accepts registry sync as the module announcement completion signal', async () => {
    const connector = new FakeConnector()
    const onReady = vi.fn()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      name: 'test-plugin',
      onReady,
    })

    const connected = client.connect()
    const connection = connector.open()
    await flushMicrotasks()

    const announceEvent = connection.sent.at(-1) as WebSocketEventOf<'extension:module:announce'>

    connector.emit(serverEvent('registry:modules:sync', {
      modules: [{ name: 'test-plugin', identity: announceEvent.data.identity }],
    }))
    connector.emit(serverEvent('extension:module:announced', {
      name: 'test-plugin',
      identity: announceEvent.data.identity,
    }))

    await expect(connected).resolves.toBeUndefined()
    expect(client.connectionStatus).toBe('ready')
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('keeps manual automatic reconnects non-ready until peer authentication and extension announcement arrive', async () => {
    vi.useFakeTimers()

    const connector = new FakeConnector()
    const onReady = vi.fn()
    const client = new Client({
      autoConnect: false,
      autoReconnect: true,
      connector,
      handshake: 'manual',
      name: 'test-extension',
      onReady,
    })

    const connected = client.connect()
    const firstConnection = connector.open(0)
    await flushMicrotasks()
    await expect(connected).resolves.toBeUndefined()

    expect(client.connectionStatus).toBe('ready')
    expect(onReady).toHaveBeenCalledTimes(1)

    firstConnection.close()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(connector.attempts).toHaveLength(2)

    const secondConnection = connector.open(1)
    await flushMicrotasks()

    expect(client.connectionStatus).toBe('authenticating')
    expect(client.isReady).toBe(false)
    expect(secondConnection.sent).toEqual([])

    connector.emit(serverEvent('peer:authenticated', { authenticated: true }), 1)
    await flushMicrotasks()

    expect(client.connectionStatus).toBe('announcing')
    expect(onReady).toHaveBeenCalledTimes(1)

    connector.emit(serverEvent('extension:announced', {
      identity: { id: 'other-extension' },
    }), 1)
    await flushMicrotasks()

    expect(client.connectionStatus).toBe('announcing')
    expect(onReady).toHaveBeenCalledTimes(1)

    connector.emit(serverEvent('extension:announced', {
      identity: { id: 'test-extension' },
    }), 1)

    await expect(client.ensureConnected()).resolves.toBeUndefined()
    expect(client.connectionStatus).toBe('ready')
    expect(onReady).toHaveBeenCalledTimes(2)
  })

  it('injects source and event metadata before sending through better-ws', async () => {
    const connector = new FakeConnector()
    const onAnySend = vi.fn()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      handshake: 'manual',
      name: 'test-extension',
      onAnySend,
    })

    const connected = client.connect()
    const connection = connector.open()
    await connected

    const sent = client.send({
      type: 'input:text',
      data: { text: 'hello' },
    })

    expect(sent).toBe(true)
    expect(connection.sent.at(-1)).toMatchObject({
      type: 'input:text',
      data: { text: 'hello' },
      metadata: {
        source: {
          kind: 'plugin',
          id: expect.any(String),
          plugin: { id: 'test-extension' },
        },
        event: { id: expect.any(String) },
      },
    })
    expect(onAnySend).toHaveBeenCalledWith(connection.sent.at(-1))
  })

  it('fails without retrying terminal authentication errors', async () => {
    vi.useFakeTimers()

    const connector = new FakeConnector()
    const onError = vi.fn()
    const client = new Client({
      autoConnect: false,
      autoReconnect: true,
      connector,
      name: 'test-plugin',
      onError,
      token: 'wrong-token',
    })

    const connected = client.connect()
    connector.open()
    await flushMicrotasks()

    connector.emit(serverEvent('error', { message: 'invalid token' }))

    await expect(connected).rejects.toThrow('invalid token')
    expect(client.connectionStatus).toBe('failed')
    expect(connector.attempts).toHaveLength(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('dispatches typed events and answers transport heartbeat pings with pong', async () => {
    const connector = new FakeConnector()
    const listener = vi.fn()
    const onAnyMessage = vi.fn()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      handshake: 'manual',
      name: 'test-extension',
      onAnyMessage,
    })

    const connected = client.connect()
    const connection = connector.open()
    await connected

    client.onEvent('input:text', listener)

    const input = serverEvent('input:text', { text: 'hello' })
    connector.emit(input)
    connector.emit(serverEvent('transport:connection:heartbeat', {
      kind: 'ping',
      message: 'ping',
    }))
    await flushMicrotasks()

    expect(listener).toHaveBeenCalledWith(input)
    expect(onAnyMessage).toHaveBeenCalledWith(input)
    expect(connection.sent.at(-1)).toMatchObject({
      type: 'transport:connection:heartbeat',
      data: { kind: 'pong' },
    })
  })

  it('keeps generated event ids when caller metadata has an undefined id', async () => {
    const connector = new FakeConnector()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      handshake: 'manual',
      name: 'test-extension',
    })

    const connected = client.connect()
    const connection = connector.open()
    await connected

    client.send({
      type: 'input:text',
      data: { text: 'hello' },
      metadata: {
        event: { id: undefined },
      },
    })

    expect(connection.sent.at(-1)?.metadata.event.id).toEqual(expect.any(String))
  })

  it('can disable protocol heartbeat', async () => {
    const connector = new FakeConnector()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      heartbeat: false,
      handshake: 'manual',
      name: 'test-extension',
    })

    const connected = client.connect()
    connector.open()
    await connected

    expect(client.isReady).toBe(true)
  })

  it('races local timeouts without cancelling the shared connect task', async () => {
    vi.useFakeTimers()

    const connector = new FakeConnector()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      name: 'test-plugin',
    })

    const timedOut = client.ensureConnected({ timeout: 50 })
    const timedOutAssertion = expect(timedOut).rejects.toThrow('Connection timed out after 50ms')

    await vi.advanceTimersByTimeAsync(50)
    await timedOutAssertion

    const connection = connector.open()
    await flushMicrotasks()

    const announceEvent = connection.sent.at(-1) as WebSocketEventOf<'extension:module:announce'>
    connector.emit(serverEvent('extension:module:announced', {
      name: 'test-plugin',
      identity: announceEvent.data.identity,
    }))

    await expect(client.ensureConnected()).resolves.toBeUndefined()
    expect(client.isReady).toBe(true)
  })

  it('races local aborts without cancelling the shared connect task', async () => {
    const connector = new FakeConnector()
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connector,
      name: 'test-plugin',
    })

    const controller = new AbortController()
    const connecting = client.connect({ abortSignal: controller.signal })

    controller.abort()

    await expect(connecting).rejects.toThrow('Connection aborted')
    expect(client.connectionStatus).toBe('connecting')

    const connection = connector.open()
    await flushMicrotasks()

    const announceEvent = connection.sent.at(-1) as WebSocketEventOf<'extension:module:announce'>
    connector.emit(serverEvent('extension:module:announced', {
      name: 'test-plugin',
      identity: announceEvent.data.identity,
    }))

    await expect(client.ready()).resolves.toBeUndefined()
    expect(client.isReady).toBe(true)
  })
})
