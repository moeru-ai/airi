import type Redis from 'ioredis'

import type { RevenueMetrics } from '../../../otel'
import type { BillingService } from './billing-service'

import { useLogger } from '@guiiai/logg'

import { createPaymentRequiredError } from '../../../utils/error'
import { GEN_AI_ATTR_REQUEST_MODEL } from '../../../utils/observability'
import { userFluxMeterDebtRedisKey } from '../../../utils/redis-keys'

const logger = useLogger('flux-meter')

// NOTICE: Atomic accumulate-and-settle. Integer Flux is the billing unit, but the
// metered service (TTS chars, STT seconds, tokens, ...) charges at sub-Flux
// granularity. We keep unsettled small units in a Redis counter and only debit
// whole Flux when the counter crosses `unitsPerFlux`. Residual <unitsPerFlux
// survives via TTL; callers accept that sub-1-Flux dust may expire unbilled.
const ACCUMULATE_SCRIPT = `
local key = KEYS[1]
local units = tonumber(ARGV[1])
local unitsPerFlux = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local debt = redis.call('INCRBY', key, units)
redis.call('EXPIRE', key, ttl)

if debt >= unitsPerFlux then
  local flux = math.floor(debt / unitsPerFlux)
  local consumed = flux * unitsPerFlux
  redis.call('DECRBY', key, consumed)
  return {flux, debt - consumed}
end

return {0, debt}
`

export type FluxMeter = ReturnType<typeof createFluxMeter>

interface AccumulateInput {
  currentBalance: number
  metadata?: Record<string, unknown>
  requestId: string
  units: number
  userId: string
}

interface AccumulateResult {
  /** User's flux balance after this call. */
  balanceAfter: number
  /** Residual debt left in Redis after this call. Includes unbilled units restored on partial drain. */
  debtAfter: number
  /** Actual flux charged to the user (== amount we are sure was billed). */
  fluxDebited: number
  /**
   * Flux that crossed the meter threshold but couldn't be charged because the
   * user's balance was lower than what the request required. > 0 means the
   * user received service they only partially paid for. Reflects the gap
   * between `requested` and `charged` returned by `billingService.consumeFluxForLLM`.
   */
  unbilledFlux: number
}

interface FluxMeterConfig {
  /** Meter identifier, used as Redis key segment and billing description prefix. */
  name: string
  /**
   * Resolves runtime pricing/TTL per call. Reads from Redis-backed configKV,
   * so every instance sees config changes immediately. Called lazily so a
   * missing pricing config surfaces as a per-request 503 (handled by the
   * route's configGuard), not as a server-wide startup failure.
   *
   * NOTICE: Do NOT memoise across calls. Multi-instance deploys would then
   * disagree on billing rate during config rollout windows.
   */
  resolveRuntime: () => Promise<FluxMeterRuntime>
}

interface FluxMeterRuntime {
  /** Debt key TTL. Residual debt below unitsPerFlux is forgiven on expiry. */
  debtTtlSeconds: number
  /** How many small units equal one Flux. */
  unitsPerFlux: number
}

/**
 * Creates a metered Flux consumer for services that charge in small units
 * (TTS chars, STT seconds, embedding tokens). Accumulates usage in Redis and
 * only triggers a Flux debit when accumulated units cross the integer boundary.
 *
 * @see docs/ai-context/flux-meter.md
 */
export function createFluxMeter(
  redis: Redis,
  billingService: BillingService,
  config: FluxMeterConfig,
  metrics?: null | RevenueMetrics,
) {
  async function getRuntime(): Promise<FluxMeterRuntime> {
    const runtime = await config.resolveRuntime()
    if (runtime.unitsPerFlux <= 0)
      throw new Error(`Invalid unitsPerFlux ${runtime.unitsPerFlux} for meter ${config.name}`)

    return runtime
  }

  async function runScript(key: string, units: number, runtime: FluxMeterRuntime): Promise<[number, number]> {
    const raw = await redis.eval(
      ACCUMULATE_SCRIPT,
      1,
      key,
      units,
      runtime.unitsPerFlux,
      runtime.debtTtlSeconds,
    ) as [number | string, number | string]

    return [Number(raw[0]), Number(raw[1])]
  }

  async function readDebt(userId: string): Promise<number> {
    const raw = await redis.get(userFluxMeterDebtRedisKey(userId, config.name))
    return raw == null ? 0 : Number(raw)
  }

  /**
   * Pre-flight balance check. Throws 402 if the user cannot afford the worst-case
   * Flux consumption implied by current debt + new units. Call before invoking
   * the upstream service so we fail fast and refuse to render unbillable usage.
   */
  async function assertCanAfford(userId: string, newUnits: number, currentBalance: number): Promise<void> {
    const runtime = await getRuntime()
    const existingDebt = await readDebt(userId)
    const projectedFlux = Math.floor((existingDebt + newUnits) / runtime.unitsPerFlux)
    // At minimum require the user can cover a single Flux crossing; avoids
    // letting zero-balance users accumulate indefinitely on the boundary.
    const required = Math.max(projectedFlux, currentBalance <= 0 ? 1 : 0)
    if (currentBalance < required) {
      metrics?.ttsPreflightRejections.add(1, { meter: config.name, reason: 'insufficient_balance' })
      throw createPaymentRequiredError('Insufficient flux')
    }
  }

  /**
   * Accumulate usage, atomically settle any whole-Flux portion, and record the
   * debit via BillingService. Returns 0 fluxDebited when the new usage does
   * not cross a Flux boundary (cheap path for short TTS segments).
   */
  async function accumulate(input: AccumulateInput): Promise<AccumulateResult> {
    if (!Number.isFinite(input.units) || input.units <= 0)
      return { balanceAfter: input.currentBalance, debtAfter: await readDebt(input.userId), fluxDebited: 0, unbilledFlux: 0 }

    const modelLabel = typeof input.metadata?.model === 'string' ? input.metadata.model : 'unknown'
    metrics?.ttsChars.add(input.units, { meter: config.name, model: modelLabel })

    const runtime = await getRuntime()
    const key = userFluxMeterDebtRedisKey(input.userId, config.name)
    const [fluxRequested, debtAfterSettlement] = await runScript(key, input.units, runtime)

    if (fluxRequested === 0) {
      logger.withFields({
        debtAfter: debtAfterSettlement,
        meter: config.name,
        units: input.units,
        userId: input.userId,
      }).debug('Accumulated units below flux threshold')
      return { balanceAfter: input.currentBalance, debtAfter: debtAfterSettlement, fluxDebited: 0, unbilledFlux: 0 }
    }

    let result: Awaited<ReturnType<typeof billingService.consumeFluxForLLM>>
    try {
      result = await billingService.consumeFluxForLLM({
        amount: fluxRequested,
        description: `${config.name}_request`,
        requestId: input.requestId,
        userId: input.userId,
        ...(typeof input.metadata?.model === 'string' && { model: input.metadata.model }),
      })
    }
    catch (error) {
      // The billing call threw (balance <= 0 hard floor, transient DB error,
      // network blip). The debit did NOT commit, so restore the full
      // already-settled portion back into the debt counter for the next
      // request to retry.
      const restoreUnits = fluxRequested * runtime.unitsPerFlux
      try {
        await redis.incrby(key, restoreUnits)
        await redis.expire(key, runtime.debtTtlSeconds)
      }
      catch (rollbackError) {
        logger.withError(rollbackError).withFields({
          meter: config.name,
          requestId: input.requestId,
          restoreUnits,
          userId: input.userId,
        }).error('Failed to roll back meter debt after billing failure')
      }
      throw error
    }

    // Billing-service invariant — checked OUTSIDE the try/catch above so a
    // post-debit assertion failure does NOT trigger the "restore full debt"
    // rollback path. The DB tx already committed `result.charged`; restoring
    // `fluxRequested * unitsPerFlux` would set up a double-charge on the
    // next request (LUA re-settles the restored debt, billing re-debits the
    // same usage). Surface loud, but don't compensate.
    if (!Number.isInteger(result.charged) || result.charged < 0 || result.charged > result.requested) {
      logger.withFields({
        charged: result.charged,
        meter: config.name,
        requested: result.requested,
        requestId: input.requestId,
        userId: input.userId,
      }).error('billing-service returned invalid charged/requested — manual reconciliation needed')
      throw new Error(`billing-service returned invalid charged=${result.charged} for requested=${result.requested}`)
    }

    // Partial-debit path: balance was insufficient and `debitFlux` drained
    // it to zero. We've already DECRBY'd `fluxRequested * unitsPerFlux` from
    // the debt counter via the LUA script, but only `result.charged` of
    // those flux were actually billed. Restore the gap so the debt counter
    // reflects the user's true outstanding obligation, and surface it on
    // the same `fluxUnbilled` counter the streaming/non-streaming chat
    // paths use (different `reason` label).
    //
    // REVIEW: Settlement (LUA `runScript`) and the `INCRBY` restore below
    // are not atomic. A concurrent `accumulate()` could observe the debt
    // counter mid-window (between DECRBY and the restore INCRBY) and
    // mis-bill. In practice the window is small (one in-flight DB tx) and
    // a re-billing attempt would land in the same partial-debit branch,
    // but the right long-term fix is either a short Redis lock keyed by
    // `{userId, meter}` around `runScript → consumeFluxForLLM → restore`,
    // or moving the unbilled portion into a separate Redis key that the
    // LUA script doesn't touch. See codex review thread on PR.
    if (result.charged < result.requested) {
      const unbilledFlux = result.requested - result.charged
      const restoreUnits = unbilledFlux * runtime.unitsPerFlux

      metrics?.fluxUnbilled.add(unbilledFlux, {
        meter: config.name,
        reason: 'partial_debit_drained',
        source: 'tts_meter',
        ...(typeof input.metadata?.model === 'string' && { [GEN_AI_ATTR_REQUEST_MODEL]: input.metadata.model }),
      })

      let debtAfterRestore = debtAfterSettlement
      try {
        debtAfterRestore = await redis.incrby(key, restoreUnits)
        await redis.expire(key, runtime.debtTtlSeconds)
      }
      catch (rollbackError) {
        // Log loudly so on-call can reconcile manually; don't shadow the
        // partial-debit signal by re-throwing.
        logger.withError(rollbackError).withFields({
          meter: config.name,
          requestId: input.requestId,
          restoreUnits,
          userId: input.userId,
        }).error('Failed to restore meter debt after partial-debit drain')
      }

      logger.withFields({
        charged: result.charged,
        meter: config.name,
        requested: result.requested,
        requestId: input.requestId,
        restoreUnits,
        unbilledFlux,
        userId: input.userId,
      }).warn('Partial debit on flux meter — flux drained to zero')

      return {
        balanceAfter: result.flux,
        debtAfter: debtAfterRestore,
        fluxDebited: result.charged,
        unbilledFlux,
      }
    }

    return { balanceAfter: result.flux, debtAfter: debtAfterSettlement, fluxDebited: result.charged, unbilledFlux: 0 }
  }

  return {
    accumulate,
    assertCanAfford,
    config,
    peekDebt: readDebt,
  }
}
