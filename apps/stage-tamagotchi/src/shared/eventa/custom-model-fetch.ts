import type {
  CustomModelRuntimeProtocol,
  FetchTransportMethod,
  FetchTransportOperation,
  ModelConnectionErrorFields,
} from '@proj-airi/core-agent'

import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Serializable custom-model fetch envelope sent from Renderer to Main.
 *
 * The payload has no `AbortSignal`. Cancel uses the cancel invoke, the Eventa
 * abort frame, or Renderer lifecycle cleanup.
 */
export interface CustomModelFetchRequestPayload {
  requestId: string
  protocol: CustomModelRuntimeProtocol
  operation: FetchTransportOperation
  url: string
  method: FetchTransportMethod
  headers: Record<string, string>
  body?: string
  timeoutMs?: number
}

/** Renderer cancel payload for one Main Process upstream request. */
export interface CustomModelFetchCancelPayload {
  requestId: string
}

/**
 * Stream events for one custom-model fetch.
 *
 * Main Process yields headers first, then body bytes, then complete. Errors
 * use a structured payload so IPC does not drop `stage` and `code`.
 */
export type CustomModelFetchStreamEvent
  = | {
    type: 'headers'
    requestId: string
    status: number
    headers: Record<string, string>
  }
  | {
    type: 'chunk'
    requestId: string
    bytes: Uint8Array
  }
  | {
    type: 'complete'
    requestId: string
  }
  | {
    type: 'error'
    requestId: string
    error: ModelConnectionErrorFields
  }

export const electronCustomModelFetch = defineInvokeEventa<
  CustomModelFetchStreamEvent,
  CustomModelFetchRequestPayload
>('eventa:invoke:electron:custom-model:fetch')

export const electronCustomModelFetchCancel = defineInvokeEventa<
  void,
  CustomModelFetchCancelPayload
>('eventa:invoke:electron:custom-model:fetch:cancel')
