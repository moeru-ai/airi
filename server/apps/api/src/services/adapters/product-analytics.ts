import { errorMessageFrom } from '@moeru/std'

/**
 * One confirmed product fact, with the browser identity of each provider for attribution.
 *
 * The browser sends each provider identity in its own request header at checkout.
 * Each sink reads only the fields of its own provider.
 */
export interface ProductCaptureInput {
  userId: string
  event: string
  properties: Record<string, unknown>
  /** OpenPanel device id of the browser visit that started this fact. */
  openpanelDeviceId?: string
  /** PostHog distinct id of the browser before the user signed in. */
  posthogDistinctId?: string
  /** PostHog session id of the browser visit that started this fact. */
  posthogSessionId?: string
  /** Stable source event id. A sink can derive an idempotent event id from it. */
  eventId?: string
}

/** External delivery boundary for confirmed product facts. */
export interface ProductAnalyticsSink {
  capture: (input: ProductCaptureInput) => Promise<void>
}

/** A sink and the provider name that delivery errors report. */
export interface NamedProductAnalyticsSink {
  name: string
  sink: ProductAnalyticsSink
}

/**
 * Sends each fact to every configured provider at the same time.
 *
 * AIRI writes product events to OpenPanel and to PostHog in parallel while the
 * two data sets are compared. Each provider gets one attempt. A failed provider
 * does not stop the others. The returned promise rejects after all attempts end,
 * and the error names each failed provider.
 *
 * Returns `null` when no provider is configured, so callers skip capture.
 */
export function createFanoutSink(sinks: NamedProductAnalyticsSink[]): ProductAnalyticsSink | null {
  if (sinks.length === 0)
    return null

  return {
    async capture(input) {
      const results = await Promise.allSettled(sinks.map(({ sink }) => sink.capture(input)))
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected' ? [`${sinks[index].name}: ${errorMessageFrom(result.reason) ?? 'unknown error'}`] : [],
      )
      if (failures.length > 0)
        throw new Error(`Product event delivery failed (${failures.join(', ')})`)
    },
  }
}
