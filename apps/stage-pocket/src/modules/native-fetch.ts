import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { StreamHttp } from 'capacitor-stream-http'

interface NativeHttpResponse {
  data: any
  status: number
  headers: Record<string, string>
}

export interface ParsedRequest {
  url: string
  method: string
  headers: Headers
  bodyText?: string
  originalBody?: BodyInit | null | any
}

interface StreamEvent {
  id: string
  chunk?: string | Uint8Array
  error?: string
}

export interface NativeFetchPolicy {
  isStreamRequest: (req: ParsedRequest) => boolean
  shouldBypass: (url: URL, init?: RequestInit, input?: RequestInfo | URL) => boolean
  shouldParseJson: (contentType: string) => boolean
  shouldReadBodyAsText: (contentType: string) => boolean
  getStreamHeaders: () => Record<string, string>
}

/**
 * Check if body type is unsupported by Capacitor bridge
 */
function isUnsupportedBody(body: any): boolean {
  if (!body)
    return false

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
    return true

  if (typeof FormData !== 'undefined' && body instanceof FormData)
    return true

  if (typeof Blob !== 'undefined' && body instanceof Blob)
    return true

  return false
}

const defaultPolicy: NativeFetchPolicy = {
  isStreamRequest(req) {
    const accept = req.headers.get('accept') || ''
    if (accept.includes('text/event-stream')) {
      return true
    }

    if (!req.bodyText)
      return false

    try {
      const json = JSON.parse(req.bodyText)
      return json?.stream === true
    }
    catch {
      return false
    }
  },

  shouldBypass(url, init, input) {
    // Protocol / localhost bypass
    if (
      !/^https?:$/i.test(url.protocol)
      || ['localhost', '127.0.0.1'].includes(url.hostname)
    ) {
      return true
    }

    // ✅ FIX: unify body source
    let body: any = init?.body

    if (!body && input instanceof Request) {
      body = input.body
    }

    // ✅ FIX: include ReadableStream / FormData / Blob
    if (isUnsupportedBody(body)) {
      return true
    }

    return false
  },

  shouldParseJson(contentType) {
    return contentType.includes('application/json')
  },

  shouldReadBodyAsText(contentType) {
    return /json|text|x-www-form-urlencoded/i.test(contentType)
  },

  getStreamHeaders() {
    return {
      'content-type': 'text/event-stream; charset=utf-8',
      'x-native-stream': 'true',
    }
  },
}

function mergePolicy(
  custom?: Partial<NativeFetchPolicy>,
): NativeFetchPolicy {
  return { ...defaultPolicy, ...custom }
}

function createNativeReadableStream(
  request: ParsedRequest,
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  let streamId: string | null = null
  let listeners: { remove: () => any }[] = []
  let aborted = false

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function cleanup() {
        listeners.forEach(l => l.remove())
        listeners = []
        signal?.removeEventListener('abort', onAbort)
      }

      async function onAbort() {
        if (aborted)
          return
        aborted = true

        if (streamId) {
          await StreamHttp.cancelStream({ id: streamId }).catch(() => {})
        }

        cleanup()

        try {
          controller.error(new DOMException('The user aborted a request.', 'AbortError'))
        }
        catch {}
      }

      const handles = await Promise.all([
        StreamHttp.addListener('chunk', (event: StreamEvent) => {
          if (event.id !== streamId || !event.chunk)
            return

          try {
            if (typeof event.chunk === 'string') {
              controller.enqueue(encoder.encode(event.chunk))
            }
            else if (event.chunk instanceof Uint8Array) {
              controller.enqueue(event.chunk)
            }
          }
          catch (e) {
            console.warn('[native-fetch] Enqueue chunk failed:', e)
          }
        }),

        StreamHttp.addListener('end', (event: StreamEvent) => {
          if (event.id !== streamId)
            return
          cleanup()
          try {
            controller.close()
          }
          catch {}
        }),

        StreamHttp.addListener('error', (event: StreamEvent) => {
          if (event.id !== streamId)
            return
          cleanup()
          try {
            controller.error(new Error(event.error || 'Stream error'))
          }
          catch {}
        }),
      ])

      if (aborted) {
        handles.forEach(h => h.remove())
        return
      }
      listeners = handles

      if (signal) {
        if (signal.aborted)
          return onAbort()
        signal.addEventListener('abort', onAbort)
      }

      try {
        const result = await StreamHttp.startStream({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: request.bodyText,
        })

        streamId = result.id

        if (aborted) {
          await StreamHttp.cancelStream({ id: streamId }).catch(() => {})
        }
      }
      catch (err) {
        cleanup()
        try {
          controller.error(err)
        }
        catch {}
      }
    },

    async cancel() {
      if (streamId) {
        await StreamHttp.cancelStream({ id: streamId }).catch(() => {})
      }
    },
  })
}

async function fetchViaCapacitorHttp(
  request: ParsedRequest,
  policy: NativeFetchPolicy,
): Promise<Response> {
  let data = request.bodyText ?? request.originalBody
  const headersObj = Object.fromEntries(request.headers.entries())
  const contentType = request.headers.get('content-type') || ''

  if (typeof data === 'string' && policy.shouldParseJson(contentType)) {
    try {
      data = JSON.parse(data)
    }
    catch {}
  }

  const res = (await CapacitorHttp.request({
    url: request.url,
    method: request.method,
    headers: headersObj,
    data,
  })) as NativeHttpResponse

  const resHeaders = new Headers(res.headers)
  let resBody = res.data

  if (
    typeof resBody === 'object'
    && resBody !== null
    && !(resBody instanceof ArrayBuffer)
    && !ArrayBuffer.isView(resBody)
  ) {
    resBody = JSON.stringify(resBody)
    if (!resHeaders.has('content-type')) {
      resHeaders.set('content-type', 'application/json; charset=utf-8')
    }
  }

  return new Response(resBody, {
    status: res.status,
    headers: resHeaders,
  })
}

async function getRequestInfo(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  policy: NativeFetchPolicy,
): Promise<ParsedRequest> {
  const isReq = input instanceof Request
  const base = globalThis.location?.origin || 'http://localhost'
  const url = new URL(isReq ? input.url : String(input), base).href

  const method = (init?.method || (isReq ? input.method : 'GET')).toUpperCase()

  const headers = new Headers(isReq ? input.headers : undefined)
  if (init?.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v))
  }

  const originalBody = init?.body ?? (isReq ? input.body : undefined)
  let bodyText: string | undefined

  if (typeof originalBody === 'string') {
    bodyText = originalBody
  }
  else if (originalBody instanceof URLSearchParams) {
    bodyText = originalBody.toString()
  }
  else if (isReq && !init?.body) {
    const contentType = headers.get('content-type') || ''
    if (policy.shouldReadBodyAsText(contentType)) {
      try {
        bodyText = await input.clone().text()
      }
      catch {}
    }
  }

  return { url, method, headers, bodyText, originalBody }
}

export function installNativeFetchPatch(options?: {
  policy?: Partial<NativeFetchPolicy>
}): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis)
  const policy = mergePolicy(options?.policy)

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // FIX: merge signal from init + Request
    const requestSignal
      = init?.signal
        || (input instanceof Request ? input.signal : undefined)

    if (requestSignal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError')
    }

    const urlStr = input instanceof Request ? input.url : String(input)
    const parsedUrl = new URL(
      urlStr,
      globalThis.location?.origin || 'http://localhost',
    )

    if (
      !Capacitor.isNativePlatform()
      || policy.shouldBypass(parsedUrl, init, input)
    ) {
      return originalFetch(input, init)
    }

    const request = await getRequestInfo(input, init, policy)

    // Stream request
    if (policy.isStreamRequest(request)) {
      try {
        const stream = createNativeReadableStream(
          request,
          requestSignal,
        )

        return new Response(stream, {
          status: 200,
          headers: policy.getStreamHeaders(),
        })
      }
      catch (err) {
        console.warn('[native-fetch] Stream failed, fallback:', err)
      }
    }

    // Normal request
    try {
      return await fetchViaCapacitorHttp(request, policy)
    }
    catch (err) {
      console.warn('[native-fetch] Native request failed, fallback:', err)
      return originalFetch(input, init)
    }
  }

  return () => {
    globalThis.fetch = originalFetch
  }
}
