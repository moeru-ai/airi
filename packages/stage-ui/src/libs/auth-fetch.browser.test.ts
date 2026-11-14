import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../stores/auth'
import { authedFetch } from './auth-fetch'

vi.mock('./product-signals', () => ({
  getAnalyticsIdentityHeaders: () => null,
}))

describe('authedFetch Request inputs', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().token = 'test-access-token'
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // ROOT CAUSE:
  // The wrapper read only init.headers and replaced headers that belonged to the Request.
  // It now reads Request headers unless init.headers replaces them.
  it('preserves Request headers and uses the current access token', async () => {
    let sent: Request | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      sent = new Request(input, init)
      return Response.json({})
    })
    const request = new Request('https://example.com/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'test-request',
        'Authorization': 'Bearer old-access-token',
      },
      body: JSON.stringify({ message: 'hello' }),
    })

    await authedFetch(request)

    expect(sent?.headers.get('Content-Type')).toBe('application/json')
    expect(sent?.headers.get('X-Request-Id')).toBe('test-request')
    expect(sent?.headers.get('Authorization')).toBe('Bearer test-access-token')
    expect(request.headers.get('Authorization')).toBe('Bearer old-access-token')
  })

  it('keeps explicit request options and replaces headers like fetch', async () => {
    let sent: Request | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      sent = new Request(input, init)
      return Response.json({})
    })
    const request = new Request('https://example.com/action', {
      method: 'POST',
      headers: { 'X-Original': 'original' },
      body: 'original body',
    })

    await authedFetch(request, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain', 'X-Override': 'override' },
      body: 'replacement body',
      credentials: 'include',
    })

    expect(sent?.method).toBe('PUT')
    expect(sent?.headers.has('X-Original')).toBe(false)
    expect(sent?.headers.get('X-Override')).toBe('override')
    expect(sent?.headers.get('Content-Type')).toBe('text/plain')
    expect(sent?.headers.get('Authorization')).toBe('Bearer test-access-token')
    expect(sent?.credentials).toBe('omit')
    expect(await sent?.text()).toBe('replacement body')
  })

  // ROOT CAUSE:
  // The first fetch consumed the Request body. A fresh copy must carry the body into the retry.
  // Each attempt now clones the Request before fetch consumes it.
  it.each([
    { name: 'JSON', body: new Blob(['{"message":"hello"}'], { type: 'application/json' }) },
    { name: 'binary', body: new Blob([new Uint8Array([0, 128, 255])], { type: 'application/octet-stream' }) },
  ])('replays a $name Request body after a 401', async ({ body }) => {
    const auth = useAuthStore()
    const refresh = vi.spyOn(auth, 'refreshTokenNow').mockResolvedValue('renewed-access-token')
    const sent: Array<{ bytes: number[], headers: Headers }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      // Native Request construction and body reads consume the input, as a network fetch does.
      const request = new Request(input, init)
      sent.push({
        bytes: Array.from(new Uint8Array(await request.arrayBuffer())),
        headers: request.headers,
      })
      return Response.json({}, { status: sent.length === 1 ? 401 : 200 })
    })
    const request = new Request('https://example.com/action', { method: 'POST', body })

    const response = await authedFetch(request)

    expect(response.status).toBe(200)
    expect(refresh).toHaveBeenCalledExactlyOnceWith(auth.sessionVersion)
    expect(sent).toHaveLength(2)
    expect(sent[0]?.bytes).toEqual(Array.from(new Uint8Array(await body.arrayBuffer())))
    expect(sent[1]?.bytes).toEqual(sent[0]?.bytes)
    expect(sent[0]?.headers.get('Content-Type')).toBe(body.type)
    expect(sent[1]?.headers.get('Content-Type')).toBe(body.type)
    expect(sent[0]?.headers.get('Authorization')).toBe('Bearer test-access-token')
    expect(sent[1]?.headers.get('Authorization')).toBe('Bearer renewed-access-token')
  })

  it('preserves caller cancellation with the native browser fetch', async () => {
    const controller = new AbortController()
    const request = new Request('https://example.com/action', { signal: controller.signal })
    controller.abort()

    await expect(authedFetch(request)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
