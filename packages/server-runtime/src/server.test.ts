import { Format, LogLevelString } from '@guiiai/logg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isIPv4LinkLocalAddress, isLinkLocalAddress, isLoopbackAddress } from './server'

const serveMocks = vi.hoisted(() => {
  let resolveServe: (() => void) | null = null
  let rejectServe: ((error: Error) => void) | null = null

  const serveCall = vi.fn(() => new Promise<void>((resolve, reject) => {
    resolveServe = resolve
    rejectServe = reject
  }))

  const closeCall = vi.fn(async () => {})
  const disposeCall = vi.fn(() => {})
  const setupAppCall = vi.fn(() => ({
    app: {
      fetch: vi.fn(async () => ({ crossws: {} })),
    },
    closeAllPeers: vi.fn(),
    dispose: disposeCall,
  }))

  return {
    closeCall,
    disposeCall,
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

vi.mock('./index', () => ({
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
    expect(serveMocks.disposeCall).toHaveBeenCalledTimes(1)

    const retryStart = server.start()
    expect(serveMocks.serveCall).toHaveBeenCalledTimes(2)

    serveMocks.resolveServe()
    await retryStart
  })

  it('treats EADDRINUSE as an existing listener instead of failing startup', async () => {
    const server = createServer({ hostname: '127.0.0.1', port: 6121 })

    const startTask = server.start()
    const error = new Error('listen EADDRINUSE: address already in use 127.0.0.1:6121') as NodeJS.ErrnoException
    error.code = 'EADDRINUSE'
    serveMocks.rejectServe(error)

    await expect(startTask).resolves.toBeUndefined()
    expect(serveMocks.disposeCall).toHaveBeenCalledTimes(1)
    expect(serveMocks.closeCall).toHaveBeenCalledWith(true)
  })

  it('merges nested config updates instead of replacing sibling logger settings', async () => {
    const server = createServer({
      hostname: '127.0.0.1',
      port: 6121,
      logger: {
        app: { level: LogLevelString.Log },
        websocket: { format: Format.Pretty },
      },
    })

    server.updateConfig({
      logger: {
        app: { format: Format.Pretty },
      },
    })

    const startTask = server.start()
    serveMocks.resolveServe()
    await startTask

    expect(serveMocks.setupAppCall).toHaveBeenCalledWith(expect.objectContaining({
      logger: {
        app: {
          level: LogLevelString.Log,
          format: Format.Pretty,
        },
        websocket: {
          format: Format.Pretty,
        },
      },
    }))
  })
})

describe('isLoopbackAddress', () => {
  it('returns true for 127.0.0.1', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
  })

  it('returns true for loopback aliases in 127/8 range', () => {
    // https://github.com/moeru-ai/airi/pull/1893
    // Hosts may expose loopback aliases like 127.0.1.1 via networkInterfaces().
    expect(isLoopbackAddress('127.0.1.1')).toBe(true)
    expect(isLoopbackAddress('127.255.255.255')).toBe(true)
  })

  it('returns true for IPv6 loopback ::1', () => {
    expect(isLoopbackAddress('::1')).toBe(true)
  })

  it('returns false for a normal LAN address', () => {
    expect(isLoopbackAddress('192.168.1.100')).toBe(false)
  })

  it('returns false for 10.x.x.x', () => {
    expect(isLoopbackAddress('10.0.0.1')).toBe(false)
  })
})

describe('isLinkLocalAddress', () => {
  it('returns true for a fe80:: link-local address', () => {
    expect(isLinkLocalAddress('fe80::1')).toBe(true)
  })

  it('returns true for addresses across the full fe80::/10 range', () => {
    // fe80::/10 covers fe80:: through febf::
    // https://github.com/moeru-ai/airi/pull/1893
    expect(isLinkLocalAddress('fe80::1')).toBe(true)
    expect(isLinkLocalAddress('fe90::1')).toBe(true)
    expect(isLinkLocalAddress('fea0::1')).toBe(true)
    expect(isLinkLocalAddress('feb0::1')).toBe(true)
  })

  it('returns false for a global unicast address', () => {
    expect(isLinkLocalAddress('2001:db8::1')).toBe(false)
  })

  it('returns false for IPv6 loopback ::1', () => {
    expect(isLinkLocalAddress('::1')).toBe(false)
  })

  it('returns false for an IPv4 address', () => {
    expect(isLinkLocalAddress('192.168.1.100')).toBe(false)
  })
})

describe('isIPv4LinkLocalAddress', () => {
  it('returns true for a 169.254.x.x APIPA address', () => {
    expect(isIPv4LinkLocalAddress('169.254.0.1')).toBe(true)
  })

  it('returns true for addresses across the full 169.254.0.0/16 range', () => {
    expect(isIPv4LinkLocalAddress('169.254.0.0')).toBe(true)
    expect(isIPv4LinkLocalAddress('169.254.1.1')).toBe(true)
    expect(isIPv4LinkLocalAddress('169.254.255.255')).toBe(true)
  })

  it('returns false for a normal LAN address', () => {
    expect(isIPv4LinkLocalAddress('192.168.1.100')).toBe(false)
  })

  it('returns false for 10.x.x.x', () => {
    expect(isIPv4LinkLocalAddress('10.0.0.1')).toBe(false)
  })

  it('returns false for a loopback address', () => {
    expect(isIPv4LinkLocalAddress('127.0.0.1')).toBe(false)
  })

  it('returns false for an IPv6 address', () => {
    expect(isIPv4LinkLocalAddress('fe80::1')).toBe(false)
  })
})
