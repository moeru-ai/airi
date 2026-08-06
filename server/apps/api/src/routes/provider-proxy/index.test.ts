import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createProviderProxyRoutes } from '.'
import { ApiError } from '../../utils/error'

function createTestApp(fetchImpl: typeof globalThis.fetch) {
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: error.errorCode, message: error.message }, error.statusCode)
    }
    throw error
  })
  app.route('/api/v1/provider-proxy', createProviderProxyRoutes({ fetch: fetchImpl }))
  return app
}

describe('openCode Go provider proxy', () => {
  it('forwards only the OpenCode authorization and accepted response headers', async () => {
    const fetchMock = vi.fn(async () => new Response('{"data":[]}', {
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'upstream-session=secret',
        'x-request-id': 'request-1',
      },
    })) as unknown as typeof globalThis.fetch
    const app = createTestApp(fetchMock)

    const response = await app.request('/api/v1/provider-proxy/opencode-go/models', {
      headers: {
        Authorization: 'Bearer go-key',
        Cookie: 'airi-session=private',
      },
    })

    const [upstreamInput, upstreamInit] = vi.mocked(fetchMock).mock.calls[0]
    const upstreamHeaders = new Headers(upstreamInit?.headers)
    expect(String(upstreamInput)).toBe('https://opencode.ai/zen/go/v1/models')
    expect(upstreamHeaders.get('authorization')).toBe('Bearer go-key')
    expect(upstreamHeaders.has('cookie')).toBe(false)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('x-request-id')).toBe('request-1')
    expect(response.headers.has('set-cookie')).toBe(false)
  })

  it('streams chat completion responses from the fixed upstream route', async () => {
    const fetchMock = vi.fn(async () => new Response('data: {"choices":[]}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })) as unknown as typeof globalThis.fetch
    const app = createTestApp(fetchMock)
    const body = JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      model: 'kimi-k3',
      stream: true,
    })

    const response = await app.request('/api/v1/provider-proxy/opencode-go/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer go-key',
        'content-type': 'application/json',
      },
      body,
    })

    const [upstreamInput, upstreamInit] = vi.mocked(fetchMock).mock.calls[0]
    expect(String(upstreamInput)).toBe('https://opencode.ai/zen/go/v1/chat/completions')
    expect(upstreamInit?.method).toBe('POST')
    expect(new TextDecoder().decode(upstreamInit?.body as ArrayBuffer)).toBe(body)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(await response.text()).toBe('data: {"choices":[]}\n\n')
  })

  it('rejects missing OpenCode credentials before the upstream request', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch
    const app = createTestApp(fetchMock)

    const response = await app.request('/api/v1/provider-proxy/opencode-go/models')

    expect(response.status).toBe(401)
    expect(vi.mocked(fetchMock)).not.toHaveBeenCalled()
  })

  it('does not proxy arbitrary paths', async () => {
    const fetchMock = vi.fn() as unknown as typeof globalThis.fetch
    const app = createTestApp(fetchMock)

    const response = await app.request('/api/v1/provider-proxy/opencode-go/https://example.com')

    expect(response.status).toBe(404)
    expect(vi.mocked(fetchMock)).not.toHaveBeenCalled()
  })
})
