import type {
  CustomModelRuntimeProtocol,
  FetchTransportMethod,
  FetchTransportOperation,
  FetchTransportPort,
  FetchTransportRequest,
} from '../../contracts/fetch-transport-port'

import { nanoid } from 'nanoid'

import { CUSTOM_MODEL_RUNTIME_PROTOCOLS } from '../../contracts/fetch-transport-port'
import { ModelConnectionError, toModelConnectionError } from './errors'

/** Maximum UTF-8 JSON body size for one custom-model transport request. */
export const FETCH_TRANSPORT_MAX_BODY_BYTES = 1_048_576

const hopByHopHeaderNames = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

const responseHeaderAllowList = new Set([
  'content-type',
  'content-length',
  'retry-after',
  'x-request-id',
])

const allowedOperations = new Set<FetchTransportOperation>(['list-models', 'generate'])
const allowedMethods = new Set<FetchTransportMethod>(['GET', 'POST'])
const allowedProtocols = new Set<string>(CUSTOM_MODEL_RUNTIME_PROTOCOLS)

export interface DirectFetchTransportOptions {
  /**
   * Fetch implementation used by the Web direct transport.
   *
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch
}

/**
 * Creates the Web direct Fetch Transport Port.
 *
 * Requests go to the resolved upstream URL. They never go to the AIRI API
 * server. Tests can pass a fake `fetch`.
 */
export function createDirectFetchTransport(
  options: DirectFetchTransportOptions = {},
): FetchTransportPort {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

  return {
    async request(input) {
      const envelope = parseFetchTransportRequest(input)
      const method = envelope.method
      const headers = filterRequestHeaders(envelope.headers)
      const controller = new AbortController()
      const abort = () => controller.abort(input.signal?.reason)
      if (input.signal?.aborted)
        abort()
      else
        input.signal?.addEventListener('abort', abort, { once: true })

      try {
        const response = await fetchImpl(envelope.url, {
          method,
          headers,
          body: method === 'GET' ? undefined : envelope.body,
          signal: controller.signal,
        })

        return {
          requestId: envelope.requestId,
          status: response.status,
          headers: filterResponseHeaders(response.headers),
          body: response.body,
        }
      }
      catch (error) {
        if (input.signal?.aborted)
          throw input.signal.reason ?? error
        throw toModelConnectionError(error, 'transport')
      }
      finally {
        input.signal?.removeEventListener('abort', abort)
      }
    },
  }
}

/**
 * Validates one transport envelope before it is sent.
 *
 * The body size limit applies to the UTF-8 byte length of the JSON string.
 */
export function parseFetchTransportRequest(input: FetchTransportRequest): FetchTransportRequest {
  if (!input.requestId.trim()) {
    throw invalidTransportEnvelope('The transport request id is missing.')
  }
  if (!allowedProtocols.has(input.protocol)) {
    throw invalidTransportEnvelope('The transport protocol is not supported.')
  }
  if (!allowedOperations.has(input.operation)) {
    throw invalidTransportEnvelope('The transport operation is not allowed.')
  }
  if (!allowedMethods.has(input.method)) {
    throw invalidTransportEnvelope('The transport method is not allowed.')
  }
  if (typeof input.url !== 'string' || !input.url.trim()) {
    throw invalidTransportEnvelope('The transport URL is missing.')
  }
  if (!isHeaderRecord(input.headers)) {
    throw invalidTransportEnvelope('The transport headers are invalid.')
  }
  if (input.body != null && typeof input.body !== 'string') {
    throw invalidTransportEnvelope('The transport body must be a JSON string.')
  }
  if (input.method !== methodForOperation(input.operation)) {
    throw invalidTransportEnvelope(
      `Operation ${input.operation} does not use HTTP ${input.method}.`,
    )
  }

  assertHttpUrl(input.url)
  assertJsonBodySize(input.body)

  return {
    requestId: input.requestId,
    protocol: input.protocol,
    operation: input.operation,
    url: input.url,
    method: input.method,
    headers: input.headers,
    body: input.body,
    signal: input.signal,
    ...(typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
      ? { timeoutMs: input.timeoutMs }
      : {}),
  }
}

function invalidTransportEnvelope(message: string): ModelConnectionError {
  return new ModelConnectionError({
    stage: 'transport',
    code: 'invalid-config',
    message,
    retryable: false,
  })
}

function isHeaderRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value == null)
    return false
  return Object.values(value).every(entry => typeof entry === 'string')
}

/**
 * Wraps a Fetch Transport Port as a `fetch` function for xsAI and Anthropic SDKs.
 *
 * The wrapper always uses the resolved operation URL. It does not follow the
 * SDK-constructed path, so a custom generation path cannot drift.
 */
export function createTransportFetch(options: {
  transport: FetchTransportPort
  protocol: CustomModelRuntimeProtocol
  operation: FetchTransportOperation
  url: string
  headers: Record<string, string>
  signal?: AbortSignal
}): (input: URL | RequestInfo, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init)
    const method = normalizeMethod(request.method)
    const body = method === 'GET' ? undefined : await request.text()
    const requestId = nanoid()
    const response = await options.transport.request({
      requestId,
      protocol: options.protocol,
      operation: options.operation,
      url: options.url,
      method,
      headers: mergeRequestHeaders(headersToRecord(request.headers), options.headers),
      body: body || undefined,
      signal: options.signal ?? request.signal,
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  }
}

function methodForOperation(operation: FetchTransportOperation): FetchTransportMethod {
  return operation === 'list-models' ? 'GET' : 'POST'
}

function normalizeMethod(method: string): FetchTransportMethod {
  const normalized = method.toUpperCase()
  if (normalized === 'GET' || normalized === 'POST')
    return normalized

  throw new ModelConnectionError({
    stage: 'transport',
    code: 'invalid-config',
    message: `Transport method ${method} is not allowed.`,
    retryable: false,
  })
}

function assertHttpUrl(value: string): void {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return
  }
  catch {
    // Handled below.
  }

  throw new ModelConnectionError({
    stage: 'transport',
    code: 'invalid-config',
    message: 'The transport URL must use http or https.',
    retryable: false,
  })
}

function assertJsonBodySize(body: string | undefined): void {
  if (body == null)
    return

  const bytes = new TextEncoder().encode(body).byteLength
  if (bytes <= FETCH_TRANSPORT_MAX_BODY_BYTES)
    return

  throw new ModelConnectionError({
    stage: 'transport',
    code: 'invalid-config',
    message: `Request body is larger than ${FETCH_TRANSPORT_MAX_BODY_BYTES} bytes.`,
    retryable: false,
  })
}

function mergeRequestHeaders(
  sdkHeaders: Record<string, string>,
  connectionHeaders: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...sdkHeaders }
  for (const [name, value] of Object.entries(connectionHeaders)) {
    for (const key of Object.keys(merged)) {
      if (key.toLowerCase() === name.toLowerCase())
        delete merged[key]
    }
    merged[name] = value
  }
  return filterRequestHeaders(merged)
}

function filterRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (hopByHopHeaderNames.has(name.toLowerCase()))
      continue
    filtered[name] = value
  }
  return filtered
}

function filterResponseHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {}
  headers.forEach((value, name) => {
    if (responseHeaderAllowList.has(name.toLowerCase()))
      filtered[name] = value
  })
  return filtered
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, name) => {
    record[name] = value
  })
  return record
}
