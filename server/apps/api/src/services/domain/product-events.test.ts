import { describe, expect, it, vi } from 'vitest'

import { createProductEventService } from './product-events'

describe('productEventService', () => {
  it('captures only the server-side funnel facts shared with the Go service', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await service.track({
      action: 'user_signed_up',
      feature: 'auth',
      status: 'succeeded',
      userId: 'user-1',
    })
    await service.track({
      action: 'checkout_started',
      feature: 'billing',
      source: 'stripe.checkout',
      status: 'succeeded',
      userId: 'user-1',
    })
    await service.track({
      action: 'payment_completed',
      feature: 'billing',
      metadata: { amount_minor_unit: 990, currency: 'usd' },
      source: 'stripe.webhook',
      status: 'succeeded',
      userId: 'user-1',
    })

    expect(capture).toHaveBeenNthCalledWith(1, {
      distinctId: 'user-1',
      event: 'signup_completed',
      properties: {
        airi_user_id: 'user-1',
        app_surface: 'server',
        feature: 'auth',
        status: 'succeeded',
      },
    })
    expect(capture).toHaveBeenNthCalledWith(2, {
      distinctId: 'user-1',
      event: 'checkout_created',
      properties: {
        airi_user_id: 'user-1',
        app_surface: 'server',
        feature: 'billing',
        source: 'stripe.checkout',
        status: 'succeeded',
      },
    })
    expect(capture).toHaveBeenNthCalledWith(3, {
      distinctId: 'user-1',
      event: 'payment_completed',
      properties: {
        airi_user_id: 'user-1',
        amount_minor_unit: 990,
        app_surface: 'server',
        currency: 'usd',
        feature: 'billing',
        source: 'stripe.webhook',
        status: 'succeeded',
      },
    })
  })

  it('merges a Stripe conversion with its browser PostHog person', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await service.track({
      action: 'payment_completed',
      eventId: 'cs_123',
      feature: 'billing',
      metadata: {
        posthog_distinct_id: 'anon-browser-1',
        posthog_session_id: 'ph-session-1',
      },
      status: 'succeeded',
      userId: 'user-1',
    })

    expect(capture).toHaveBeenNthCalledWith(1, {
      distinctId: 'user-1',
      event: '$identify',
      properties: {
        $anon_distinct_id: 'anon-browser-1',
        $insert_id: 'cs_123',
        $session_id: 'ph-session-1',
        airi_user_id: 'user-1',
      },
      uuid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    })
    expect(capture).toHaveBeenNthCalledWith(2, expect.objectContaining({
      distinctId: 'user-1',
      event: 'payment_completed',
      properties: expect.objectContaining({ $insert_id: 'cs_123' }),
      uuid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    }))
  })

  it('uses a stable PostHog UUID for replayed conversion captures', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })
    const input = {
      action: 'payment_completed' as const,
      eventId: 'cs_replayed',
      feature: 'billing' as const,
      status: 'succeeded' as const,
      userId: 'user-1' as const,
    }

    await service.track(input)
    await service.track(input)

    expect(capture).toHaveBeenCalledTimes(2)
    const captures = capture.mock.calls as unknown as Array<[
      {
        properties: Record<string, unknown>
        uuid?: string
      },
    ]>
    const first = captures[0]![0]
    const replay = captures[1]![0]
    expect(first.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(replay.uuid).toBe(first.uuid)
    expect(first.properties.$insert_id).toBe('cs_replayed')
  })

  it('rejects metadata that can overwrite service-controlled PostHog properties', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await expect(service.track({
      action: 'payment_completed',
      feature: 'billing',
      metadata: { $insert_id: 'spoofed' },
      status: 'succeeded',
      userId: 'user-1',
    })).resolves.toBeUndefined()

    expect(capture).not.toHaveBeenCalled()
  })

  it('still captures the funnel event when identity merging fails', async () => {
    const capture = vi.fn()
      .mockRejectedValueOnce(new Error('identify failed'))
      .mockResolvedValueOnce(undefined)
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await expect(service.track({
      action: 'payment_completed',
      eventId: 'cs_456',
      feature: 'billing',
      metadata: { posthog_distinct_id: 'anon-browser-1' },
      status: 'succeeded',
      userId: 'user-1',
    })).resolves.toBeUndefined()

    expect(capture).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenNthCalledWith(2, expect.objectContaining({
      event: 'payment_completed',
      properties: expect.objectContaining({ $insert_id: 'cs_456' }),
    }))
  })

  it('does not fail a business path when capture throws', async () => {
    const capture = vi.fn(async () => {
      throw new Error('posthog exploded')
    })
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await expect(service.track({
      action: 'payment_completed',
      feature: 'billing',
      status: 'succeeded',
      userId: 'user-1',
    })).resolves.toBeUndefined()
  })
})
