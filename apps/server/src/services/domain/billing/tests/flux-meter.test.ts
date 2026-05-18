import type Redis from 'ioredis'

import type { BillingService } from '../billing-service'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFluxMeter } from '../flux-meter'

function createMockRedis() {
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

  const incrby = vi.fn(async (key: string, amount: number) => {
    const next = (store.get(key) ?? 0) + amount
    store.set(key, next)
    return next
  })

  const expire = vi.fn(async () => 1)

  return {
    redis: {
      eval: evalImpl,
      incrby,
      expire,
      get: vi.fn(async (key: string) => {
        const v = store.get(key)
        return v == null ? null : String(v)
      }),
    } as unknown as Redis,
    store,
    incrby,
  }
}

function createMockBilling(opts: { throwOn?: number, partialChargeOn?: { amount: number, charged: number } } = {}): BillingService {
  return {
    consumeFluxForLLM: vi.fn(async ({ userId, amount }: { userId: string, amount: number }) => {
      if (opts.throwOn != null && amount === opts.throwOn)
        throw new Error('mock billing failure')
      // Mirror real billing-service partial-debit semantics: drain to zero
      // returns `charged < requested`.
      if (opts.partialChargeOn != null && amount === opts.partialChargeOn.amount) {
        return { userId, flux: 0, charged: opts.partialChargeOn.charged, requested: amount }
      }
      return { userId, flux: 100 - amount, charged: amount, requested: amount }
    }),
  } as unknown as BillingService
}

function createMockMetrics() {
  const fluxUnbilled = { add: vi.fn() }
  const ttsChars = { add: vi.fn() }
  const ttsPreflightRejections = { add: vi.fn() }
  return {
    metrics: { fluxUnbilled, ttsChars, ttsPreflightRejections } as any,
    fluxUnbilled,
  }
}

function staticRuntime(unitsPerFlux = 1000, debtTtlSeconds = 60) {
  return vi.fn(async () => ({ unitsPerFlux, debtTtlSeconds }))
}

describe('fluxMeter', () => {
  let mockRedis: ReturnType<typeof createMockRedis>
  let billing: BillingService

  beforeEach(() => {
    mockRedis = createMockRedis()
    billing = createMockBilling()
  })

  it('does not debit when accumulated units stay below threshold', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    const result = await meter.accumulate({
      userId: 'u1',
      units: 500,
      currentBalance: 10,
      requestId: 'req-1',
    })

    expect(result).toEqual({ fluxDebited: 0, debtAfter: 500, balanceAfter: 10, unbilledFlux: 0 })
    expect(billing.consumeFluxForLLM).not.toHaveBeenCalled()
  })

  it('debits exactly one flux when crossing the threshold', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    await meter.accumulate({ userId: 'u1', units: 700, currentBalance: 10, requestId: 'a' })
    const result = await meter.accumulate({ userId: 'u1', units: 400, currentBalance: 10, requestId: 'b' })

    expect(result.fluxDebited).toBe(1)
    expect(result.debtAfter).toBe(100)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledTimes(1)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1,
      requestId: 'b',
      description: 'tts_request',
    }))
  })

  it('debits multiple flux when one request crosses several thresholds', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    const result = await meter.accumulate({ userId: 'u1', units: 3500, currentBalance: 10, requestId: 'big' })

    expect(result.fluxDebited).toBe(3)
    expect(result.debtAfter).toBe(500)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({ amount: 3 }))
  })

  it('returns 0 fluxDebited for zero, negative, or non-finite units', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await meter.accumulate({ userId: 'u1', units: bad, currentBalance: 10, requestId: 'x' })
      expect(result.fluxDebited).toBe(0)
    }
    expect(billing.consumeFluxForLLM).not.toHaveBeenCalled()
  })

  it('throws 402 when projected debt would exceed user balance', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    await expect(meter.assertCanAfford('u1', 5000, 2)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('allows sub-threshold accumulation when balance >= 1', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })
    await expect(meter.assertCanAfford('u1', 200, 1)).resolves.toBeUndefined()
  })

  it('rejects sub-threshold accumulation when balance is zero', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })
    await expect(meter.assertCanAfford('u1', 200, 0)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('throws from runtime resolver when unitsPerFlux is invalid', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, {
      name: 'bad',
      resolveRuntime: async () => ({ unitsPerFlux: 0, debtTtlSeconds: 60 }),
    })
    await expect(meter.accumulate({ userId: 'u1', units: 10, currentBalance: 10, requestId: 'r' })).rejects.toThrow()
  })

  it('peekDebt reflects current accumulated units', async () => {
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    await meter.accumulate({ userId: 'u1', units: 250, currentBalance: 10, requestId: 'p' })
    expect(await meter.peekDebt('u1')).toBe(250)
  })

  it('does not read config at construction time (lazy resolver)', async () => {
    const resolver = staticRuntime()

    createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: resolver })

    expect(resolver).not.toHaveBeenCalled()
  })

  it('resolves runtime on every call so multi-instance config changes propagate immediately', async () => {
    const resolver = staticRuntime()
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: resolver })

    await meter.accumulate({ userId: 'u1', units: 100, currentBalance: 10, requestId: 'a' })
    await meter.accumulate({ userId: 'u1', units: 100, currentBalance: 10, requestId: 'b' })
    await meter.assertCanAfford('u1', 100, 10)

    expect(resolver).toHaveBeenCalledTimes(3)
  })

  it('restores debt back into the counter when billing debit throws', async () => {
    // Billing rejects the exact flux amount we expect to settle.
    const failingBilling = createMockBilling({ throwOn: 2 })
    const meter = createFluxMeter(mockRedis.redis, failingBilling, { name: 'tts', resolveRuntime: staticRuntime() })

    await expect(
      meter.accumulate({ userId: 'u1', units: 2500, currentBalance: 10, requestId: 'fail' }),
    ).rejects.toThrow('mock billing failure')

    // Settlement was rolled back: 2500 units should be fully recovered
    // (500 residual + 2000 rolled back), not 500.
    expect(await meter.peekDebt('u1')).toBe(2500)
    expect(mockRedis.incrby).toHaveBeenCalledWith(expect.stringContaining('u1'), 2000)
  })

  // ROOT CAUSE:
  //
  // Prior to commit 7267b0d6b billing-service.consumeFluxForLLM threw on
  // any insufficient-balance, which let flux-meter's catch path restore
  // the *entire* settled portion back to the debt counter. After that
  // commit billing-service introduced partial-debit semantics: when
  // 0 < balance < amount, it drains the balance to zero and returns
  // `charged < requested` instead of throwing. flux-meter.accumulate
  // continued to read only `{ flux }` from the result, so:
  //   - the un-charged portion (`requested - charged` flux) was silently
  //     lost — Redis debt was already DECRBY'd by the LUA script,
  //   - airi_billing_flux_unbilled_total never fired for tts_meter, so
  //     the partial-debit revenue leak was invisible in Grafana.
  //
  // After patch: accumulate destructures `charged / requested`, restores
  // `(requested - charged) * unitsPerFlux` back into the debt counter, and
  // increments airi_billing_flux_unbilled_total with
  // `{ source: 'tts_meter', reason: 'partial_debit_drained' }`.
  it('restores partial-drain delta to debt and reports fluxUnbilled (Issue: unpaid-usage-exploit follow-up)', async () => {
    // After settlement the meter wants to debit 3 flux, but billing only
    // manages to charge 1 (user balance was 1 flux). Expect:
    //  - fluxDebited == 1 (actual charged), not 3
    //  - unbilledFlux == 2
    //  - Redis debt restored by 2 * unitsPerFlux = 2000
    //  - fluxUnbilled metric incremented by 2 with partial_debit_drained reason
    const partialBilling = createMockBilling({ partialChargeOn: { amount: 3, charged: 1 } })
    const { metrics, fluxUnbilled } = createMockMetrics()
    const meter = createFluxMeter(mockRedis.redis, partialBilling, { name: 'tts', resolveRuntime: staticRuntime() }, metrics)

    const result = await meter.accumulate({
      userId: 'u1',
      units: 3500,
      currentBalance: 1,
      requestId: 'partial',
      metadata: { model: 'eleven_multilingual_v2' },
    })

    expect(result.fluxDebited).toBe(1)
    expect(result.unbilledFlux).toBe(2)
    expect(result.balanceAfter).toBe(0)
    // Debt = 500 residual (LUA leftover) + 2000 restored from partial drain.
    expect(await meter.peekDebt('u1')).toBe(2500)
    expect(mockRedis.incrby).toHaveBeenCalledWith(expect.stringContaining('u1'), 2000)
    expect(fluxUnbilled.add).toHaveBeenCalledWith(2, expect.objectContaining({
      'source': 'tts_meter',
      'meter': 'tts',
      'reason': 'partial_debit_drained',
      'gen_ai.request.model': 'eleven_multilingual_v2',
    }))
  })

  it('does not report fluxUnbilled when billing fully charges', async () => {
    const { metrics, fluxUnbilled } = createMockMetrics()
    const meter = createFluxMeter(mockRedis.redis, billing, { name: 'tts', resolveRuntime: staticRuntime() }, metrics)

    const result = await meter.accumulate({ userId: 'u1', units: 1500, currentBalance: 10, requestId: 'full' })

    expect(result.fluxDebited).toBe(1)
    expect(result.unbilledFlux).toBe(0)
    expect(fluxUnbilled.add).not.toHaveBeenCalled()
  })
})
