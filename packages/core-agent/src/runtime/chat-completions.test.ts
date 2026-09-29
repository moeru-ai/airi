import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { AssistantTurn } from '../messages/types'

import { expect, it, vi } from 'vitest'

import { streamFrom } from './llm-service'

// https://github.com/moeru-ai/airi/pull/2477
it('records real Chat SDK rounds and keeps failed tool results on their invocation', async () => {
  const requests: { messages: unknown[] }[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    const chunk = requests.length === 1
      ? { choices: [{ index: 0, delta: { tool_calls: [
          { index: 0, id: 'failed', type: 'function', function: { name: 'lookup', arguments: '{}' } },
          { index: 1, id: 'ok', type: 'function', function: { name: 'backup', arguments: '{}' } },
        ] }, finish_reason: 'tool_calls' }] }
      : { choices: [{ index: 0, delta: { content: 'Used the backup.' }, finish_reason: 'stop' }] }
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const failure = vi.fn(() => {
    throw new Error('Lookup failed')
  })
  const backup = vi.fn(() => 'Backup result')
  let generatedTurn: AssistantTurn | undefined
  await streamFrom({
    model: 'test',
    chatProvider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch } }) },
    conversation: { turns: [] },
    options: {
      tools: [
        { type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } }, execute: failure },
        { type: 'function', function: { name: 'backup', parameters: { type: 'object', properties: {} } }, execute: backup },
      ],
      onGeneratedTurn: (turn) => { generatedTurn = turn },
    },
  })
  expect(requests).toHaveLength(2)
  expect(generatedTurn?.rounds.map(round => round.toolInvocations.length)).toEqual([2, 0])
  expect(generatedTurn?.rounds[0].toolInvocations[0].execution.status).toBe('failed')
  expect(generatedTurn?.rounds[0].toolInvocations[1].execution).toEqual({ status: 'succeeded', output: [{ type: 'text', text: 'Backup result' }] })
  expect(generatedTurn?.rounds[1].content).toEqual([{ type: 'text', text: 'Used the backup.' }])
  expect(generatedTurn?.rounds[0].continuation?.data).toHaveLength(3)
  expect(failure).toHaveBeenCalledTimes(1)
  expect(backup).toHaveBeenCalledTimes(1)
})

// https://github.com/moeru-ai/airi/pull/2477
it('uses one request snapshot while tools load (PR #2477)', async () => {
  // ROOT CAUSE:
  //
  // Compatibility checks and generation each resolved provider configuration.
  // A settings change during tool loading could select another endpoint.
  // Derive compatibility and the request from the same initial configuration.
  let baseURL = 'https://original.test/v1/'
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    expect(String(url)).toBe('https://original.test/v1/chat/completions')
    const body = JSON.parse(String(init?.body))
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    return new Response('data: {"choices":[{"index":0,"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n', { headers: { 'content-type': 'text/event-stream' } })
  })
  const generation = vi.fn<GenerationProvider['generation']>(model => ({ protocol: 'chat-completions', config: { model, baseURL, fetch } }))
  await streamFrom({
    model: 'test',
    chatProvider: { generation },
    conversation: { turns: [{ type: 'user', id: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'image', url: 'https://example.test/image.png' }] }] },
    options: { contentArrayCompatibility: new Map([['https://original.test/v1/-test', false]]) },
    builtinToolsResolver: async () => {
      baseURL = 'https://changed.test/v1/'
      return []
    },
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(generation).toHaveBeenCalledTimes(1)
})

it('applies the new Chat model tool and content compatibility after a tool changes settings', async () => {
  // ROOT CAUSE:
  // The first model's compatibility decisions were reused by later xsAI tool steps.
  // A new model could receive tools and media arrays it had already rejected.
  const live = { model: 'first', baseURL: 'https://first.test/v1/' }
  const requests: Array<{ messages: Array<{ role: string, content?: unknown }>, tools?: unknown }> = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    const chunk = requests.length === 1
      ? { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'change-1', type: 'function', function: { name: 'change', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
      : { choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }] }
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const chatProvider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: live.baseURL, fetch } }),
  }
  const tool = {
    type: 'function' as const,
    function: { name: 'change', parameters: { type: 'object' as const, properties: {} } },
    execute: () => {
      live.model = 'second'
      live.baseURL = 'https://second.test/v1/'
      return 'changed'
    },
  }
  await streamFrom({
    model: live.model,
    chatProvider,
    conversation: { turns: [{ type: 'user', id: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image', url: 'https://example.test/image.png' }] }] },
    options: {
      toolsCompatibility: new Map([['https://second.test/v1/-second', false]]),
      contentArrayCompatibility: new Map([['https://second.test/v1/-second', false]]),
      resolveStep: async () => ({ model: live.model, chatProvider, providerId: 'live', systemPrompt: '', tools: [tool] }),
    },
  })
  expect(requests).toHaveLength(2)
  expect(requests[0].tools).toHaveLength(1)
  expect(Array.isArray(requests[0].messages[0].content)).toBe(true)
  expect(requests[1].tools).toBeUndefined()
  expect(requests[1].messages[0].content).toBe('Look')
})
