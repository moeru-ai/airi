/** Request serializes the upload, including multipart boundaries. */
export interface TransportRequest {
  id: string
  url: string
  method: string
  headers: [string, string][]
  body?: Uint8Array
  redirect: RequestRedirect
}

/** Headers arrive before the first demand-driven body read. */
export interface TransportResponse {
  status: number
  statusText: string
  headers: [string, string][]
  url: string
  redirected: boolean
  body: boolean
}

/** The host binds each instance to one caller. IDs never grant access across callers. */
export interface Transport {
  start: (request: TransportRequest) => Promise<TransportResponse>
  read: (id: string) => Promise<Uint8Array | null>
  cancel: (id: string) => Promise<void>
}

async function serializeBody(request: Request): Promise<Uint8Array | undefined> {
  if (!request.body)
    return
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      request.signal.throwIfAborted()
      const { value, done } = await reader.read()
      if (done)
        break
      size += value.byteLength
      chunks.push(value)
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return body
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Creates a fetch adapter. The caller owns host availability and window shutdown. No request is retried. */
export function createTransportFetch(transport: Transport): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    request.signal.throwIfAborted()
    const url = new URL(request.url)
    if (url.protocol === 'data:' || url.protocol === 'blob:')
      return globalThis.fetch(request)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new TypeError('AI requests require HTTP or HTTPS.')
    const body = await serializeBody(request)
    request.signal.throwIfAborted()
    const id = crypto.randomUUID()
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    let finished = false
    let rejectAbort: (reason: unknown) => void = () => {}
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject
    })
    function finish() {
      finished = true
      request.signal.removeEventListener('abort', abort)
    }
    const cancel = () => transport.cancel(id).catch(() => {})
    function abort() {
      if (finished)
        return
      controller?.error(request.signal.reason)
      rejectAbort(request.signal.reason)
      finish()
      void cancel()
    }
    request.signal.addEventListener('abort', abort, { once: true })
    try {
      const started = transport.start({
        id,
        url: request.url,
        method: request.method,
        headers: [...request.headers],
        body,
        redirect: request.redirect,
      }).then(async (metadata) => {
        if (request.signal.aborted)
          await cancel()
        return metadata
      })
      const metadata = await Promise.race([started, aborted])
      // Cancellation can arrive before the start RPC registers its request.
      if (request.signal.aborted) {
        await cancel()
        request.signal.throwIfAborted()
      }
      const stream = metadata.body
        ? new ReadableStream<Uint8Array>({
            start(value) { controller = value },
            async pull(value) {
              try {
                const chunk = await transport.read(id)
                if (finished)
                  return
                if (chunk === null) {
                  finish()
                  value.close()
                }
                else {
                  value.enqueue(chunk)
                }
              }
              catch (error) {
                if (!finished)
                  value.error(error)
                finish()
                await cancel()
              }
            },
            async cancel() {
              finish()
              await cancel()
            },
          }, { highWaterMark: 0 })
        : null
      if (!stream)
        finish()
      const response = new Response(stream, metadata)
      Object.defineProperties(response, {
        url: { value: metadata.url },
        redirected: { value: metadata.redirected },
      })
      return response
    }
    catch (error) {
      finish()
      void cancel()
      throw error
    }
  }
}

interface PendingRequest {
  controller: AbortController
  reader?: ReadableStreamDefaultReader<Uint8Array>
  reading: boolean
  timer: ReturnType<typeof setTimeout>
}

/**
 * Owns requests for one trusted caller. States are starting, readable, then removed.
 * Cancellation, failure, EOF, idle expiry, and disposal remove the request and abort network IO.
 * Each read transfers one network chunk. The host never pumps an unconsumed response.
 */
export class RequestSession implements Transport {
  private readonly requests = new Map<string, PendingRequest>()
  private disposed = false

  constructor(private readonly fetch: typeof globalThis.fetch, private readonly idleTimeoutMs = 120_000) {}

  private touch(id: string, request: PendingRequest) {
    clearTimeout(request.timer)
    request.timer = setTimeout(() => {
      void this.cancel(id)
    }, this.idleTimeoutMs)
  }

  async start(request: TransportRequest): Promise<TransportResponse> {
    if (this.disposed)
      throw new Error('AI request proxy is unavailable.')
    if (this.requests.has(request.id))
      throw new Error('Duplicate AI request ID.')
    const pending: PendingRequest = {
      controller: new AbortController(),
      reading: false,
      timer: setTimeout(() => { void this.cancel(request.id) }, this.idleTimeoutMs),
    }
    this.requests.set(request.id, pending)
    try {
      let url = new URL(request.url)
      let method = request.method
      let body = request.body
      let headers = new Headers(request.headers)
      for (const name of ['origin', 'referer', 'cookie', 'host', 'content-length', 'connection'])
        headers.delete(name)
      for (let redirects = 0; redirects <= 20; redirects++) {
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw new TypeError('AI requests require HTTP or HTTPS without URL credentials.')
        const response = await this.fetch(url, {
          method,
          headers,
          body: body ? new Uint8Array(body) : undefined,
          signal: pending.controller.signal,
          redirect: 'manual',
          credentials: 'omit',
        })
        if (pending.controller.signal.aborted) {
          await response.body?.cancel()
          pending.controller.signal.throwIfAborted()
        }
        const location = response.headers.get('location')
        if ([301, 302, 303, 307, 308].includes(response.status) && location && request.redirect !== 'manual') {
          await response.body?.cancel()
          if (request.redirect === 'error' || redirects === 20)
            throw new TypeError('AI request redirect was rejected.')
          const next = new URL(location, url)
          // Custom API-key headers are credentials too. Cross-origin hops retain only representation headers.
          if (next.origin !== url.origin) {
            headers = new Headers([...headers].filter(([name]) => ['accept', 'content-type'].includes(name)))
          }
          if ((response.status === 303 && method !== 'HEAD') || ([301, 302].includes(response.status) && method === 'POST')) {
            method = 'GET'
            body = undefined
            headers.delete('content-type')
          }
          url = next
          continue
        }
        pending.controller.signal.throwIfAborted()
        pending.reader = response.body?.getReader()
        const responseHeaders = new Headers(response.headers)
        responseHeaders.delete('set-cookie')
        if (!pending.reader)
          await this.cancel(request.id)
        else
          this.touch(request.id, pending)
        return {
          status: response.status,
          statusText: response.statusText,
          headers: [...responseHeaders],
          url: url.href,
          redirected: redirects > 0,
          body: !!pending.reader,
        }
      }
      throw new TypeError('AI request exceeded the redirect limit.')
    }
    catch (error) {
      await this.cancel(request.id)
      throw error
    }
  }

  async read(id: string): Promise<Uint8Array | null> {
    const pending = this.requests.get(id)
    if (!pending?.reader)
      throw new Error('AI request expired or was cancelled.')
    if (pending.reading)
      throw new Error('Concurrent AI response reads are not allowed.')
    pending.reading = true
    this.touch(id, pending)
    try {
      const { value, done } = await pending.reader.read()
      pending.controller.signal.throwIfAborted()
      if (done) {
        await this.cancel(id)
        return null
      }
      this.touch(id, pending)
      return value
    }
    catch (error) {
      await this.cancel(id)
      throw error
    }
    finally {
      pending.reading = false
    }
  }

  async cancel(id: string): Promise<void> {
    const pending = this.requests.get(id)
    if (!pending)
      return
    this.requests.delete(id)
    clearTimeout(pending.timer)
    pending.controller.abort()
    await pending.reader?.cancel().catch(() => {})
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([...this.requests.keys()].map(id => this.cancel(id)))
  }
}
