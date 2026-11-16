import type { ProductCaptureInput } from './product-analytics'

import { describe, expect, it, vi } from 'vitest'

import { createFanoutSink } from './product-analytics'

const input: ProductCaptureInput = { userId: 'user-1', event: 'payment_completed', properties: { amount_total: 990 } }

describe('createFanoutSink', () => {
  it('returns null when no provider is configured', () => {
    expect(createFanoutSink([])).toBeNull()
  })

  it('sends each fact to every provider', async () => {
    const openpanel = vi.fn<(input: ProductCaptureInput) => Promise<void>>().mockResolvedValue(undefined)
    const posthog = vi.fn<(input: ProductCaptureInput) => Promise<void>>().mockResolvedValue(undefined)
    const sink = createFanoutSink([
      { name: 'openpanel', sink: { capture: openpanel } },
      { name: 'posthog', sink: { capture: posthog } },
    ])

    await sink?.capture(input)

    expect(openpanel).toHaveBeenCalledWith(input)
    expect(posthog).toHaveBeenCalledWith(input)
  })

  it('still delivers to the other providers and names the failed one', async () => {
    const posthog = vi.fn<(input: ProductCaptureInput) => Promise<void>>().mockResolvedValue(undefined)
    const sink = createFanoutSink([
      { name: 'openpanel', sink: { capture: async () => { throw new Error('rejected (401)') } } },
      { name: 'posthog', sink: { capture: posthog } },
    ])

    await expect(sink?.capture(input)).rejects.toThrow('Product event delivery failed (openpanel: rejected (401))')
    expect(posthog).toHaveBeenCalledWith(input)
  })
})
