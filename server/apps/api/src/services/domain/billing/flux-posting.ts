import type { InferOutput } from 'valibot'

import { minValue, nonEmpty, number, object, optional, pipe, record, safeInteger, string, unknown } from 'valibot'

import { availableMicroCredits, MICRO_PER_CREDIT } from './credit-posting'

/** One Flux equals one Credit. Wallet rows keep the Flux column names. */
export const MICRO_FLUX_PER_FLUX = MICRO_PER_CREDIT

/** Source identity scopes idempotency per wallet. Zero is a confirmed amount and still creates a usage record. */
export const fluxUsageInputSchema = object({
  userId: pipe(string(), nonEmpty()),
  source: object({ type: pipe(string(), nonEmpty()), id: pipe(string(), nonEmpty()) }),
  amountMicroFlux: pipe(number(), safeInteger(), minValue(0)),
  detail: optional(record(string(), unknown())),
})
export type FluxUsageInput = InferOutput<typeof fluxUsageInputSchema>

/** Converts a micro-Flux fee to Flux for telemetry. */
export function microFluxToFlux(microFlux: number): number {
  return microFlux / MICRO_FLUX_PER_FLUX
}

/** Integer balance minus confirmed outstanding fees, in micro-Credits. Admission uses this one formula. */
export function availableMicroFlux(wallet: { flux: number, unsettledMicroFlux: number }): bigint {
  return availableMicroCredits({ credits: wallet.flux, unsettledMicro: wallet.unsettledMicroFlux })
}
