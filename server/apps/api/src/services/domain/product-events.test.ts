import type { ProductCaptureInput } from '../adapters/openpanel'

import { describe, expect, it, vi } from 'vitest'

import { createProductEventService } from './product-events'

describe('productEventService', () => {
  it('routes confirmed product facts to OpenPanel with stable AIRI user ids', async () => {
    const capture = vi.fn<(input: ProductCaptureInput) => Promise<void>>().mockResolvedValue(undefined)
    const service = createProductEventService({ capture })
    await service.track({ userId: 'user-1', feature: 'auth', action: 'user_signed_up', status: 'succeeded' })
    await service.track({ userId: 'user-2', feature: 'billing', action: 'checkout_started', status: 'succeeded' })

    expect(capture).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      event: 'signup_completed',
      properties: { app_surface: 'server', airi_user_id: 'user-1', feature: 'auth', status: 'succeeded' },
    })
    expect(capture).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: 'user-2', event: 'checkout_created' }))
  })

  it('passes the checkout device id and source event id without an extra identify event', async () => {
    const capture = vi.fn<(input: ProductCaptureInput) => Promise<void>>().mockResolvedValue(undefined)
    const service = createProductEventService({ capture })
    await service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
      eventId: 'cs_123',
      metadata: { openpanel_device_id: 'browser-1', amount_total: 990, currency: 'usd' },
    })
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith({
      userId: 'user-1',
      deviceId: 'browser-1',
      event: 'payment_completed',
      properties: {
        openpanel_device_id: 'browser-1',
        amount_total: 990,
        currency: 'usd',
        event_id: 'cs_123',
        app_surface: 'server',
        airi_user_id: 'user-1',
        feature: 'billing',
        status: 'succeeded',
      },
    })
  })

  it('rejects metadata that can forge provider identity or the source event id', async () => {
    const capture = vi.fn(async () => {})
    const service = createProductEventService({ capture })
    for (const key of ['event_id', '__deviceId', 'profileId']) {
      await service.track({ userId: 'user-1', feature: 'billing', action: 'payment_completed', status: 'succeeded', metadata: { [key]: 'forged' } })
    }
    expect(capture).not.toHaveBeenCalled()
  })

  it('does not fail the business path when OpenPanel is unavailable', async () => {
    const capture = vi.fn(async () => {
      throw new Error('unavailable')
    })
    const service = createProductEventService({ capture })
    await expect(service.track({ userId: 'user-1', feature: 'billing', action: 'payment_completed', status: 'succeeded' })).resolves.toBeUndefined()
  })
})
