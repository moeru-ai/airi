import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { net, session } from 'electron'

/**
 * Executes one HTTP hop for RequestSession, which owns redirect policy and request lifecycle.
 * Headers resolve first. Body reads apply backpressure to Chromium through its Node readable stream.
 * Cancellation, EOF, and failures release the native request and its signal listener.
 * Redirect responses expose status and headers only because Electron does not expose their bodies.
 */
export const fetchNativeHTTP: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  if (request.redirect !== 'manual')
    throw new TypeError('Native HTTP requires RequestSession redirect handling.')
  request.signal.throwIfAborted()
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined
  request.signal.throwIfAborted()

  return new Promise<Response>((resolve, reject) => {
    const native = net.request({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      session: session.fromPartition('airi-ai-transport', { cache: false }),
      credentials: 'omit',
      redirect: 'manual',
    })
    let finished = false
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    function finish() {
      finished = true
      request.signal.removeEventListener('abort', abort)
      native.abort()
    }
    function fail(error: unknown) {
      if (finished)
        return
      controller?.error(error)
      reject(error)
      finish()
    }
    function abort() {
      fail(request.signal.reason)
    }
    native.on('error', fail)
    native.on('redirect', (status, _method, _url, responseHeaders) => {
      if (finished)
        return
      // NOTICE:
      // Session.fetch rejects manual redirects with "Redirect was cancelled".
      // ClientRequest exposes redirect headers before cancellation, so RequestSession can decide the next hop.
      // Source: electron/lib/common/api/net-client-request.ts, manual redirect event handling.
      // Remove this adapter when Session.fetch exposes manual redirect responses with equivalent stream cancellation.
      try {
        const headers = new Headers()
        for (const [name, values] of Object.entries(responseHeaders)) {
          for (const value of values)
            headers.append(name, value)
        }
        resolve(new Response(null, { status, headers }))
        finish()
      }
      catch (error) {
        fail(error)
      }
    })
    native.on('response', (message) => {
      if (finished)
        return
      try {
        // Electron's declarations omit Readable, but IncomingMessage extends it at runtime.
        // This runtime check narrows the type without inventing a second stream contract.
        if (!(message instanceof Readable))
          throw new TypeError('Native HTTP response is not a readable stream.')
        const headers = new Headers()
        for (let index = 0; index < message.rawHeaders.length; index += 2)
          headers.append(message.rawHeaders[index], message.rawHeaders[index + 1])
        const metadata = { status: message.statusCode, statusText: message.statusMessage, headers }
        if (request.method === 'HEAD' || [204, 205, 304].includes(message.statusCode)) {
          resolve(new Response(null, metadata))
          finish()
          return
        }
        const reader = Readable.toWeb(message, { strategy: { highWaterMark: 0 } }).getReader()
        const stream = new ReadableStream<Uint8Array>({
          start(value) { controller = value },
          async pull(value) {
            try {
              const chunk = await reader.read()
              if (finished)
                return
              if (chunk.done) {
                value.close()
                finish()
              }
              else {
                value.enqueue(chunk.value)
              }
            }
            catch (error) {
              fail(error)
            }
          },
          async cancel() {
            finish()
            await reader.cancel().catch(() => {})
          },
        }, { highWaterMark: 0 })
        resolve(new Response(stream, metadata))
      }
      catch (error) {
        fail(error)
      }
    })
    request.signal.addEventListener('abort', abort, { once: true })
    try {
      native.end(body)
    }
    catch (error) {
      fail(error)
    }
  })
}
