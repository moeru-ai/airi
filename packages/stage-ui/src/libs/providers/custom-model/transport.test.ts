import type { FetchTransportPort, FetchTransportRequest, FetchTransportResponse } from '@proj-airi/core-agent'

import { ModelConnectionError } from '@proj-airi/core-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createCustomModelFetchTransport,
  registerCustomModelElectronTransport,
  resetCustomModelElectronTransportForTesting,
  resolveCustomModelTransportPlatform,
} from './transport'

const UPSTREAM_URL = 'https://example.com/v1/chat/completions'
const AIRI_API_URL = 'https://api.airi.build/v1/chat/completions'

function generateRequest(overrides: Partial<FetchTransportRequest> = {}): FetchTransportRequest {
  return {
    requestId: 'req-1',
    protocol: 'openai-chat-completions',
    operation: 'generate',
    url: UPSTREAM_URL,
    method: 'POST',
    headers: { authorization: 'Bearer sk-test' },
    body: JSON.stringify({ model: 'gpt-test' }),
    ...overrides,
  }
}

function createElectronTransport(): FetchTransportPort & { requests: FetchTransportRequest[] } {
  const requests: FetchTransportRequest[] = []
  return {
    requests,
    async request(input) {
      requests.push(input)
      return {
        requestId: input.requestId,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: null,
      } satisfies FetchTransportResponse
    },
  }
}

describe('custom model fetch transport factory', () => {
  afterEach(() => {
    resetCustomModelElectronTransportForTesting()
  })

  it('selects web as the default platform outside Electron', () => {
    expect(resolveCustomModelTransportPlatform()).toBe('web')
  })

  it('sends web requests to the resolved upstream URL and never to the AIRI API server', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const transport = createCustomModelFetchTransport({ platform: 'web', fetch: fetchImpl })

    await transport.request(generateRequest())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(UPSTREAM_URL)
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toBe(AIRI_API_URL)
  })

  it('does not retry a failed web request through a proxy', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const transport = createCustomModelFetchTransport({ platform: 'web', fetch: fetchImpl })

    await expect(transport.request(generateRequest())).rejects.toMatchObject({
      code: 'browser-request-blocked',
      stage: 'transport',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(UPSTREAM_URL)
  })

  it('selects the Electron Eventa transport and does not call fetch', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
      throw new Error('Renderer must not fetch the user URL')
    })
    const electron = createElectronTransport()
    const transport = createCustomModelFetchTransport({
      platform: 'electron',
      fetch: fetchImpl,
      electron,
    })

    const response = await transport.request(generateRequest())

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(electron.requests).toHaveLength(1)
    expect(electron.requests[0]?.url).toBe(UPSTREAM_URL)
    expect(response.status).toBe(200)
  })

  it('uses a registered Electron transport when the factory does not receive one', async () => {
    const electron = createElectronTransport()
    registerCustomModelElectronTransport(electron)

    const transport = createCustomModelFetchTransport({ platform: 'electron' })
    await transport.request(generateRequest())

    expect(electron.requests).toHaveLength(1)
  })

  it('refuses Electron when no Eventa transport is registered', () => {
    expect(() => createCustomModelFetchTransport({ platform: 'electron' })).toThrow(ModelConnectionError)
    expect(() => createCustomModelFetchTransport({ platform: 'electron' })).toThrow(
      'Electron custom model transport is missing.',
    )
  })
})
