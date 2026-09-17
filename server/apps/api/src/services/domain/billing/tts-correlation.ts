import type { InferOutput } from 'valibot'

import { maxLength, nonEmpty, object, pipe, safeParse, string, trim } from 'valibot'

const correlationIdSchema = pipe(
  string(),
  trim(),
  nonEmpty(),
  maxLength(128),
)

/** Identifies one chat round that can own TTS billing entries. */
export const TtsBillingCorrelationSchema = object({
  turnId: correlationIdSchema,
})

export type TtsBillingCorrelation = InferOutput<typeof TtsBillingCorrelationSchema>

/**
 * Validates a turn ID from an HTTP or WebSocket boundary.
 *
 * Invalid or missing turn IDs stay absent. Billing then keeps the ledger entry
 * separate instead of assigning it to an unsafe owner.
 */
export function resolveTtsBillingCorrelation(input: unknown): TtsBillingCorrelation | undefined {
  const result = safeParse(TtsBillingCorrelationSchema, input)
  return result.success ? result.output : undefined
}
