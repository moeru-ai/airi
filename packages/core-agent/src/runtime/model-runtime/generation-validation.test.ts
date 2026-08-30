import type { FetchTransportPort, FetchTransportRequest, FetchTransportResponse } from '../../contracts/fetch-transport-port'
import type { ModelRuntimeConnection } from '../../contracts/model-runtime-port'

import { describe, expect, it } from 'vitest'

import { discoverModelsWithTransport } from './discovery'
import { createCustomModelRuntime } from './runtime'

function utf8Stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
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

function chatConnection(): ModelRuntimeConnection {
  return {
    connectionId: 'conn-1',
    protocol: 'openai-chat-completions',
    generationUrl: 'https://gateway.example/v1/chat/completions',
    modelListUrl: 'https://gateway.example/v1/models',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': 'Bearer sk-test',
    },
  }
}

function chatSse(text: string): string {
  return [
    `data: ${JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'hand-filled-model',
      system_fingerprint: '',
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'hand-filled-model',
      system_fingerprint: '',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('')
}

describe('generation validation', () => {
  it('uses the selected model and the same adapter after discovery fails', async () => {
    const transport = createRecordingTransport((request) => {
      if (request.operation === 'list-models') {
        return {
          requestId: request.requestId,
          status: 500,
          headers: { 'content-type': 'application/json' },
          body: utf8Stream(JSON.stringify({ error: 'models down' })),
        }
      }

      return {
        requestId: request.requestId,
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: utf8Stream(chatSse('ok')),
      }
    })
    const runtime = createCustomModelRuntime(chatConnection(), transport)

    const discovery = await discoverModelsWithTransport(chatConnection(), transport)
    const validation = await runtime.validateGeneration({ model: 'hand-filled-model' })

    expect(discovery.status).toBe('failed')
    expect(validation).toEqual({ success: true })
    expect(transport.requests.map(request => request.operation)).toEqual(['list-models', 'generate'])
    expect(transport.requests[1]?.protocol).toBe('openai-chat-completions')
    expect(transport.requests[1]?.url).toBe('https://gateway.example/v1/chat/completions')
    expect(JSON.parse(transport.requests[1]?.body ?? '{}').model).toBe('hand-filled-model')
    expect(JSON.parse(transport.requests[1]?.body ?? '{}').max_tokens).toBe(16)
  })

  it('validates a hand-filled model after discovery is empty or unsupported', async () => {
    const emptyTransport = createRecordingTransport((request) => {
      if (request.operation === 'list-models') {
        return {
          requestId: request.requestId,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: utf8Stream(JSON.stringify({ data: [] })),
        }
      }

      return {
        requestId: request.requestId,
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: utf8Stream(chatSse('ok')),
      }
    })
    const emptyRuntime = createCustomModelRuntime(chatConnection(), emptyTransport)
    const emptyDiscovery = await emptyRuntime.discover()
    const emptyValidation = await emptyRuntime.validateGeneration({ model: 'hand-filled-model' })

    expect(emptyDiscovery.status).toBe('empty')
    expect(emptyValidation).toEqual({ success: true })
    expect(emptyTransport.requests.map(request => request.operation)).toEqual(['list-models', 'generate'])
    expect(JSON.parse(emptyTransport.requests[1]?.body ?? '{}').model).toBe('hand-filled-model')

    const unsupportedRuntime = createCustomModelRuntime({
      ...chatConnection(),
      modelListUrl: undefined,
    }, createRecordingTransport(request => ({
      requestId: request.requestId,
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: utf8Stream(chatSse('ok')),
    })))
    const unsupportedDiscovery = await unsupportedRuntime.discover()
    const unsupportedValidation = await unsupportedRuntime.validateGeneration({ model: 'hand-filled-model' })

    expect(unsupportedDiscovery.status).toBe('unsupported')
    expect(unsupportedValidation).toEqual({ success: true })
  })

  it('reports unauthorized generation errors without sending another protocol request', async () => {
    const transport = createRecordingTransport(request => ({
      requestId: request.requestId,
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: utf8Stream(JSON.stringify({ error: { message: 'invalid key' } })),
    }))
    const runtime = createCustomModelRuntime(chatConnection(), transport)

    const validation = await runtime.validateGeneration({ model: 'hand-filled-model' })

    expect(validation.success).toBe(false)
    if (!('error' in validation))
      throw new Error('expected generation validation to fail')

    const error = validation.error
    expect(error.stage).toBe('generation')
    expect(error.code).toBe('unauthorized')
    expect(error.status).toBe(401)
    expect(transport.requests).toHaveLength(1)
    expect(transport.requests[0]?.protocol).toBe('openai-chat-completions')
    expect(transport.requests[0]?.url).toBe('https://gateway.example/v1/chat/completions')
    expect(transport.requests.some(request => request.protocol !== 'openai-chat-completions')).toBe(false)
    expect(transport.requests.some(request => request.url.includes('/responses'))).toBe(false)
    expect(transport.requests.some(request => request.url.endsWith('/messages'))).toBe(false)
  })
})
