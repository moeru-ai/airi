import type Redis from 'ioredis'

import type { BillingService } from '../billing-service'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFluxMeter } from '../flux-meter'

function createMockRedis(): Redis {
  const store = new Map<string, number>()

  // NOTICE: Mimic the subset of EVAL semantics used by ACCUMULATE_SCRIPT
  // (INCRBY + EXPIRE + conditional DECRBY). Sufficient for unit tests; the real
  // atomicity is verified by ioredis hitting Redis in integration.
  const evalImpl = vi.fn(async (
    _script: string,
    _numKeys: number,
    key: string,
    units: string | number,
    unitsPerFlux: string | number,
    _ttl: string | number,
  ) => {
    const u = Number(units)
    const upf = Number(unitsPerFlux)
    const debt = (store.get(key) ?? 0) + u
    store.set(key, debt)
    if (debt >= upf) {
      const flux = Math.floor(debt / upf)
      const consumed = flux * upf
      store.set(key, debt - consumed)
      return [flux, debt - consumed]
    }
    return [0, debt]
  })

  return {
    eval: evalImpl,
    get: vi.fn(async (key: string) => {
      const v = store.get(key)
      return v == null ? null : String(v)
    }),
  } as unknown as Redis
}

function createMockBilling(): BillingService {
  return {
    consumeFluxForLLM: vi.fn(async ({ userId, amount }: { userId: string, amount: number }) => ({
      userId,
      flux: 100 - amount,
    })),
  } as unknown as BillingService
}

describe('fluxMeter', () => {
  let redis: Redis
  let billing: BillingService

  beforeEach(() => {
    redis = createMockRedis()
    billing = createMockBilling()
  })

  it('does not debit when accumulated units stay below threshold', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    const result = await meter.accumulate({
      userId: 'u1',
      units: 500,
      currentBalance: 10,
      requestId: 'req-1',
    })

    expect(result).toEqual({ fluxDebited: 0, debtAfter: 500, balanceAfter: 10 })
    expect(billing.consumeFluxForLLM).not.toHaveBeenCalled()
  })

  it('debits exactly one flux when crossing the threshold', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    await meter.accumulate({ userId: 'u1', units: 700, currentBalance: 10, requestId: 'a' })
    const result = await meter.accumulate({ userId: 'u1', units: 400, currentBalance: 10, requestId: 'b' })

    expect(result.fluxDebited).toBe(1)
    expect(result.debtAfter).toBe(100)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledTimes(1)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1,
      requestId: 'b',
      description: 'metered:tts',
    }))
  })

  it('debits multiple flux when one request crosses several thresholds', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    const result = await meter.accumulate({ userId: 'u1', units: 3500, currentBalance: 10, requestId: 'big' })

    expect(result.fluxDebited).toBe(3)
    expect(result.debtAfter).toBe(500)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({ amount: 3 }))
  })

  it('returns 0 fluxDebited for zero or negative units without touching billing', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    const result = await meter.accumulate({ userId: 'u1', units: 0, currentBalance: 10, requestId: 'noop' })

    expect(result.fluxDebited).toBe(0)
    expect(billing.consumeFluxForLLM).not.toHaveBeenCalled()
  })

  it('throws 402 when projected debt would exceed user balance', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    await expect(
      meter.assertCanAfford('u1', 5000, 2),
    ).rejects.toMatchObject({ statusCode: 402 })
  })

  it('allows sub-threshold accumulation when balance >= 1', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    await expect(meter.assertCanAfford('u1', 200, 1)).resolves.toBeUndefined()
  })

  it('rejects sub-threshold accumulation when balance is zero', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    await expect(meter.assertCanAfford('u1', 200, 0)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('rejects invalid unitsPerFlux at construction time', () => {
    expect(() => createFluxMeter(redis, billing, { name: 'bad', unitsPerFlux: 0, debtTtlSeconds: 60 })).toThrow()
  })

  it('peekDebt reflects current accumulated units', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', unitsPerFlux: 1000, debtTtlSeconds: 60 })

    await meter.accumulate({ userId: 'u1', units: 250, currentBalance: 10, requestId: 'p' })
    expect(await meter.peekDebt('u1')).toBe(250)
  })
})
