import { once } from 'node:events'

import { Client, parseEvent } from '@proj-airi/server-sdk'
import { describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { startAiriClientConnection } from './start-background-client'

function createLogger() {
  const logger = {
    log: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    withFields: vi.fn<(fields: Record<string, unknown>) => Parameters<typeof startAiriClientConnection>[1]['logger']>(),
  }
  logger.withFields.mockReturnValue(logger)
  return logger
}

describe('background AIRI connection', () => {
  // https://github.com/moeru-ai/airi/issues/2071
  // ROOT CAUSE:
  // Authentication errors used the network retry warning and a second generic warning.
  // Classify server authentication errors and report token setup once per connection.
  it.each(['invalid token', 'not authenticated', 'must authenticate before announcing'])(
    'explains how to correct %s (Issue #2071)',
    async (message) => {
      const error = new Error(message)
      const logger = createLogger()
      const client = { connect: vi.fn().mockRejectedValue(error) }
      const lifecycle = startAiriClientConnection(client, { logger, url: 'ws://localhost:6121/ws' })

      lifecycle.reportUnavailable(error)
      await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled())
      await Promise.resolve()

      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn.mock.calls[0][0]).toContain('Settings -> Connection')
      expect(logger.warn.mock.calls[0][0]).toContain('AIRI_WS_TOKEN')
      expect(logger.warn.mock.calls[0][0]).not.toContain('retrying in background')
      expect(logger.withFields).toHaveBeenCalledWith({ url: 'ws://localhost:6121/ws', error: message })
    },
  )

  it('keeps background retry guidance for network failures', async () => {
    const logger = createLogger()
    const lifecycle = startAiriClientConnection({ connect: () => new Promise<void>(() => {}) }, { logger, url: 'ws://localhost:6121/ws' })
    lifecycle.reportUnavailable(new Error('ECONNREFUSED'))
    lifecycle.reportUnavailable(new Error('ECONNREFUSED'))

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toContain('retrying in background')
    expect(logger.warn.mock.calls[0][0]).not.toContain('AIRI_WS_TOKEN')
  })

  it('reports authentication failure after an earlier network failure', () => {
    const logger = createLogger()
    const lifecycle = startAiriClientConnection({ connect: () => new Promise<void>(() => {}) }, { logger, url: 'ws://localhost:6121/ws' })
    lifecycle.reportUnavailable(new Error('ECONNREFUSED'))
    lifecycle.reportUnavailable(new Error('invalid token'))

    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(logger.warn.mock.calls[1][0]).toContain('AIRI_WS_TOKEN')
  })

  it('explains authentication when connect rejects without an error callback', async () => {
    const logger = createLogger()
    startAiriClientConnection({ connect: () => Promise.reject(new Error('invalid token')) }, { logger, url: 'ws://localhost:6121/ws' })

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1))
    expect(logger.warn.mock.calls[0][0]).toContain('AIRI_WS_TOKEN')
  })

  it('reports a new authentication failure after the connection succeeds', async () => {
    const connection = Promise.withResolvers<void>()
    const logger = createLogger()
    const lifecycle = startAiriClientConnection({ connect: () => connection.promise }, { logger, url: 'ws://localhost:6121/ws' })
    lifecycle.reportUnavailable(new Error('invalid token'))
    lifecycle.reportUnavailable(new Error('invalid token'))
    expect(logger.warn).toHaveBeenCalledTimes(1)

    connection.resolve()
    await vi.waitFor(() => expect(logger.log).toHaveBeenCalledTimes(1))
    lifecycle.reportUnavailable(new Error('invalid token'))

    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(logger.warn.mock.calls[1][0]).toContain('AIRI_WS_TOKEN')
  })

  // https://github.com/moeru-ai/airi/issues/2071
  // ROOT CAUSE:
  // The SDK reports protocol authentication errors through onError and connect rejection.
  // Both paths now share token guidance and suppress duplicate authentication warnings.
  it.each([
    { token: undefined, message: 'must authenticate before announcing', event: 'extension:module:announce' },
    { token: 'invalid-test-token', message: 'invalid token', event: 'module:authenticate' },
  ])('reports $message from a real WebSocket handshake (Issue #2071)', async ({ token, message, event }) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP listener')

    const received = vi.fn()
    server.on('connection', (socket) => {
      socket.on('message', (data) => {
        received(parseEvent(data.toString()).type)
        socket.send(JSON.stringify({
          type: 'error',
          data: { message },
          metadata: {
            source: { kind: 'plugin', plugin: { id: 'server' }, id: 'server-1' },
            event: { id: 'auth-error' },
          },
        }))
      })
    })

    const url = `ws://127.0.0.1:${address.port}/ws`
    const logger = createLogger()
    let lifecycle: ReturnType<typeof startAiriClientConnection> | undefined
    const client = new Client({
      name: 'minecraft',
      url,
      token,
      autoConnect: false,
      autoReconnect: false,
      heartbeat: false,
      onError: error => lifecycle?.reportUnavailable(error),
    })
    try {
      lifecycle = startAiriClientConnection(client, { logger, url })
      await vi.waitFor(() => expect(client.connectionStatus).toBe('failed'))
      expect(received).toHaveBeenCalledWith(event)
      expect(logger.warn).toHaveBeenCalledTimes(1)
      expect(logger.warn.mock.calls[0][0]).toContain('AIRI_WS_TOKEN')
      expect(logger.log).not.toHaveBeenCalled()
    }
    finally {
      client.close()
      for (const socket of server.clients)
        socket.terminate()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
