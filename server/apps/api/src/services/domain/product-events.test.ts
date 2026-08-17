import { describe, expect, it, vi } from 'vitest'

import { createProductEventService } from './product-events'

describe('productEventService', () => {
  it('captures only the server-side funnel facts shared with the Go service', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await service.track({
      userId: 'user-1',
      feature: 'auth',
      action: 'user_signed_up',
      status: 'succeeded',
    })
    await service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'checkout_started',
      status: 'succeeded',
      source: 'stripe.checkout',
    })
    await service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
      source: 'stripe.webhook',
      metadata: { amount_minor_unit: 990, currency: 'usd' },
    })

    expect(capture).toHaveBeenNthCalledWith(1, {
      distinctId: 'user-1',
      event: 'signup_completed',
      properties: {
        app_surface: 'server',
        airi_user_id: 'user-1',
        feature: 'auth',
        status: 'succeeded',
      },
    })
    expect(capture).toHaveBeenNthCalledWith(2, {
      distinctId: 'user-1',
      event: 'checkout_created',
      properties: {
        app_surface: 'server',
        airi_user_id: 'user-1',
        feature: 'billing',
        status: 'succeeded',
        source: 'stripe.checkout',
      },
    })
    expect(capture).toHaveBeenNthCalledWith(3, {
      distinctId: 'user-1',
      event: 'payment_completed',
      properties: {
        app_surface: 'server',
        airi_user_id: 'user-1',
        feature: 'billing',
        status: 'succeeded',
        source: 'stripe.webhook',
        amount_minor_unit: 990,
        currency: 'usd',
      },
    })
  })

  it('merges a Stripe conversion with its browser PostHog person', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
      eventId: 'cs_123',
      metadata: {
        posthog_distinct_id: 'anon-browser-1',
        posthog_session_id: 'ph-session-1',
      },
    })

    expect(capture).toHaveBeenNthCalledWith(1, {
      distinctId: 'user-1',
      event: '$identify',
      properties: {
        $insert_id: 'cs_123',
        $anon_distinct_id: 'anon-browser-1',
        $session_id: 'ph-session-1',
        airi_user_id: 'user-1',
      },
    })
    expect(capture).toHaveBeenNthCalledWith(2, expect.objectContaining({
      distinctId: 'user-1',
      event: 'payment_completed',
      properties: expect.objectContaining({ $insert_id: 'cs_123' }),
    }))
  })

  it('still captures the funnel event when identity merging fails', async () => {
    const capture = vi.fn()
      .mockRejectedValueOnce(new Error('identify failed'))
      .mockResolvedValueOnce(undefined)
    const service = createProductEventService({ capture, shutdown: vi.fn(async () => {}) })

    await expect(service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
      eventId: 'cs_456',
      metadata: { posthog_distinct_id: 'anon-browser-1' },
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
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
    })).resolves.toBeUndefined()
  })
})
