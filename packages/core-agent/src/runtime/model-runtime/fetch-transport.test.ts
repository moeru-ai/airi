import type { FetchTransportRequest } from '../../contracts/fetch-transport-port'

import { describe, expect, it, vi } from 'vitest'

import { createBrowserRequestBlockedDiagnostics, ModelConnectionError } from './errors'
import {
  createDirectFetchTransport,
  FETCH_TRANSPORT_MAX_BODY_BYTES,
  parseFetchTransportRequest,
} from './fetch-transport'

function generateRequest(overrides: Partial<FetchTransportRequest> = {}): FetchTransportRequest {
  return {
    requestId: 'req-1',
    protocol: 'openai-chat-completions',
    operation: 'generate',
    url: 'https://example.com/v1/chat/completions',
    method: 'POST',
    headers: { authorization: 'Bearer sk-test' },
    body: JSON.stringify({ model: 'gpt-test' }),
    ...overrides,
  }
}

describe('direct fetch transport', () => {
  it('sends generate requests to the resolved upstream URL', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'secret=1' },
      })
    })
    const transport = createDirectFetchTransport({ fetch: fetchImpl })

    const response = await transport.request(generateRequest())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://example.com/v1/chat/completions')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(response.requestId).toBe('req-1')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/json')
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('aborts the upstream fetch when the request signal aborts', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new Error('aborted'))
        })
      })
    })
    const transport = createDirectFetchTransport({ fetch: fetchImpl })
    const pending = transport.request(generateRequest({ signal: controller.signal }))

    controller.abort('user-cancel')

    await expect(pending).rejects.toBe('user-cancel')
  })

  it('does not send the request to the AIRI API server', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('{}', { status: 200 })
    })
    const transport = createDirectFetchTransport({ fetch: fetchImpl })

    await transport.request(generateRequest())

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://example.com/v1/chat/completions')
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('api.airi.build')
  })

  it('maps opaque fetch TypeError to browser-request-blocked', async () => {
    const transport = createDirectFetchTransport({
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    try {
      await transport.request(generateRequest())
      throw new Error('expected transport failure')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ModelConnectionError)
      expect(error).toMatchObject({
        stage: 'transport',
        code: 'browser-request-blocked',
        retryable: false,
      })
      expect(createBrowserRequestBlockedDiagnostics().possibleCauses).toEqual([
        'cors',
        'network',
        'tls',
      ])
    }
  })

  it('rejects a request body that is larger than the size limit', () => {
    const body = 'x'.repeat(FETCH_TRANSPORT_MAX_BODY_BYTES + 1)

    expect(() => parseFetchTransportRequest(generateRequest({ body }))).toThrow(ModelConnectionError)
    expect(() => parseFetchTransportRequest(generateRequest({ body }))).toThrow(
      `Request body is larger than ${FETCH_TRANSPORT_MAX_BODY_BYTES} bytes.`,
    )
  })

  it('rejects a generate envelope that uses GET', () => {
    expect(() => parseFetchTransportRequest(generateRequest({ method: 'GET' }))).toThrow(
      'Operation generate does not use HTTP GET.',
    )
  })
})
