import type Redis from 'ioredis'

import type { RevenueMetrics } from '../../../otel'
import type { BillingService } from './billing-service'
import type { TtsBillingCorrelation } from './tts-correlation'

import { useLogger } from '@guiiai/logg'

import { createPaymentRequiredError } from '../../../utils/error'
import { GEN_AI_ATTR_REQUEST_MODEL } from '../../../utils/observability'
import { userFluxMeterDebtOwnerRedisKey, userFluxMeterDebtRedisKey } from '../../../utils/redis-keys'
import { resolveTtsBillingCorrelationToken, serializeTtsBillingCorrelation } from './tts-correlation'

const logger = useLogger('flux-meter')

// NOTICE: Atomic accumulate-and-settle. Integer Flux is the billing unit, but the
// metered service (TTS chars, STT seconds, tokens, ...) charges at sub-Flux
// granularity. We keep unsettled small units in a Redis counter and only debit
// whole Flux when the counter crosses `unitsPerFlux`. Residual <unitsPerFlux
// survives via TTL; callers accept that sub-1-Flux dust may expire unbilled.
const MIXED_OWNER_TOKEN = '__mixed__'

const ACCUMULATE_SCRIPT = `
local debtKey = KEYS[1]
local ownerKey = KEYS[2]
local units = tonumber(ARGV[1])
local unitsPerFlux = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local incomingOwner = ARGV[4]
local mixedOwner = ARGV[5]

local previousDebt = tonumber(redis.call('GET', debtKey) or '0')
local previousOwner = redis.call('GET', ownerKey) or ''
local combinedOwner = incomingOwner
if previousDebt > 0 and (previousOwner == '' or previousOwner ~= incomingOwner) then
  combinedOwner = mixedOwner
end

local debt = redis.call('INCRBY', debtKey, units)
redis.call('EXPIRE', debtKey, ttl)
local flux = 0
local debtAfter = debt
if debt >= unitsPerFlux then
  flux = math.floor(debt / unitsPerFlux)
  local consumed = flux * unitsPerFlux
  redis.call('DECRBY', debtKey, consumed)
  debtAfter = debt - consumed
end

local settledOwner = ''
if flux > 0 then
  settledOwner = combinedOwner
end

local residualOwner = combinedOwner
if debtAfter <= 0 then
  redis.call('DEL', ownerKey)
  residualOwner = ''
else
  if flux > 0 and units >= debtAfter then
    residualOwner = incomingOwner
  end

  if residualOwner == '' then
    redis.call('DEL', ownerKey)
  else
    redis.call('SET', ownerKey, residualOwner, 'EX', ttl)
  end
end

return {flux, debtAfter, settledOwner, combinedOwner, residualOwner}
`

const RESTORE_SCRIPT = `
local debtKey = KEYS[1]
local ownerKey = KEYS[2]
local units = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local restoredOwner = ARGV[3]
local mixedOwner = ARGV[4]

local currentDebt = tonumber(redis.call('GET', debtKey) or '0')
local currentOwner = redis.call('GET', ownerKey) or ''
local owner = restoredOwner
if currentDebt > 0 and (currentOwner == '' or restoredOwner == '' or currentOwner ~= restoredOwner) then
  owner = mixedOwner
end

local debt = redis.call('INCRBY', debtKey, units)
redis.call('EXPIRE', debtKey, ttl)
if owner == '' then
  redis.call('DEL', ownerKey)
else
  redis.call('SET', ownerKey, owner, 'EX', ttl)
end
return debt
`

interface FluxMeterRuntime {
  /** How many small units equal one Flux. */
  unitsPerFlux: number
  /** Debt key TTL. Residual debt below unitsPerFlux is forgiven on expiry. */
  debtTtlSeconds: number
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

interface AccumulateInput {
  userId: string
  units: number
  currentBalance: number
  requestId: string
  metadata?: Record<string, unknown>
  /** Validated chat owner for this usage. Omit it for unsafe attribution. */
  correlation?: TtsBillingCorrelation
}

interface MeterSettlement {
  fluxRequested: number
  debtAfter: number
  settledOwner: string
  combinedOwner: string
  residualOwner: string
}

interface AccumulateResult {
  /** Actual flux charged to the user (== amount we are sure was billed). */
  fluxDebited: number
  /** Residual debt left in Redis after this call. Includes unbilled units restored on partial drain. */
  debtAfter: number
  /** User's flux balance after this call. */
  balanceAfter: number
  /**
   * Flux that crossed the meter threshold but couldn't be charged because the
   * user's balance was lower than what the request required. > 0 means the
   * user received service they only partially paid for. Reflects the gap
   * between `requested` and `charged` returned by `billingService.consumeFluxForLLM`.
   */
  unbilledFlux: number
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
  metrics?: RevenueMetrics | null,
) {
  async function getRuntime(): Promise<FluxMeterRuntime> {
    const runtime = await config.resolveRuntime()
    if (runtime.unitsPerFlux <= 0)
      throw new Error(`Invalid unitsPerFlux ${runtime.unitsPerFlux} for meter ${config.name}`)

    return runtime
  }

  async function runScript(
    debtKey: string,
    ownerKey: string,
    units: number,
    runtime: FluxMeterRuntime,
    incomingOwner: string,
  ): Promise<MeterSettlement> {
    const raw = await redis.eval(
      ACCUMULATE_SCRIPT,
      2,
      debtKey,
      ownerKey,
      units,
      runtime.unitsPerFlux,
      runtime.debtTtlSeconds,
      incomingOwner,
      MIXED_OWNER_TOKEN,
    ) as [number | string, number | string, string, string, string]

    return {
      fluxRequested: Number(raw[0]),
      debtAfter: Number(raw[1]),
      settledOwner: String(raw[2]),
      combinedOwner: String(raw[3]),
      residualOwner: String(raw[4]),
    }
  }

  async function restoreDebt(
    debtKey: string,
    ownerKey: string,
    units: number,
    runtime: FluxMeterRuntime,
    owner: string,
  ): Promise<number> {
    const raw = await redis.eval(
      RESTORE_SCRIPT,
      2,
      debtKey,
      ownerKey,
      units,
      runtime.debtTtlSeconds,
      owner,
      MIXED_OWNER_TOKEN,
    )
    return Number(raw)
  }

  function combineOwnerTokens(left: string, right: string): string {
    if (!left)
      return right
    if (!right || left !== right)
      return MIXED_OWNER_TOKEN
    return left
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
      return { fluxDebited: 0, debtAfter: await readDebt(input.userId), balanceAfter: input.currentBalance, unbilledFlux: 0 }

    const modelLabel = typeof input.metadata?.model === 'string' ? input.metadata.model : 'unknown'
    metrics?.ttsChars.add(input.units, { meter: config.name, model: modelLabel })

    const runtime = await getRuntime()
    const debtKey = userFluxMeterDebtRedisKey(input.userId, config.name)
    const ownerKey = userFluxMeterDebtOwnerRedisKey(input.userId, config.name)
    const incomingOwner = input.correlation == null ? '' : serializeTtsBillingCorrelation(input.correlation)
    const settlement = await runScript(debtKey, ownerKey, input.units, runtime, incomingOwner)
    const { fluxRequested, debtAfter: debtAfterSettlement } = settlement

    if (fluxRequested === 0) {
      logger.withFields({
        userId: input.userId,
        meter: config.name,
        units: input.units,
        debtAfter: debtAfterSettlement,
      }).debug('Accumulated units below flux threshold')
      return { fluxDebited: 0, debtAfter: debtAfterSettlement, balanceAfter: input.currentBalance, unbilledFlux: 0 }
    }

    let result: Awaited<ReturnType<typeof billingService.consumeFluxForLLM>>
    try {
      const correlation = resolveTtsBillingCorrelationToken(settlement.settledOwner)
      result = await billingService.consumeFluxForLLM({
        userId: input.userId,
        amount: fluxRequested,
        requestId: input.requestId,
        description: `${config.name}_request`,
        ...(typeof input.metadata?.model === 'string' && { model: input.metadata.model }),
        ...(correlation != null && { correlation }),
      })
    }
    catch (error) {
      // The billing call threw (balance <= 0 hard floor, transient DB error,
      // network blip). The debit did NOT commit, so restore the full
      // already-settled portion back into the debt counter for the next
      // request to retry.
      const restoreUnits = fluxRequested * runtime.unitsPerFlux
      try {
        await restoreDebt(debtKey, ownerKey, restoreUnits, runtime, settlement.combinedOwner)
      }
      catch (rollbackError) {
        logger.withError(rollbackError).withFields({
          userId: input.userId,
          meter: config.name,
          restoreUnits,
          requestId: input.requestId,
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
        userId: input.userId,
        meter: config.name,
        requestId: input.requestId,
        requested: result.requested,
        charged: result.charged,
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
    // REVIEW: Settlement and the restore script below
    // are not atomic. A concurrent `accumulate()` could observe the debt
    // counter after settlement but before the restore script and
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
        source: 'tts_meter',
        meter: config.name,
        reason: 'partial_debit_drained',
        ...(typeof input.metadata?.model === 'string' && { [GEN_AI_ATTR_REQUEST_MODEL]: input.metadata.model }),
      })

      let debtAfterRestore = debtAfterSettlement
      try {
        const restoredOwner = combineOwnerTokens(settlement.residualOwner, settlement.settledOwner)
        debtAfterRestore = await restoreDebt(debtKey, ownerKey, restoreUnits, runtime, restoredOwner)
      }
      catch (rollbackError) {
        // Log loudly so on-call can reconcile manually; don't shadow the
        // partial-debit signal by re-throwing.
        logger.withError(rollbackError).withFields({
          userId: input.userId,
          meter: config.name,
          restoreUnits,
          requestId: input.requestId,
        }).error('Failed to restore meter debt after partial-debit drain')
      }

      logger.withFields({
        userId: input.userId,
        meter: config.name,
        requestId: input.requestId,
        requested: result.requested,
        charged: result.charged,
        unbilledFlux,
        restoreUnits,
      }).warn('Partial debit on flux meter — flux drained to zero')

      return {
        fluxDebited: result.charged,
        debtAfter: debtAfterRestore,
        balanceAfter: result.flux,
        unbilledFlux,
      }
    }

    return { fluxDebited: result.charged, debtAfter: debtAfterSettlement, balanceAfter: result.flux, unbilledFlux: 0 }
  }

  return {
    assertCanAfford,
    accumulate,
    peekDebt: readDebt,
    config,
  }
}

export type FluxMeter = ReturnType<typeof createFluxMeter>
