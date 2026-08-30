import type { FetchTransportPort, FetchTransportRequest, FetchTransportResponse } from '../../contracts/fetch-transport-port'
import type { ModelRuntimeConnection } from '../../contracts/model-runtime-port'

import { describe, expect, it } from 'vitest'

import { createModelDiscoverySession, discoverModelsWithTransport } from './discovery'
import { ModelConnectionError } from './errors'

function connection(overrides: Partial<ModelRuntimeConnection> = {}): ModelRuntimeConnection {
  return {
    connectionId: 'conn-1',
    protocol: 'openai-chat-completions',
    generationUrl: 'https://example.com/v1/chat/completions',
    modelListUrl: 'https://example.com/v1/models',
    headers: { authorization: 'Bearer sk-test' },
    ...overrides,
  }
}

function jsonResponse(request: FetchTransportRequest, status: number, body: unknown): FetchTransportResponse {
  return {
    requestId: request.requestId,
    status,
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)))
        controller.close()
      },
    }),
  }
}

function createRecordingTransport(
  handler: (request: FetchTransportRequest) => FetchTransportResponse | Promise<FetchTransportResponse>,
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

describe('model discovery', () => {
  it('starts idle, moves to loading, then stores success', async () => {
    const session = createModelDiscoverySession()
    expect(session.state.status).toBe('idle')

    let sawLoading = false
    const result = await session.run(async () => {
      sawLoading = session.state.status === 'loading'
      return {
        status: 'success',
        models: [{ id: 'gpt-test' }],
      }
    })
    expect(sawLoading).toBe(true)

    expect(result.status).toBe('success')
    expect(session.state).toEqual({
      status: 'success',
      models: [{ id: 'gpt-test' }],
    })
  })

  it('does not stay loading when discovery throws', async () => {
    const session = createModelDiscoverySession()

    const result = await session.run(async () => {
      throw new Error('discovery exploded')
    })

    expect(result.status).toBe('failed')
    expect(session.state.status).toBe('failed')
  })

  it('returns unsupported without sending a request when the model list URL is omitted', async () => {
    const transport = createRecordingTransport(() => {
      throw new Error('discovery must not send a request')
    })

    const result = await discoverModelsWithTransport(
      connection({ modelListUrl: undefined }),
      transport,
    )

    expect(result).toEqual({ status: 'unsupported' })
    expect(transport.requests).toEqual([])
  })

  it('returns empty when the model list has no models', async () => {
    const transport = createRecordingTransport(request => jsonResponse(request, 200, { data: [] }))

    const result = await discoverModelsWithTransport(connection(), transport)

    expect(result).toEqual({ status: 'empty', models: [] })
    expect(transport.requests[0]?.operation).toBe('list-models')
    expect(transport.requests[0]?.method).toBe('GET')
    expect(transport.requests[0]?.url).toBe('https://example.com/v1/models')
    expect(transport.requests[0]?.protocol).toBe('openai-chat-completions')
  })

  it('returns unsupported when the model list endpoint is missing', async () => {
    const transport = createRecordingTransport(request => jsonResponse(request, 404, { error: 'missing' }))

    const result = await discoverModelsWithTransport(connection(), transport)

    expect(result).toEqual({ status: 'unsupported' })
  })

  it('returns failed for a network error and does not treat that as generation failure', async () => {
    const transport = createRecordingTransport(() => {
      throw new ModelConnectionError({
        stage: 'transport',
        code: 'browser-request-blocked',
        message: 'Failed to fetch',
        retryable: false,
      })
    })

    const result = await discoverModelsWithTransport(connection(), transport)

    expect(result.status).toBe('failed')
    if (result.status !== 'failed')
      throw new Error('expected discovery to fail')
    expect(result.error.stage).toBe('discovery')
    expect(result.error.code).toBe('browser-request-blocked')
    expect(result.error.message).toContain('Failed to fetch')
  })

  it('parses Anthropic model records without dropping display names', async () => {
    const transport = createRecordingTransport(request => jsonResponse(request, 200, {
      data: [{ id: 'claude-sonnet', display_name: 'Claude Sonnet' }],
    }))

    const result = await discoverModelsWithTransport(
      connection({
        protocol: 'anthropic-messages',
        generationUrl: 'https://example.com/v1/messages',
      }),
      transport,
    )

    expect(result).toEqual({
      status: 'success',
      models: [{ id: 'claude-sonnet', name: 'Claude Sonnet' }],
    })
    expect(transport.requests[0]?.protocol).toBe('anthropic-messages')
  })
})
