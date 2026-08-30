import type { FetchTransportPort, FetchTransportRequest, FetchTransportResponse } from '@proj-airi/core-agent'

import { describe, expect, it } from 'vitest'

import { createCustomModelRuntimeFromConfig, resolveCustomModelRuntimeConnection } from './runtime'

function validConnection() {
  return {
    protocol: 'openai-responses' as const,
    baseUrl: 'https://example.com/gateway/v1',
    generationPath: 'responses',
    modelListPath: 'models',
    auth: { type: 'bearer' as const, secret: 'sk-test' },
    headers: { 'X-Client-Name': 'AIRI' },
    models: [{ id: 'hand-filled-model' }],
  }
}

function utf8Stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function createRecordingTransport(
  handler: (request: FetchTransportRequest) => FetchTransportResponse,
): FetchTransportPort & { requests: FetchTransportRequest[] } {
  const requests: FetchTransportRequest[] = []
  return {
    requests,
    async request(input) {
      requests.push(input)
      return handler(input)
    },
  }
}

describe('custom model runtime wiring', () => {
  it('resolves the selected protocol URL and merged headers', () => {
    expect(resolveCustomModelRuntimeConnection(validConnection(), 'conn-1')).toEqual({
      connectionId: 'conn-1',
      protocol: 'openai-responses',
      generationUrl: 'https://example.com/gateway/v1/responses',
      modelListUrl: 'https://example.com/gateway/v1/models',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': 'Bearer sk-test',
        'X-Client-Name': 'AIRI',
      },
    })
  })

  it('resolves a discovery snapshot when no model ID is stored yet', () => {
    const snapshot = resolveCustomModelRuntimeConnection({
      protocol: 'openai-chat-completions',
      baseUrl: 'https://opencode.ai/zen/go/v1/',
      generationPath: 'chat/completions',
      modelListPath: 'models',
      auth: { type: 'bearer', secret: 'sk-test' },
      headers: {},
      models: [],
    }, 'conn-opencode', { requireModels: false })

    expect(snapshot.generationUrl).toBe('https://opencode.ai/zen/go/v1/chat/completions')
    expect(snapshot.modelListUrl).toBe('https://opencode.ai/zen/go/v1/models')
  })

  it('resolves a discovery snapshot from a Base URL without an API Key', () => {
    const snapshot = resolveCustomModelRuntimeConnection({
      protocol: 'openai-chat-completions',
      baseUrl: 'https://opencode.ai/zen/go/v1/',
      generationPath: 'chat/completions',
      modelListPath: 'models',
      auth: { type: 'bearer' },
      headers: {},
      models: [],
    }, 'conn-opencode', { requireModels: false, requireAuth: false })

    expect(snapshot.modelListUrl).toBe('https://opencode.ai/zen/go/v1/models')
    expect(snapshot.headers.authorization).toBeUndefined()
  })

  it('omits the model list URL when discovery is disabled', () => {
    const snapshot = resolveCustomModelRuntimeConnection({
      ...validConnection(),
      protocol: 'anthropic-messages',
      generationPath: 'messages',
      modelListPath: undefined,
      auth: { type: 'x-api-key', secret: 'sk-ant' },
    }, 'conn-2')

    expect(snapshot.protocol).toBe('anthropic-messages')
    expect(snapshot.generationUrl).toBe('https://example.com/gateway/v1/messages')
    expect(snapshot.modelListUrl).toBeUndefined()
    expect(snapshot.headers['x-api-key']).toBe('sk-ant')
  })

  it('creates a runtime that uses the selected protocol for generation validation', async () => {
    const transport = createRecordingTransport(request => ({
      requestId: request.requestId,
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: utf8Stream(JSON.stringify({ error: 'nope' })),
    }))
    const runtime = createCustomModelRuntimeFromConfig(validConnection(), {
      connectionId: 'conn-1',
      transport,
    })

    const result = await runtime.validateGeneration({ model: 'hand-filled-model' })

    expect(runtime.protocol).toBe('openai-responses')
    expect(result.success).toBe(false)
    expect(transport.requests).toHaveLength(1)
    expect(transport.requests[0]?.protocol).toBe('openai-responses')
    expect(transport.requests[0]?.url).toBe('https://example.com/gateway/v1/responses')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}').model).toBe('hand-filled-model')
    expect(transport.requests.some(request => request.protocol !== 'openai-responses')).toBe(false)
  })
})
