import type { Tool } from '@xsai/shared-chat'

import type { FetchTransportPort, FetchTransportRequest, FetchTransportResponse } from '../../contracts/fetch-transport-port'
import type { ModelRuntimeConnection } from '../../contracts/model-runtime-port'
import type { StreamEvent } from '../../types/llm'

import { describe, expect, it, vi } from 'vitest'

import { createCustomModelRuntime } from './runtime'

function utf8Stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function anthropicEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

function responseOf(request: FetchTransportRequest, body: string, contentType = 'text/event-stream'): FetchTransportResponse {
  return {
    requestId: request.requestId,
    status: 200,
    headers: { 'content-type': contentType },
    body: utf8Stream(body),
  }
}

function createScriptedTransport(
  scripts: Array<(request: FetchTransportRequest) => FetchTransportResponse>,
): FetchTransportPort & { requests: FetchTransportRequest[] } {
  const requests: FetchTransportRequest[] = []
  return {
    requests,
    async request(input) {
      requests.push(input)
      const script = scripts[requests.length - 1]
      if (!script)
        throw new Error(`Unexpected extra ${input.protocol} request ${requests.length}`)
      return script(input)
    },
  }
}

function openaiChatConnection(): ModelRuntimeConnection {
  return {
    connectionId: 'conn-chat',
    protocol: 'openai-chat-completions',
    generationUrl: 'https://gateway.example/v1/chat/completions',
    modelListUrl: 'https://gateway.example/v1/models',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': 'Bearer sk-test',
      'X-Client-Name': 'AIRI',
    },
  }
}

function openaiResponsesConnection(): ModelRuntimeConnection {
  return {
    connectionId: 'conn-responses',
    protocol: 'openai-responses',
    generationUrl: 'https://gateway.example/v1/responses',
    modelListUrl: 'https://gateway.example/v1/models',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': 'Bearer sk-test',
    },
  }
}

function anthropicConnection(): ModelRuntimeConnection {
  return {
    connectionId: 'conn-anthropic',
    protocol: 'anthropic-messages',
    generationUrl: 'https://gateway.example/v1/messages',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
    },
  }
}

function chatCompletionChunk(delta: Record<string, unknown>, finishReason: string | null = null, usage?: Record<string, number>) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-test',
    system_fingerprint: '',
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason,
    }],
    ...(usage ? { usage } : {}),
  }
}

function responsesCompleted(output: unknown[], usage = { input_tokens: 8, output_tokens: 2, total_tokens: 10 }) {
  return {
    type: 'response.completed',
    sequence_number: 9,
    response: {
      id: 'resp_1',
      object: 'response',
      created_at: 1,
      completed_at: 2,
      status: 'completed',
      incomplete_details: null,
      model: 'gpt-test',
      previous_response_id: null,
      instructions: null,
      output,
      error: null,
      tools: [],
      tool_choice: 'auto',
      truncation: 'disabled',
      parallel_tool_calls: true,
      text: { format: { type: 'text' } },
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_logprobs: 0,
      temperature: 1,
      reasoning: null,
      usage: {
        ...usage,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
      max_output_tokens: null,
      max_tool_calls: null,
      store: false,
      background: false,
      service_tier: 'default',
      metadata: null,
      safety_identifier: null,
      prompt_cache_key: null,
    },
  }
}

const weatherTool = {
  type: 'function',
  function: {
    name: 'weather',
    description: 'Get weather',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
  execute: vi.fn(async () => 'sunny'),
} satisfies Tool

describe('protocol adapter golden streams', () => {
  it('sends OpenAI Chat Completions to the configured endpoint and maps text, tools, finish, and usage', async () => {
    weatherTool.execute.mockClear()
    const transport = createScriptedTransport([
      request => responseOf(request, [
        sseData(chatCompletionChunk({
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call_weather',
            type: 'function',
            function: { name: 'weather', arguments: '{"city":"paris"}' },
          }],
        }, 'tool_calls')),
        'data: [DONE]\n\n',
      ].join('')),
      request => responseOf(request, [
        sseData(chatCompletionChunk({ role: 'assistant', content: 'Sunny.' })),
        sseData(chatCompletionChunk({}, 'stop', {
          prompt_tokens: 8,
          completion_tokens: 2,
          total_tokens: 10,
        })),
        'data: [DONE]\n\n',
      ].join('')),
    ])
    const events: StreamEvent[] = []
    const usageEvents: unknown[] = []
    const runtime = createCustomModelRuntime(openaiChatConnection(), transport)

    await runtime.stream({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'weather?' }],
      tools: [weatherTool],
      options: {
        onStreamEvent: (event) => {
          events.push(event)
        },
        onUsage: (usage) => {
          usageEvents.push(usage)
        },
      },
    })

    expect(transport.requests).toHaveLength(2)
    expect(transport.requests[0]?.protocol).toBe('openai-chat-completions')
    expect(transport.requests[0]?.operation).toBe('generate')
    expect(transport.requests[0]?.method).toBe('POST')
    expect(transport.requests[0]?.url).toBe('https://gateway.example/v1/chat/completions')
    expect(transport.requests[0]?.headers.authorization).toBe('Bearer sk-test')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}').model).toBe('gpt-test')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}').stream).toBe(true)
    expect(transport.requests.every(request => request.protocol === 'openai-chat-completions')).toBe(true)
    expect(transport.requests.every(request => request.url === 'https://gateway.example/v1/chat/completions')).toBe(true)
    expect(weatherTool.execute).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual({
      type: 'tool-call',
      args: '{"city":"paris"}',
      toolCallId: 'call_weather',
      toolCallType: 'function',
      toolName: 'weather',
    })
    expect(events).toContainEqual({
      type: 'tool-result',
      toolCallId: 'call_weather',
      result: 'sunny',
    })
    expect(events).toContainEqual({ type: 'text-delta', text: 'Sunny.' })
    expect(events).toContainEqual({ type: 'finish' })
    expect(usageEvents).toEqual([{
      inputTokens: 8,
      outputTokens: 2,
      totalTokens: 10,
      source: 'reported',
    }])
  })

  it('sends OpenAI Responses to the configured endpoint and maps stream events', async () => {
    weatherTool.execute.mockClear()
    const functionCall = {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_weather',
      name: 'weather',
      arguments: '{"city":"paris"}',
      status: 'completed',
    }
    const transport = createScriptedTransport([
      request => responseOf(request, [
        sseData({ type: 'response.created', sequence_number: 0, response: { id: 'resp_1', output: [] } }),
        sseData({
          type: 'response.output_item.added',
          sequence_number: 1,
          output_index: 0,
          item: functionCall,
        }),
        sseData({
          type: 'response.function_call_arguments.delta',
          sequence_number: 2,
          item_id: 'fc_1',
          output_index: 0,
          delta: '{"city":"paris"}',
        }),
        sseData({
          type: 'response.output_item.done',
          sequence_number: 3,
          output_index: 0,
          item: functionCall,
        }),
        sseData(responsesCompleted([functionCall])),
      ].join('')),
      request => responseOf(request, [
        sseData({ type: 'response.created', sequence_number: 0, response: { id: 'resp_2', output: [] } }),
        sseData({
          type: 'response.output_text.delta',
          sequence_number: 1,
          item_id: 'msg_1',
          output_index: 0,
          content_index: 0,
          delta: 'Sunny.',
        }),
        sseData(responsesCompleted([{
          type: 'message',
          id: 'msg_1',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Sunny.', annotations: [] }],
        }])),
      ].join('')),
    ])
    const events: StreamEvent[] = []
    const runtime = createCustomModelRuntime(openaiResponsesConnection(), transport)

    await runtime.stream({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'weather?' }],
      tools: [weatherTool],
      options: {
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    })

    expect(transport.requests[0]?.protocol).toBe('openai-responses')
    expect(transport.requests[0]?.url).toBe('https://gateway.example/v1/responses')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}').model).toBe('gpt-test')
    expect(transport.requests.every(request => request.protocol === 'openai-responses')).toBe(true)
    expect(events).toContainEqual({
      type: 'tool-call',
      args: '{"city":"paris"}',
      toolCallId: 'call_weather',
      toolCallType: 'function',
      toolName: 'weather',
    })
    expect(events).toContainEqual({ type: 'text-delta', text: 'Sunny.' })
    expect(events).toContainEqual({ type: 'finish' })
  })

  it('sends Anthropic Messages to the configured endpoint and maps text, tools, finish, and usage', async () => {
    weatherTool.execute.mockClear()
    const transport = createScriptedTransport([
      request => responseOf(request, [
        anthropicEvent('message_start', {
          type: 'message_start',
          message: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-test',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 8, output_tokens: 0 },
          },
        }),
        anthropicEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'call_weather', name: 'weather', input: {} },
        }),
        anthropicEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"city":"paris"}' },
        }),
        anthropicEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
        anthropicEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 4 },
        }),
        anthropicEvent('message_stop', { type: 'message_stop' }),
      ].join('')),
      request => responseOf(request, [
        anthropicEvent('message_start', {
          type: 'message_start',
          message: {
            id: 'msg_2',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-test',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 12, output_tokens: 0 },
          },
        }),
        anthropicEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        }),
        anthropicEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Sunny.' },
        }),
        anthropicEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
        anthropicEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 2 },
        }),
        anthropicEvent('message_stop', { type: 'message_stop' }),
      ].join('')),
    ])
    const events: StreamEvent[] = []
    const usageEvents: unknown[] = []
    const runtime = createCustomModelRuntime(anthropicConnection(), transport)

    await runtime.stream({
      model: 'claude-test',
      messages: [{ role: 'user', content: 'weather?' }],
      tools: [weatherTool],
      options: {
        onStreamEvent: (event) => {
          events.push(event)
        },
        onUsage: (usage) => {
          usageEvents.push(usage)
        },
      },
    })

    expect(transport.requests[0]?.protocol).toBe('anthropic-messages')
    expect(transport.requests[0]?.operation).toBe('generate')
    expect(transport.requests[0]?.url).toBe('https://gateway.example/v1/messages')
    expect(transport.requests[0]?.headers['x-api-key']).toBe('sk-ant-test')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}').model).toBe('claude-test')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}').stream).toBe(true)
    expect(transport.requests.every(request => request.protocol === 'anthropic-messages')).toBe(true)
    expect(weatherTool.execute).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual({
      type: 'tool-call',
      args: '{"city":"paris"}',
      toolCallId: 'call_weather',
      toolCallType: 'function',
      toolName: 'weather',
    })
    expect(events).toContainEqual({ type: 'text-delta', text: 'Sunny.' })
    expect(events).toContainEqual({ type: 'finish' })
    expect(usageEvents).toEqual([{
      inputTokens: 12,
      outputTokens: 2,
      totalTokens: 14,
      source: 'reported',
    }])
  })
})
