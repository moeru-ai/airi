import type { InferOutput } from 'valibot'

import { minValue, nonEmpty, number, object, optional, pipe, record, safeInteger, string, unknown } from 'valibot'

export const MICRO_FLUX_PER_FLUX = 1_000_000

/** Source identity scopes idempotency per wallet. Zero is a confirmed amount and still creates a usage record. */
export const fluxUsageInputSchema = object({
  userId: pipe(string(), nonEmpty()),
  source: object({ type: pipe(string(), nonEmpty()), id: pipe(string(), nonEmpty()) }),
  amountMicroFlux: pipe(number(), safeInteger(), minValue(0)),
  detail: optional(record(string(), unknown())),
})
export type FluxUsageInput = InferOutput<typeof fluxUsageInputSchema>

/** Integer balance minus confirmed outstanding fees, in micro-Flux. Admission uses this one formula. */
export function availableMicroFlux(wallet: { flux: number, unsettledMicroFlux: number }): bigint {
  return BigInt(wallet.flux) * BigInt(MICRO_FLUX_PER_FLUX) - BigInt(wallet.unsettledMicroFlux)
}
