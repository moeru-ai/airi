import type { InferOutput } from 'valibot'

import { array, check, minLength, picklist, pipe } from 'valibot'

/** Exposure policies that a Kit can use across Host and peer boundaries. */
export const exposePolicyValues = ['local-only', 'remote-observable', 'remote-callable'] as const

/** Validates one Kit exposure policy. */
export const exposePolicySchema = picklist(exposePolicyValues)

/** Validates a non-empty list that contains each exposure policy once. */
export const exposePolicyListSchema = pipe(
  array(exposePolicySchema),
  minLength(1),
  check(policies => new Set(policies).size === policies.length, 'Declare each exposure policy once.'),
)

/** Controls which Host or peer boundary can expose a Kit. */
export type ExposePolicy = InferOutput<typeof exposePolicySchema>
