import type { BillingService } from '../billing-service'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestRedis } from '../../../../libs/tests/redis'
import { createFluxMeter } from '../flux-meter'

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('fluxMeter', () => {
  let redis: ReturnType<typeof createTestRedis>
  let billing: BillingService

  beforeEach(() => {
    redis = createTestRedis()
    billing = createMockBilling()
  })

  it('does not debit when accumulated units stay below threshold', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    const result = await meter.accumulate({
      userId: 'u1',
      units: 500,
      currentBalance: 10,
      requestId: 'req-1',
    })

    expect(result).toEqual({ fluxDebited: 0, debtAfter: 500, balanceAfter: 10, unbilledFlux: 0 })
    expect(billing.consumeFluxForLLM).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r3960258136
  // ROOT CAUSE:
  //
  // The meter stored only the numeric residual debt. If round A left 700
  // units and round B added 400 units, the debit used round B metadata for
  // all 1,000 settled units.
  //
  // The meter now keeps residual ownership. A mixed settlement does not claim
  // one round. The residual owner becomes round B after the mixed settlement.
  it('does not assign a mixed threshold crossing to the latest round', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    await meter.accumulate({
      userId: 'u1',
      units: 700,
      currentBalance: 10,
      requestId: 'a',
      correlation: { conversationId: 'conversation-1', roundId: 'round-a' },
    })
    const result = await meter.accumulate({
      userId: 'u1',
      units: 400,
      currentBalance: 10,
      requestId: 'b',
      metadata: { model: 'tts-model' },
      correlation: { conversationId: 'conversation-1', roundId: 'round-b' },
    })

    expect(result.fluxDebited).toBe(1)
    expect(result.debtAfter).toBe(100)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledTimes(1)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1,
      requestId: 'b',
      description: 'tts_request',
      model: 'tts-model',
    }))
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.not.objectContaining({
      correlation: expect.anything(),
    }))

    await meter.accumulate({
      userId: 'u1',
      units: 900,
      currentBalance: 9,
      requestId: 'c',
      correlation: { conversationId: 'conversation-1', roundId: 'round-b' },
    })

    expect(billing.consumeFluxForLLM).toHaveBeenLastCalledWith(expect.objectContaining({
      amount: 1,
      requestId: 'c',
      correlation: { conversationId: 'conversation-1', roundId: 'round-b' },
    }))
  })

  it('preserves one round across a threshold crossing', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })
    const correlation = { conversationId: 'conversation-1', roundId: 'round-1' }

    await meter.accumulate({ userId: 'u1', units: 700, currentBalance: 10, requestId: 'a', correlation })
    await meter.accumulate({ userId: 'u1', units: 400, currentBalance: 10, requestId: 'b', correlation })

    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({ correlation }))
  })

  it('debits multiple flux when one request crosses several thresholds', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    const result = await meter.accumulate({ userId: 'u1', units: 3500, currentBalance: 10, requestId: 'big' })

    expect(result.fluxDebited).toBe(3)
    expect(result.debtAfter).toBe(500)
    expect(billing.consumeFluxForLLM).toHaveBeenCalledWith(expect.objectContaining({ amount: 3 }))
  })

  it('returns 0 fluxDebited for zero, negative, or non-finite units', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await meter.accumulate({ userId: 'u1', units: bad, currentBalance: 10, requestId: 'x' })
      expect(result.fluxDebited).toBe(0)
    }
    expect(billing.consumeFluxForLLM).not.toHaveBeenCalled()
  })

  it('throws 402 when projected debt would exceed user balance', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    await expect(meter.assertCanAfford('u1', 5000, 2)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('allows sub-threshold accumulation when balance >= 1', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })
    await expect(meter.assertCanAfford('u1', 200, 1)).resolves.toBeUndefined()
  })

  it('rejects sub-threshold accumulation when balance is zero', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })
    await expect(meter.assertCanAfford('u1', 200, 0)).rejects.toMatchObject({ statusCode: 402 })
  })

  it('throws from runtime resolver when unitsPerFlux is invalid', async () => {
    const meter = createFluxMeter(redis, billing, {
      name: 'bad',
      resolveRuntime: async () => ({ unitsPerFlux: 0, debtTtlSeconds: 60 }),
    })
    await expect(meter.accumulate({ userId: 'u1', units: 10, currentBalance: 10, requestId: 'r' })).rejects.toThrow()
  })

  it('peekDebt reflects current accumulated units', async () => {
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() })

    await meter.accumulate({ userId: 'u1', units: 250, currentBalance: 10, requestId: 'p' })
    expect(await meter.peekDebt('u1')).toBe(250)
  })

  it('does not read config at construction time (lazy resolver)', async () => {
    const resolver = staticRuntime()

    createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: resolver })

    expect(resolver).not.toHaveBeenCalled()
  })

  it('resolves runtime on every call so multi-instance config changes propagate immediately', async () => {
    const resolver = staticRuntime()
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: resolver })

    await meter.accumulate({ userId: 'u1', units: 100, currentBalance: 10, requestId: 'a' })
    await meter.accumulate({ userId: 'u1', units: 100, currentBalance: 10, requestId: 'b' })
    await meter.assertCanAfford('u1', 100, 10)

    expect(resolver).toHaveBeenCalledTimes(3)
  })

  it('restores debt back into the counter when billing debit throws', async () => {
    // Billing rejects the exact flux amount we expect to settle.
    const failingBilling = createMockBilling({ throwOn: 2 })
    const meter = createFluxMeter(redis, failingBilling, { name: 'tts', resolveRuntime: staticRuntime() })

    await expect(
      meter.accumulate({ userId: 'u1', units: 2500, currentBalance: 10, requestId: 'fail' }),
    ).rejects.toThrow('mock billing failure')

    // Settlement was rolled back: 2500 units should be fully recovered
    // (500 residual + 2000 rolled back), not 500.
    expect(await meter.peekDebt('u1')).toBe(2500)
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r3962162510
  // ROOT CAUSE:
  //
  // A failed settlement restored its stale owner after a concurrent request
  // had already written a different residual owner. The restored mixed debt
  // could therefore be assigned to only one round.
  //
  // The restore script now reads and merges the current owner atomically.
  it('marks restored debt as mixed when another owner accumulates during billing', async () => {
    const billingStarted = deferred<void>()
    const releaseBilling = deferred<void>()
    const concurrentBilling = createMockBilling()
    vi.mocked(concurrentBilling.consumeFluxForLLM).mockImplementation(async ({ userId, amount, requestId }) => {
      if (requestId === 'a') {
        billingStarted.resolve()
        await releaseBilling.promise
        throw new Error('mock billing failure')
      }
      return { userId, flux: 100 - amount, charged: amount, requested: amount }
    })
    const meter = createFluxMeter(redis, concurrentBilling, { name: 'tts', resolveRuntime: staticRuntime() })

    const firstSettlement = meter.accumulate({
      userId: 'u1',
      units: 1000,
      currentBalance: 10,
      requestId: 'a',
      correlation: { conversationId: 'conversation-1', roundId: 'round-a' },
    })
    const failedSettlement = expect(firstSettlement).rejects.toThrow('mock billing failure')
    await billingStarted.promise

    await meter.accumulate({
      userId: 'u1',
      units: 500,
      currentBalance: 10,
      requestId: 'b',
      correlation: { conversationId: 'conversation-1', roundId: 'round-b' },
    })
    releaseBilling.resolve()
    await failedSettlement

    await meter.accumulate({
      userId: 'u1',
      units: 500,
      currentBalance: 10,
      requestId: 'c',
      correlation: { conversationId: 'conversation-1', roundId: 'round-a' },
    })

    expect(concurrentBilling.consumeFluxForLLM).toHaveBeenLastCalledWith(expect.objectContaining({
      amount: 2,
      requestId: 'c',
    }))
    expect(concurrentBilling.consumeFluxForLLM).toHaveBeenLastCalledWith(expect.not.objectContaining({
      correlation: expect.anything(),
    }))
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
    const meter = createFluxMeter(redis, partialBilling, { name: 'tts', resolveRuntime: staticRuntime() }, metrics)

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
    expect(fluxUnbilled.add).toHaveBeenCalledWith(2, expect.objectContaining({
      'source': 'tts_meter',
      'meter': 'tts',
      'reason': 'partial_debit_drained',
      'gen_ai.request.model': 'eleven_multilingual_v2',
    }))
  })

  it('does not report fluxUnbilled when billing fully charges', async () => {
    const { metrics, fluxUnbilled } = createMockMetrics()
    const meter = createFluxMeter(redis, billing, { name: 'tts', resolveRuntime: staticRuntime() }, metrics)

    const result = await meter.accumulate({ userId: 'u1', units: 1500, currentBalance: 10, requestId: 'full' })

    expect(result.fluxDebited).toBe(1)
    expect(result.unbilledFlux).toBe(0)
    expect(fluxUnbilled.add).not.toHaveBeenCalled()
  })
})
