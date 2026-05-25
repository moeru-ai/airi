import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CapturedLimiterOptions {
  windowMs: number
  limit: number
  standardHeaders: string
  keyGenerator: (context: {
    get: (key: string) => { id?: string } | null
    req: { header: (key: string) => string | undefined }
  }) => string
  handler: (context: {
    get: (key: string) => { id?: string } | null
    json: (body: unknown, status: number) => Response
  }) => Response
}

const mocks = vi.hoisted(() => {
  const capturedOptions: CapturedLimiterOptions[] = []
  const getConnInfo = vi.fn()
  const createRateLimiter = vi.fn((options: CapturedLimiterOptions) => {
    capturedOptions.push(options)
    return options
  })

  return {
    capturedOptions,
    createRateLimiter,
    getConnInfo,
  }
})

vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: mocks.getConnInfo,
}))

vi.mock('hono-rate-limiter', () => ({
  rateLimiter: mocks.createRateLimiter,
}))

const { rateLimiter } = await import('../rate-limit')

function createContext(args: { userId?: string, forwardedFor?: string } = {}) {
  return {
    get: vi.fn((key: string) => key === 'user' && args.userId ? { id: args.userId } : null),
    req: {
      header: vi.fn((key: string) => key === 'x-forwarded-for' ? args.forwardedFor : undefined),
    },
    json: vi.fn((body: unknown, status: number) => new Response(JSON.stringify(body), { status })),
  }
}

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.capturedOptions.length = 0
  })

  it('configures hono-rate-limiter with seconds converted to milliseconds', () => {
    rateLimiter({ max: 9, windowSec: 30 })

    expect(mocks.createRateLimiter).toHaveBeenCalledTimes(1)
    expect(mocks.capturedOptions[0]).toMatchObject({
      windowMs: 30000,
      limit: 9,
      standardHeaders: 'draft-6',
    })
  })

  it('uses authenticated user id before remote address and forwarded headers', () => {
    rateLimiter({ max: 1, windowSec: 1 })
    const options = mocks.capturedOptions[0]
    mocks.getConnInfo.mockReturnValueOnce({ remote: { address: '203.0.113.10' } })

    expect(options.keyGenerator(createContext({ userId: 'user-1', forwardedFor: '198.51.100.20' }))).toBe('user-1')
    expect(mocks.getConnInfo).not.toHaveBeenCalled()
  })

  it('falls back from socket address to forwarded header and anonymous key', () => {
    rateLimiter({ max: 1, windowSec: 1 })
    const options = mocks.capturedOptions[0]

    mocks.getConnInfo.mockReturnValueOnce({ remote: { address: '203.0.113.10' } })
    expect(options.keyGenerator(createContext({ forwardedFor: '198.51.100.20' }))).toBe('203.0.113.10')

    mocks.getConnInfo.mockReturnValueOnce({ remote: {} })
    expect(options.keyGenerator(createContext({ forwardedFor: '198.51.100.20' }))).toBe('198.51.100.20')

    mocks.getConnInfo.mockReturnValueOnce({ remote: {} })
    expect(options.keyGenerator(createContext())).toBe('anonymous')
  })

  it('allows caller-provided key generator to own key selection', () => {
    const keyGenerator = vi.fn(() => 'custom-key')

    rateLimiter({ max: 1, windowSec: 1, keyGenerator })
    const options = mocks.capturedOptions[0]

    expect(options.keyGenerator(createContext())).toBe('custom-key')
    expect(keyGenerator).toHaveBeenCalledTimes(1)
  })

  it('records metrics and returns a 429 body when limit is exceeded', async () => {
    const blockedAdd = vi.fn()

    rateLimiter({
      max: 5,
      windowSec: 60,
      routeLabel: 'openai.completions',
      metrics: {
        blocked: {
          add: blockedAdd,
        },
      } as Parameters<typeof rateLimiter>[0]['metrics'],
    })
    const options = mocks.capturedOptions[0]
    const context = createContext({ userId: 'user-1' })

    const response = options.handler(context)

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests',
    })
    expect(context.json).toHaveBeenCalledWith({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests',
    }, 429)
    expect(blockedAdd).toHaveBeenCalledWith(1, {
      route: 'openai.completions',
      key_type: 'user',
      limit: '5',
    })
  })
})
