import type Redis from 'ioredis'

import type { BillingService } from './billing-service'

import { useLogger } from '@guiiai/logg'

import { createPaymentRequiredError } from '../../utils/error'
import { userFluxMeterDebtRedisKey } from '../../utils/redis-keys'

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

interface FluxMeterConfig {
  /** Meter identifier, used as Redis key segment and billing description prefix. */
  name: string
  /** How many small units equal one Flux. */
  unitsPerFlux: number
  /** Debt key TTL. Residual debt below unitsPerFlux is forgiven on expiry. */
  debtTtlSeconds: number
}

interface AccumulateInput {
  userId: string
  units: number
  currentBalance: number
  requestId: string
  metadata?: Record<string, unknown>
}

interface AccumulateResult {
  fluxDebited: number
  debtAfter: number
  balanceAfter: number
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
) {
  if (config.unitsPerFlux <= 0)
    throw new Error(`Invalid unitsPerFlux ${config.unitsPerFlux} for meter ${config.name}`)

  async function runScript(key: string, units: number): Promise<[number, number]> {
    const raw = await redis.eval(
      ACCUMULATE_SCRIPT,
      1,
      key,
      units,
      config.unitsPerFlux,
      config.debtTtlSeconds,
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
    const existingDebt = await readDebt(userId)
    const projectedFlux = Math.floor((existingDebt + newUnits) / config.unitsPerFlux)
    // At minimum require the user can cover a single Flux crossing; avoids
    // letting zero-balance users accumulate indefinitely on the boundary.
    const required = Math.max(projectedFlux, currentBalance <= 0 ? 1 : 0)
    if (currentBalance < required)
      throw createPaymentRequiredError('Insufficient flux')
  }

  /**
   * Accumulate usage, atomically settle any whole-Flux portion, and record the
   * debit via BillingService. Returns 0 fluxDebited when the new usage does
   * not cross a Flux boundary (cheap path for short TTS segments).
   */
  async function accumulate(input: AccumulateInput): Promise<AccumulateResult> {
    if (input.units <= 0)
      return { fluxDebited: 0, debtAfter: await readDebt(input.userId), balanceAfter: input.currentBalance }

    const key = userFluxMeterDebtRedisKey(input.userId, config.name)
    const [fluxDebited, debtAfter] = await runScript(key, input.units)

    if (fluxDebited === 0) {
      logger.withFields({
        userId: input.userId,
        meter: config.name,
        units: input.units,
        debtAfter,
      }).debug('Accumulated units below flux threshold')
      return { fluxDebited: 0, debtAfter, balanceAfter: input.currentBalance }
    }

    const { flux } = await billingService.consumeFluxForLLM({
      userId: input.userId,
      amount: fluxDebited,
      requestId: input.requestId,
      description: `metered:${config.name}`,
      ...(typeof input.metadata?.model === 'string' && { model: input.metadata.model }),
    })

    return { fluxDebited, debtAfter, balanceAfter: flux }
  }

  return {
    assertCanAfford,
    accumulate,
    peekDebt: readDebt,
    config,
  }
}

export type FluxMeter = ReturnType<typeof createFluxMeter>
