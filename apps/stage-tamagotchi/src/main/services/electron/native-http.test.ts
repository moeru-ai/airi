import type { ClientRequest } from 'electron'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

import { net, session } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchNativeHTTP } from './native-http'

vi.mock('electron', () => ({
  net: { request: vi.fn() },
  session: { fromPartition: vi.fn(() => ({ cookies: {} })) },
}))

class NativeResponse extends Readable {
  rawHeaders = ['content-type', 'application/octet-stream']
  statusCode = 200
  statusMessage = 'OK'
  _read = vi.fn()
}

class NativeRequest extends EventEmitter implements ClientRequest {
  response?: NativeResponse
  chunkedEncoding = false
  end = vi.fn(() => this)
  abort = vi.fn(() => { this.response?.destroy() })
  followRedirect = vi.fn<ClientRequest['followRedirect']>()
  getHeader = vi.fn<ClientRequest['getHeader']>()
  getUploadProgress = vi.fn<ClientRequest['getUploadProgress']>()
  removeHeader = vi.fn<ClientRequest['removeHeader']>()
  setHeader = vi.fn<ClientRequest['setHeader']>()
  write = vi.fn<ClientRequest['write']>()

  respond() {
    this.response = new NativeResponse()
    this.emit('response', this.response)
    return this.response
  }
}

describe('native HTTP boundary', () => {
  let native: NativeRequest

  beforeEach(() => {
    vi.clearAllMocks()
    native = new NativeRequest()
    vi.mocked(net.request).mockReturnValue(native)
  })

  it('returns redirect headers to RequestSession and cancels the original native hop', async () => {
    // ROOT CAUSE:
    // Session.fetch rejects manual redirects instead of returning headers.
    // The redirect event now returns metadata before aborting the original hop.
    const pending = fetchNativeHTTP('https://example.test/start', { redirect: 'manual' })
    native.emit('redirect', 302, 'GET', 'https://other.test/end', { location: ['https://other.test/end'] })
    const response = await pending
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://other.test/end')
    expect(response.body).toBeNull()
    expect(native.abort).toHaveBeenCalledOnce()
    expect(native.followRedirect).not.toHaveBeenCalled()
    native.emit('error', new Error('Redirect was cancelled'))
  })

  it('uses a cookie-free memory session and preserves POST bytes', async () => {
    const pending = fetchNativeHTTP('https://example.test/upload', {
      redirect: 'manual',
      method: 'POST',
      body: new Uint8Array([0, 128, 255]),
      headers: { 'x-api-key': 'test-key' },
    })
    await vi.waitFor(() => expect(native.end).toHaveBeenCalled())
    expect(native.end).toHaveBeenCalledWith(Buffer.from([0, 128, 255]))
    expect(session.fromPartition).toHaveBeenCalledWith('airi-ai-transport', { cache: false })
    expect(net.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'manual',
      headers: { 'x-api-key': 'test-key' },
    }))
    native.respond().push(null)
    await (await pending).arrayBuffer()
  })

  it('returns headers without consuming an unrequested body and cancels native IO', async () => {
    const pending = fetchNativeHTTP('https://example.test/stream', { redirect: 'manual' })
    const incoming = native.respond()
    const response = await pending
    await new Promise(resolve => setImmediate(resolve))
    expect(incoming._read).not.toHaveBeenCalled()
    const reader = response.body!.getReader()
    const reading = reader.read()
    incoming.push(Buffer.from([0, 127, 128, 255]))
    expect(await reading).toEqual({ done: false, value: new Uint8Array([0, 127, 128, 255]) })
    await reader.cancel()
    expect(native.abort).toHaveBeenCalledOnce()
    expect(incoming.destroyed).toBe(true)
  })

  it('aborts while waiting for headers', async () => {
    const controller = new AbortController()
    const pending = fetchNativeHTTP('https://example.test/pending', { redirect: 'manual', signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(native.abort).toHaveBeenCalledOnce()
  })

  it('rejects a pending body read on signal cancellation', async () => {
    const controller = new AbortController()
    const pending = fetchNativeHTTP('https://example.test/stream', { redirect: 'manual', signal: controller.signal })
    native.respond()
    const response = await pending
    const reading = response.arrayBuffer()
    controller.abort()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
    expect(native.abort).toHaveBeenCalledOnce()
  })

  it('propagates a broken response without issuing another request', async () => {
    const pending = fetchNativeHTTP('https://example.test/broken', { redirect: 'manual' })
    const incoming = native.respond()
    const response = await pending
    const reading = response.arrayBuffer()
    incoming.destroy(new Error('connection lost'))
    await expect(reading).rejects.toThrow('connection lost')
    expect(net.request).toHaveBeenCalledOnce()
    expect(native.abort).toHaveBeenCalledOnce()
  })

  it('returns a null body for HEAD and closes the native request', async () => {
    const pending = fetchNativeHTTP('https://example.test/head', { redirect: 'manual', method: 'HEAD' })
    native.respond()
    const response = await pending
    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
    expect(native.abort).toHaveBeenCalledOnce()
  })
})
