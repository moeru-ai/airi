import { beforeEach, describe, expect, it, vi } from 'vitest'

const serveMocks = vi.hoisted(() => {
  let resolveServe: (() => void) | null = null
  let rejectServe: ((error: Error) => void) | null = null

  const serveCall = vi.fn(() => new Promise<void>((resolve, reject) => {
    resolveServe = resolve
    rejectServe = reject
  }))

  const closeCall = vi.fn(async () => {})
  const setupAppCall = vi.fn(() => ({
    app: {
      fetch: vi.fn(async () => ({ crossws: {} })),
    },
    closeAllPeers: vi.fn(),
  }))

  return {
    closeCall,
    rejectServe: (error: Error) => rejectServe?.(error),
    resolveServe: () => resolveServe?.(),
    serveCall,
    setupAppCall,
  }
})

vi.mock('h3', () => ({
  H3: class {
    get = vi.fn()
  },
  defineWebSocketHandler: vi.fn(handler => handler),
  serve: vi.fn(() => ({
    serve: serveMocks.serveCall,
    close: serveMocks.closeCall,
  })),
}))

vi.mock('crossws/server', () => ({
  plugin: vi.fn(() => ({})),
}))

vi.mock('..', () => ({
  normalizeLoggerConfig: () => ({
    appLogFormat: 'pretty',
    appLogLevel: 'log',
  }),
  setupApp: serveMocks.setupAppCall,
}))

describe('createServer', async () => {
  const { createServer } = await import('./server')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deduplicates concurrent start calls while a start is already in progress', async () => {
    const server = createServer({ hostname: '127.0.0.1', port: 6121 })

    const firstStart = server.start()
    const secondStart = server.start()

    expect(serveMocks.serveCall).toHaveBeenCalledTimes(1)

    serveMocks.resolveServe()

    await Promise.all([firstStart, secondStart])
    expect(serveMocks.serveCall).toHaveBeenCalledTimes(1)
  })

  it('clears the single-flight state when start fails', async () => {
    const server = createServer({ hostname: '127.0.0.1', port: 6121 })

    const firstStart = server.start()
    serveMocks.rejectServe(new Error('bind failed'))

    await expect(firstStart).rejects.toThrow('bind failed')

    const retryStart = server.start()
    expect(serveMocks.serveCall).toHaveBeenCalledTimes(2)

    serveMocks.resolveServe()
    await retryStart
  })
})
