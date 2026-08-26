import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Request payload sent from the host gamelet runtime to one mounted iframe.
 */
export interface GameletIframeRequestPayload {
  /** Host-generated correlation id used outside Eventa invoke for main/renderer relay isolation. */
  requestId: string
  /** JSON-compatible command payload supplied by the extension-side gamelet client. */
  payload: HostDataRecord
}

/**
 * Response payload returned by one mounted gamelet iframe.
 */
export type GameletIframeResponsePayload = HostDataRecord

/**
 * Stable invoke name shared by the host relay and mounted gamelet iframe handler.
 */
export const gameletIframeRequestEventName = 'eventa:invoke:gamelet:iframe:request'

/**
 * Shared invoke contract used by widget hosts to request work from a mounted gamelet iframe.
 *
 * The Electron main process cannot access iframe windows directly, so renderer code invokes
 * this contract on the iframe Eventa context and relays the result back to main.
 */
export const gameletIframeRequest = defineInvokeEventa<
  GameletIframeResponsePayload,
  GameletIframeRequestPayload
>(gameletIframeRequestEventName)
