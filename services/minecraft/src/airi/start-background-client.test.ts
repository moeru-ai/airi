import { describe, expect, it, vi } from 'vitest'

import { startAiriClientConnection } from './start-background-client'

function createLogger() {
  const entries: Array<{ level: 'log' | 'warn', message: string, fields?: Record<string, unknown> }> = []

  const createScopedLogger = (fields?: Record<string, unknown>) => ({
    log: vi.fn((message: string) => {
      entries.push({ level: 'log', message, fields })
    }),
    warn: vi.fn((message: string) => {
      entries.push({ level: 'warn', message, fields })
    }),
    withFields: vi.fn((nextFields: Record<string, unknown>) => createScopedLogger(nextFields)),
  })

  return {
    entries,
    logger: createScopedLogger(),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

describe('startAiriClientConnection', () => {
  it('starts the AIRI connection in the background immediately', () => {
    const deferred = createDeferred<void>()
    const connect = vi.fn(() => deferred.promise)
    const { logger } = createLogger()

    startAiriClientConnection({ connect }, {
      logger,
      url: 'ws://localhost:6121/ws',
    })

    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('logs a retry recovery message after temporary unavailability', async () => {
    const deferred = createDeferred<void>()
    const { logger, entries } = createLogger()
    const connection = startAiriClientConnection({
      connect: vi.fn(() => deferred.promise),
    }, {
      logger,
      url: 'ws://localhost:6121/ws',
    })

    connection.reportUnavailable(new Error('connection refused'))
    deferred.resolve()
    await deferred.promise
    await Promise.resolve()

    expect(entries).toEqual([
      {
        level: 'warn',
        message: 'AIRI server is unavailable; continuing startup without AIRI and retrying in background',
        fields: {
          url: 'ws://localhost:6121/ws',
          error: 'connection refused',
        },
      },
      {
        level: 'log',
        message: 'Connected to AIRI server after background retry',
        fields: {
          url: 'ws://localhost:6121/ws',
        },
      },
    ])
  })

  it('logs if the client stops retrying entirely', async () => {
    const deferred = createDeferred<void>()
    const { logger, entries } = createLogger()

    startAiriClientConnection({
      connect: vi.fn(() => deferred.promise),
    }, {
      logger,
      url: 'ws://localhost:6121/ws',
    })

    deferred.reject(new Error('closed'))
    await expect(deferred.promise).rejects.toThrow('closed')
    await Promise.resolve()

    expect(entries).toEqual([
      {
        level: 'warn',
        message: 'AIRI client stopped retrying',
        fields: {
          url: 'ws://localhost:6121/ws',
          error: 'closed',
        },
      },
    ])
  })
})
