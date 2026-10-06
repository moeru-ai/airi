import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from './billing-service'
import type { PlanCreditAccount, UsageSettlement } from './credit-settlement'

import { parse } from 'valibot'

import { createPaymentRequiredError } from '../../../utils/error'
import { GEN_AI_ATTR_REQUEST_MODEL } from '../../../utils/observability'
import { priceSpeechUsage, speechPricingSchema } from './billing'
import { createUsageSettlement } from './credit-settlement'
import { availableMicroFlux, microFluxToFlux } from './flux-posting'

export interface SpeechSettlement extends UsageSettlement {
  /** Flux taken from the wallet. Zero when the plan pays or the fee stays unbilled. */
  fluxConsumed: number
}

export interface SpeechMeter {
  assertCanAfford: (userId: string, units: number) => Promise<void>
  settle: (input: {
    userId: string
    requestId: string
    units: number
    model: string
    provider?: string
    turnId?: string
  }) => Promise<SpeechSettlement>
}

/**
 * Prices speech characters and posts the fee through shared usage settlement.
 * `fluxConsumed` counts wallet debits only.
 */
export function createSpeechMeter(deps: {
  billing: BillingService
  config: ConfigKVService
  plans?: PlanCreditAccount | null
  metrics?: Pick<RevenueMetrics, 'fluxUnbilled' | 'ttsChars' | 'ttsPreflightRejections'> | null
}): SpeechMeter {
  const usage = createUsageSettlement({
    plans: deps.plans,
    walletMicro: async userId => availableMicroFlux(await deps.billing.getWallet(userId)),
  })

  async function pricing() {
    return parse(speechPricingSchema, { fluxPer1kChars: await deps.config.getOrThrow('FLUX_PER_1K_CHARS_TTS') })
  }

  return {
    /** Rejects when neither pool can pay the whole character fee. */
    async assertCanAfford(userId, units) {
      const cost = priceSpeechUsage(units, await pricing())
      if (await usage.canCover(userId, cost))
        return
      deps.metrics?.ttsPreflightRejections.add(1, { meter: 'tts', reason: 'insufficient_balance' })
      throw createPaymentRequiredError('Insufficient flux')
    },

    /** Posts the final character fee once per request. */
    async settle(input) {
      const speechPricing = await pricing()
      const micro = priceSpeechUsage(input.units, speechPricing)
      const settlement = await usage.settle({
        userId: input.userId,
        requestId: input.requestId,
        micro,
        postWallet: async () => {
          const posted = await deps.billing.postFluxUsage({
            userId: input.userId,
            source: { type: 'tts', id: input.requestId },
            amountMicroFlux: micro,
            detail: {
              units: input.units,
              model: input.model,
              provider: input.provider,
              turnId: input.turnId,
              pricing: speechPricing,
            },
          })
          return { replay: posted.replay }
        },
      })

      if (settlement.meter === 'unbilled') {
        deps.metrics?.fluxUnbilled.add(microFluxToFlux(micro), {
          [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
          reason: 'plan_quota_exhausted',
          stage: 'speech',
        })
      }
      else if (!settlement.replay) {
        deps.metrics?.ttsChars.add(input.units, { meter: 'tts', model: input.model, source: settlement.meter })
      }

      return {
        ...settlement,
        fluxConsumed: settlement.meter === 'wallet' && !settlement.replay ? microFluxToFlux(micro) : 0,
      }
    },
  }
}
