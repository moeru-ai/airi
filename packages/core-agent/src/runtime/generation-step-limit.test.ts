import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import type { AssistantTurn } from '../messages/types'
import type { StreamEvent } from '../types/llm'

import { describe, expect, it, vi } from 'vitest'

import { conversationToChatMessages } from '../messages/chat-completions'
import { streamFrom } from './llm-service'

function sse(events: unknown[]) {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
}

function toolsResponse(protocol: 'chat-completions' | 'responses', requestIndex: number, toolCount: number) {
  if (protocol === 'responses') {
    const output = requestIndex === 1
      ? Array.from({ length: toolCount }, (_, index) => ({
          type: 'function_call',
          id: `fc-${index}`,
          call_id: `call-${index}`,
          name: `tool-${index}`,
          arguments: '{}',
        }))
      : [{ type: 'message', role: 'assistant', id: 'answer', content: [{ type: 'output_text', text: 'Unexpected extra request.', annotations: [] }] }]
    return sse([
      ...output.map(item => ({ type: 'response.output_item.done', item })),
      { type: 'response.completed', response: { output } },
    ])
  }

  const chunk = requestIndex === 1
    ? { choices: [{ index: 0, delta: { tool_calls: Array.from({ length: toolCount }, (_, index) => ({
        index,
        id: `call-${index}`,
        type: 'function',
        function: { name: `tool-${index}`, arguments: '{}' },
      })) }, finish_reason: 'tool_calls' }] }
    : { choices: [{ index: 0, delta: { content: 'Unexpected extra request.' }, finish_reason: 'stop' }] }
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

function sequentialToolResponse(protocol: 'chat-completions' | 'responses', requestIndex: number, toolSteps: number) {
  if (protocol === 'responses') {
    const output = requestIndex <= toolSteps
      ? [{ type: 'function_call', id: `fc-${requestIndex}`, call_id: `call-${requestIndex}`, name: 'repeat', arguments: '{}' }]
      : [{ type: 'message', role: 'assistant', id: 'answer', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] }]
    return sse([
      ...output.map(item => ({ type: 'response.output_item.done', item })),
      { type: 'response.completed', response: { output } },
    ])
  }

  const chunk = requestIndex <= toolSteps
    ? { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${requestIndex}`, type: 'function', function: { name: 'repeat', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
    : { choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }] }
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
}

describe.each(['chat-completions', 'responses'] as const)('%s decision-step budget', (protocol) => {
  it('settles every tool call in the final allowed step and stores a checkpoint', async () => {
    const toolCount = 40
    let requestCount = 0
    const executed: number[] = []
    const events: StreamEvent[] = []
    let generatedTurn: AssistantTurn | undefined
    const fetch: typeof globalThis.fetch = async () => {
      requestCount += 1
      return toolsResponse(protocol, requestCount, toolCount)
    }
    const chatProvider: GenerationProvider = {
      generation: model => protocol === 'responses'
        ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.test/v1/', fetch } }
        : { protocol, config: { model, baseURL: 'https://example.test/v1/', fetch } },
    }
    const tools: Tool[] = Array.from({ length: toolCount }, (_, index) => ({
      type: 'function',
      function: { name: `tool-${index}`, parameters: { type: 'object', properties: {} } },
      execute: () => {
        executed.push(index)
        return `result-${index}`
      },
    }))

    await streamFrom({
      model: 'test',
      chatProvider,
      conversation: { turns: [] },
      options: {
        maxSteps: 1,
        tools,
        onStreamEvent: (event) => { events.push(event) },
        onGeneratedTurn: (turn) => { generatedTurn = turn },
      },
    })

    expect(requestCount).toBe(1)
    expect(executed).toHaveLength(toolCount)
    expect([...executed].sort((left, right) => left - right)).toEqual(Array.from({ length: toolCount }, (_, index) => index))
    expect(generatedTurn?.rounds).toHaveLength(1)
    expect(generatedTurn?.rounds[0].toolInvocations).toHaveLength(toolCount)
    expect(generatedTurn?.rounds[0].toolInvocations.every(call => call.execution.status === 'succeeded')).toBe(true)
    expect(generatedTurn?.stopReason).toEqual({ type: 'step-limit', maxSteps: 1, completedSteps: 1 })
    expect(events).toContainEqual({ type: 'step-limit', maxSteps: 1, completedSteps: 1 })
    expect(events.at(-1)).toEqual({ type: 'finish' })
    if (!generatedTurn)
      throw new Error('Missing generated checkpoint')
    expect(conversationToChatMessages({ turns: [generatedTurn] }).at(-1)?.content).toContain('not-verified')
  })

  it('stops after the default 30 decision steps and stores all settled rounds', async () => {
    const requestCount = { value: 0 }
    const execute = vi.fn(() => 'Settled.')
    let generatedTurn: AssistantTurn | undefined
    const fetch: typeof globalThis.fetch = async () => {
      requestCount.value += 1
      return sequentialToolResponse(protocol, requestCount.value, 35)
    }
    const chatProvider: GenerationProvider = {
      generation: model => protocol === 'responses'
        ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.test/v1/', fetch } }
        : { protocol, config: { model, baseURL: 'https://example.test/v1/', fetch } },
    }

    await streamFrom({
      model: 'test',
      chatProvider,
      conversation: { turns: [] },
      options: {
        tools: [{ type: 'function', function: { name: 'repeat', parameters: { type: 'object', properties: {} } }, execute }],
        onGeneratedTurn: (turn) => { generatedTurn = turn },
      },
    })

    expect(requestCount.value).toBe(30)
    expect(execute).toHaveBeenCalledTimes(30)
    expect(generatedTurn?.rounds).toHaveLength(30)
    expect(generatedTurn?.stopReason).toEqual({ type: 'step-limit', maxSteps: 30, completedSteps: 30 })
  })
})

it('keeps one decision-step budget across a protocol switch', async () => {
  let model = 'chat-model'
  const requests: string[] = []
  const executed: string[] = []
  let generatedTurn: AssistantTurn | undefined
  const chatFetch: typeof globalThis.fetch = async () => {
    requests.push('chat')
    return new Response('data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"chat-call","type":"function","function":{"name":"inspect","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const responsesFetch: typeof globalThis.fetch = async () => {
    requests.push('responses')
    return sse([
      { type: 'response.output_item.done', item: { type: 'function_call', id: 'fc-response', call_id: 'response-call', name: 'inspect', arguments: '{}' } },
      { type: 'response.completed', response: { output: [{ type: 'function_call', id: 'fc-response', call_id: 'response-call', name: 'inspect', arguments: '{}' }] } },
    ])
  }
  const chatProvider: GenerationProvider = {
    generation: currentModel => currentModel === 'chat-model'
      ? { protocol: 'chat-completions', config: { model: currentModel, baseURL: 'https://chat.example.test/v1/', fetch: chatFetch } }
      : { protocol: 'responses', webSearch: false, config: { model: currentModel, baseURL: 'https://responses.example.test/v1/', fetch: responsesFetch } },
  }
  const tool: Tool = {
    type: 'function',
    function: { name: 'inspect', parameters: { type: 'object', properties: {} } },
    execute: () => {
      executed.push(model)
      model = 'responses-model'
      return `result-${executed.length}`
    },
  }

  await streamFrom({
    model,
    chatProvider,
    conversation: { turns: [] },
    options: {
      maxSteps: 2,
      resolveStep: async () => ({ model, chatProvider, providerId: 'test', systemPrompt: '', tools: [tool] }),
      onGeneratedTurn: (turn) => { generatedTurn = turn },
    },
  })

  expect(requests).toEqual(['chat', 'responses'])
  expect(executed).toEqual(['chat-model', 'responses-model'])
  expect(generatedTurn?.rounds).toHaveLength(2)
  expect(generatedTurn?.stopReason).toEqual({ type: 'step-limit', maxSteps: 2, completedSteps: 2 })
})

it('rejects a non-positive decision-step budget before contacting a provider', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  const chatProvider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch } }),
  }

  await expect(streamFrom({
    model: 'test',
    chatProvider,
    conversation: { turns: [] },
    options: { maxSteps: 0 },
  })).rejects.toThrow('maxSteps must be a positive safe integer')
  expect(fetch).not.toHaveBeenCalled()
})
