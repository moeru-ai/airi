import type { InferOutput } from 'valibot'

import { array, boolean, integer, minValue, nullable, number, object, pipe, regex, string, unknown } from 'valibot'

const MicroFluxSchema = pipe(number(), integer(), minValue(0))

/** Confirmed LLM and speech fees for one local calendar day. */
export const DailyUsageSchema = object({
  date: pipe(string(), regex(/^\d{4}-\d{2}-\d{2}$/)),
  microFlux: MicroFluxSchema,
})

/** The last 365 local days, oldest first, including days without fees. */
export const DailyUsageSummarySchema = object({
  days: array(DailyUsageSchema),
  longestSessionMs: pipe(number(), minValue(0)),
})

export type DailyUsage = InferOutput<typeof DailyUsageSchema>
export type DailyUsageSummary = InferOutput<typeof DailyUsageSummarySchema>

/** Purchased Flux ledger entries. Metadata is opaque JSON and consumers narrow the fields they display. */
export const FluxHistoryResponseSchema = object({
  records: array(object({
    id: string(),
    type: string(),
    amount: number(),
    description: nullable(string()),
    metadata: unknown(),
    createdAt: string(),
  })),
  hasMore: boolean(),
})

export type FluxHistoryResponse = InferOutput<typeof FluxHistoryResponseSchema>
