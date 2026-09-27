import type { InferOutput } from 'valibot'

import { number, object, optional, picklist, string } from 'valibot'

export const attemptStartSchema = object({
  gateway: string(),
  routeId: optional(string()),
  credentialId: string(),
  model: string(),
})

export const attemptResultSchema = object({
  state: picklist(['headers_received', 'failed', 'cancelled', 'unknown']),
  status: optional(number()),
  errorCode: optional(picklist(['upstream_http', 'transport_error', 'client_cancelled'])),
})

/** Awaited persistence boundary. A failed write must stop dispatch, not trigger model fallback. */
export interface AttemptObserver {
  start: (input: InferOutput<typeof attemptStartSchema>) => Promise<string>
  finish: (id: string, input: InferOutput<typeof attemptResultSchema>) => Promise<void>
}
