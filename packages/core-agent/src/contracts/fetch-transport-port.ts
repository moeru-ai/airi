/**
 * Custom Model generation protocols. The selected protocol is the runtime
 * source of truth. Adapters must not switch protocol after an error.
 */
export const CUSTOM_MODEL_RUNTIME_PROTOCOLS = [
  'openai-chat-completions',
  'openai-responses',
  'anthropic-messages',
] as const

export type CustomModelRuntimeProtocol = typeof CUSTOM_MODEL_RUNTIME_PROTOCOLS[number]

/** Allowed upstream operations for one custom model transport request. */
export type FetchTransportOperation = 'list-models' | 'generate'

/** HTTP methods the Fetch Transport Port may send. */
export type FetchTransportMethod = 'GET' | 'POST'

/**
 * One constrained upstream request.
 *
 * The envelope carries the resolved URL, filtered headers, and a size-limited
 * JSON body. Callers correlate stream chunks and cancellation with `requestId`.
 */
export interface FetchTransportRequest {
  requestId: string
  protocol: CustomModelRuntimeProtocol
  operation: FetchTransportOperation
  url: string
  method: FetchTransportMethod
  headers: Record<string, string>
  body?: string
  signal?: AbortSignal
  /**
   * Main Process abort budget in milliseconds.
   *
   * Web ignores this field and uses `signal`. Electron aborts the upstream
   * request when the budget elapses.
   */
  timeoutMs?: number
}

/**
 * One upstream response returned by the Fetch Transport Port.
 *
 * Response headers are a forward allow-list. The body is the upstream byte
 * stream and must abort when the request `AbortSignal` aborts.
 */
export interface FetchTransportResponse {
  requestId: string
  status: number
  headers: Record<string, string>
  body: ReadableStream<Uint8Array> | null
}

/**
 * Platform network port used by protocol adapters.
 *
 * Web uses a direct `fetch` implementation. Electron injects a Main Process
 * Eventa implementation. Tests fake this port.
 */
export interface FetchTransportPort {
  /**
   * Sends one `list-models` or `generate` request to the resolved URL.
   *
   * The port must not change protocol, retry another protocol, retry through a
   * proxy, or send the request to the AIRI API server.
   */
  request: (input: FetchTransportRequest) => Promise<FetchTransportResponse>
}
