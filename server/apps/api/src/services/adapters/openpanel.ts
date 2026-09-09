import type { TrackHandlerPayload } from '@openpanel/sdk'

/** One confirmed product fact, with an optional browser device for attribution. */
export interface ProductCaptureInput {
  userId: string
  event: string
  properties: Record<string, unknown>
  deviceId?: string
}

/** External delivery boundary for confirmed product facts. */
export interface ProductAnalyticsSink {
  capture: (input: ProductCaptureInput) => Promise<void>
}

/**
 * Sends each fact once. Callers own replay suppression through business state.
 * Each request supplies its user id, so concurrent users never share SDK identity.
 */
export function createOpenpanelSink(options: { clientId: string, clientSecret: string, apiUrl: string }): ProductAnalyticsSink {
  const endpoint = `${options.apiUrl.replace(/\/$/, '')}/track`

  return {
    async capture(input) {
      const payload: TrackHandlerPayload = {
        type: 'track',
        payload: {
          name: input.event,
          profileId: input.userId,
          properties: {
            ...input.properties,
            ...(input.deviceId && { __deviceId: input.deviceId }),
          },
        },
      }
      // OpenPanel does not deduplicate events by a caller-supplied UUID. Retrying an
      // ambiguous response can count a paid conversion twice.
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'openpanel-client-id': options.clientId,
          'openpanel-client-secret': options.clientSecret,
          'openpanel-sdk-name': 'node',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok)
        throw new Error(`OpenPanel rejected the product event (${response.status})`)
    },
  }
}
