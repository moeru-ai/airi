import type { TransportRequest } from './index'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTransportFetch, RequestSession } from './index'

const sessions: RequestSession[] = []

function session(fetch: typeof globalThis.fetch, timeout?: number) {
  const host = new RequestSession(fetch, timeout)
  sessions.push(host)
  return host
}

function request(id = 'one'): TransportRequest {
  return { id, url: 'http://127.0.0.1/models', method: 'GET', headers: [], redirect: 'follow' }
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(host => host.dispose()))
})

describe('aI HTTP transport', () => {
  it.each([401, 429, 500])('preserves HTTP %s and its body without retrying', async (status) => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('upstream error', { status }))
    const fetch = createTransportFetch(session(upstream))
    const response = await fetch('http://localhost/models')
    expect(response.status).toBe(status)
    expect(await response.text()).toBe('upstream error')
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('returns headers before data and reads only on consumer demand', async () => {
    let pulls = 0
    const host = session(async () => new Response(new ReadableStream({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array([0, 128, 255]))
      },
    }, { highWaterMark: 0 })))
    const read = vi.spyOn(host, 'read')
    const response = await createTransportFetch(host)('http://localhost/speech')
    expect(read).not.toHaveBeenCalled()
    expect(pulls).toBe(0)
    const reader = response.body!.getReader()
    expect((await reader.read()).value).toEqual(new Uint8Array([0, 128, 255]))
    expect(read).toHaveBeenCalledTimes(1)
    expect(pulls).toBe(1)
    await reader.cancel()
  })

  it('preserves multipart fields, file bytes, and the generated boundary', async () => {
    const upstream = vi.fn<typeof fetch>(async (url, init) => {
      const incoming = new Request(url, init)
      expect(incoming.headers.get('content-type')).toContain('boundary=')
      const form = await incoming.formData()
      expect(form.get('model')).toBe('transcribe')
      const file = form.get('file') as File
      expect(file.name).toBe('sample.wav')
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0, 1, 128, 255]))
      return Response.json({ text: 'hello' })
    })
    const form = new FormData()
    form.set('model', 'transcribe')
    form.set('file', new Blob([new Uint8Array([0, 1, 128, 255])]), 'sample.wav')
    const response = await createTransportFetch(session(upstream))('http://localhost/transcription', { method: 'POST', body: form })
    expect(await response.json()).toEqual({ text: 'hello' })
  })

  it('strips browser headers and credentials on cross-origin redirects', async () => {
    const upstream = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: 'http://localhost:9001/result' } }))
      .mockResolvedValueOnce(new Response('image'))
    const response = await createTransportFetch(session(upstream))('http://localhost:9000/generate', {
      headers: { 'authorization': 'secret', 'x-api-key': 'secret', 'cookie': 'session=secret', 'origin': 'https://airi', 'referer': 'https://airi' },
    })
    expect(await response.text()).toBe('image')
    const first = new Headers(upstream.mock.calls[0][1]?.headers)
    const redirected = new Headers(upstream.mock.calls[1][1]?.headers)
    expect(first.get('authorization')).toBe('secret')
    expect(first.has('cookie')).toBe(false)
    expect(first.has('origin')).toBe(false)
    expect(first.has('referer')).toBe(false)
    expect(redirected.has('authorization')).toBe(false)
    expect(redirected.has('x-api-key')).toBe(false)
    expect(response.url).toBe('http://localhost:9001/result')
    expect(response.redirected).toBe(true)
  })

  it('rejects non-HTTP redirect targets', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: 'file:///private' } }))
    await expect(createTransportFetch(session(upstream))('http://localhost')).rejects.toThrow('HTTP')
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('isolates request IDs between callers and releases them on cancellation', async () => {
    const first = session(async () => new Response('first'))
    const second = session(async () => new Response('second'))
    await first.start(request())
    await expect(second.read('one')).rejects.toThrow('expired')
    await second.cancel('one')
    expect(await first.read('one')).toEqual(new TextEncoder().encode('first'))
    await first.cancel('one')
    await expect(first.read('one')).rejects.toThrow('expired')
  })

  it('aborts the network when the caller cancels the body', async () => {
    let signal: AbortSignal | null | undefined
    const host = session(async (_url, init) => {
      signal = init?.signal
      return new Response('audio')
    })
    const response = await createTransportFetch(host)('http://localhost')
    await response.body!.cancel()
    expect(signal?.aborted).toBe(true)
  })

  it('rejects promptly when aborted before response headers arrive', async () => {
    const controller = new AbortController()
    const cancel = vi.fn(async () => {})
    let complete: ((response: Response) => void) | undefined
    const host = session(async () => new Promise<Response>((resolve) => {
      complete = resolve
    }))
    const fetch = createTransportFetch(host)
    const pending = fetch('http://localhost/slow', { signal: controller.signal })
    await vi.waitFor(() => expect(complete).toBeDefined())
    controller.abort()
    await expect(pending).rejects.toThrow()
    complete!(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
  })

  it('expires abandoned responses and closes all requests on disposal', async () => {
    const host = session(async () => new Response('unused'), 10)
    await host.start(request())
    await new Promise(resolve => setTimeout(resolve, 30))
    await expect(host.read('one')).rejects.toThrow('expired')
    await host.start(request('two'))
    await host.dispose()
    await expect(host.read('two')).rejects.toThrow('expired')
    await expect(host.start(request('three'))).rejects.toThrow('unavailable')
  })

  it('propagates a broken response stream and releases its request', async () => {
    const host = session(async () => new Response(new ReadableStream({
      pull(controller) { controller.error(new Error('upstream disconnected')) },
    })))
    await host.start(request())
    await expect(host.read('one')).rejects.toThrow('upstream disconnected')
    await expect(host.read('one')).rejects.toThrow('expired')
  })
})
