import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { defineInvokeEventa } from '@moeru/eventa'

/** A command sent from a host to one mounted gamelet UI. */
export interface GameletRequestPayload {
  /** Host-generated id used by platform relay queues to isolate one request. */
  requestId: string
  /** JSON-compatible command data supplied by the extension. */
  payload: HostDataRecord
}

/** A JSON-compatible response returned by the mounted gamelet UI. */
export type GameletResponsePayload = HostDataRecord

/** Stable Eventa invoke id shared by all stage gamelet bridges. */
export const gameletRequestEventName = 'eventa:invoke:stage:gamelet:request'

/**
 * Contract used by a host to request work from a gamelet UI.
 *
 * The UI owns mutable view state. Tool calls use this same contract so manual
 * edits and model edits always operate on one state owner.
 */
export const gameletRequest = defineInvokeEventa<GameletResponsePayload, GameletRequestPayload>(gameletRequestEventName)
