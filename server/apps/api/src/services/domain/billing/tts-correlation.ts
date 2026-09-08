import type { InferOutput } from 'valibot'

import { maxLength, nonEmpty, object, parseJson, pipe, safeParse, string, trim } from 'valibot'

const correlationIdSchema = pipe(
  string(),
  trim(),
  nonEmpty(),
  maxLength(128),
)

/** Identifies one chat round that can own TTS billing entries. */
export const TtsBillingCorrelationSchema = object({
  conversationId: correlationIdSchema,
  roundId: correlationIdSchema,
})

export type TtsBillingCorrelation = InferOutput<typeof TtsBillingCorrelationSchema>

const ttsBillingCorrelationTokenSchema = pipe(
  string(),
  parseJson(),
  TtsBillingCorrelationSchema,
)

/**
 * Validates a correlation pair from an HTTP, WebSocket, database, or Redis boundary.
 *
 * Invalid or incomplete pairs stay absent. Billing then keeps the ledger entry
 * separate instead of assigning it to an unsafe owner.
 */
export function resolveTtsBillingCorrelation(input: unknown): TtsBillingCorrelation | undefined {
  const result = safeParse(TtsBillingCorrelationSchema, input)
  return result.success ? result.output : undefined
}

/** Serializes a validated correlation pair for the Redis residual-owner key. */
export function serializeTtsBillingCorrelation(correlation: TtsBillingCorrelation): string {
  return JSON.stringify(correlation)
}

/** Validates a correlation token read from Redis. */
export function resolveTtsBillingCorrelationToken(input: unknown): TtsBillingCorrelation | undefined {
  const result = safeParse(ttsBillingCorrelationTokenSchema, input)
  return result.success ? result.output : undefined
}
