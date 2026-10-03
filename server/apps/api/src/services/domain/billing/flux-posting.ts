import type { InferOutput } from 'valibot'

import { minValue, nonEmpty, number, object, pipe, safeInteger, string } from 'valibot'

export const MICRO_FLUX_PER_FLUX = 1_000_000

/** Source identity scopes idempotency per wallet. Zero is a confirmed amount and still creates an accrual. */
export const fluxUsageInputSchema = object({
  userId: pipe(string(), nonEmpty()),
  source: object({ type: pipe(string(), nonEmpty()), id: pipe(string(), nonEmpty()) }),
  amountMicroFlux: pipe(number(), safeInteger(), minValue(0)),
})
export type FluxUsageInput = InferOutput<typeof fluxUsageInputSchema>
