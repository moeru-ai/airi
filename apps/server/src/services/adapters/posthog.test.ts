import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const warn = vi.fn()
  const withFields = vi.fn(() => ({
    warn,
  }))
  const withError = vi.fn(() => ({
    withFields,
  }))
  const posthogConstructor = vi.fn()

  return {
    posthogConstructor,
    warn,
    withError,
    withFields,
  }
})

vi.mock('@guiiai/logg', () => ({
  useLogger: vi.fn(() => ({
    warn: mocks.warn,
    withError: mocks.withError,
  })),
}))

vi.mock('posthog-node', () => ({
  PostHog: vi.fn((apiKey: string, options: unknown) => {
    mocks.posthogConstructor(apiKey, options)
    return { apiKey, options }
  }),
}))

const { captureSafe, createPostHogClient } = await import('./posthog')

describe('createPostHogClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null and logs when server analytics key is unset', () => {
    const client = createPostHogClient({
      POSTHOG_API_KEY: '',
      POSTHOG_HOST: '',
    } as Parameters<typeof createPostHogClient>[0])

    expect(client).toBeNull()
    expect(mocks.warn).toHaveBeenCalledWith('POSTHOG_API_KEY is unset — server-side analytics disabled')
    expect(mocks.posthogConstructor).not.toHaveBeenCalled()
  })

  it('creates a low-latency PostHog client with default host', () => {
    const client = createPostHogClient({
      POSTHOG_API_KEY: 'phc_test',
      POSTHOG_HOST: '',
    } as Parameters<typeof createPostHogClient>[0])

    expect(client).toEqual({
      apiKey: 'phc_test',
      options: {
        host: 'https://us.i.posthog.com',
        flushAt: 1,
        flushInterval: 0,
      },
    })
    expect(mocks.posthogConstructor).toHaveBeenCalledWith('phc_test', {
      host: 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  })

  it('uses configured PostHog host when provided', () => {
    createPostHogClient({
      POSTHOG_API_KEY: 'phc_test',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
    } as Parameters<typeof createPostHogClient>[0])

    expect(mocks.posthogConstructor).toHaveBeenCalledWith('phc_test', {
      host: 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  })
})

describe('captureSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no-ops when PostHog is disabled', async () => {
    await expect(captureSafe(null, {
      distinctId: 'user-1',
      event: 'payment_completed',
    })).resolves.toBeUndefined()
  })

  it('uses captureImmediate for awaited server-side delivery', async () => {
    const captureImmediate = vi.fn(async () => undefined)
    const event = {
      distinctId: 'user-1',
      event: 'payment_completed',
      properties: { amount: 100 },
    }

    await captureSafe({ captureImmediate } as Parameters<typeof captureSafe>[0], event)

    expect(captureImmediate).toHaveBeenCalledWith(event)
  })

  it('swallows capture failures after logging context', async () => {
    const error = new Error('network down')
    const captureImmediate = vi.fn(async () => {
      throw error
    })

    await expect(captureSafe({ captureImmediate } as Parameters<typeof captureSafe>[0], {
      distinctId: 'user-1',
      event: 'payment_completed',
    })).resolves.toBeUndefined()

    expect(mocks.withError).toHaveBeenCalledWith(error)
    expect(mocks.withFields).toHaveBeenCalledWith({
      event: 'payment_completed',
      distinctId: 'user-1',
    })
    expect(mocks.warn).toHaveBeenCalledWith('PostHog captureImmediate failed; swallowing to protect caller')
  })
})
