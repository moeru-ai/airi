import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { ItemParam } from '@xsai-ext/responses'
import type { Tool } from '@xsai/shared-chat'

import type { AssistantTurn, Conversation } from '../messages/types'

import { getDefinedProvider } from '@proj-airi/provider-inference'
import { describe, expect, it, vi } from 'vitest'

import { readTurns } from '../messages/turns'
import { streamFrom } from './llm-service'

function sse(events: unknown[]) {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
}

function completed(output: ItemParam[]) {
  return [
    ...output.map(item => ({ type: 'response.output_item.done', item })),
    { type: 'response.completed', response: { output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
  ]
}

function provider(fetch: typeof globalThis.fetch): GenerationProvider {
  return {
    generation: model => ({ protocol: 'responses', webSearch: false, config: { model, baseURL: 'https://example.test/v1/', fetch } }),
  }
}

// https://github.com/moeru-ai/airi/pull/2477#discussion_r4005498788
// https://github.com/moeru-ai/airi/pull/2477#discussion_r4005940671
it.each([
  { name: 'void', result: undefined, output: '' },
  { name: 'empty array', result: [], output: '[]' },
])('serializes $name tool results before the next request (PR #2477)', async ({ result, output }) => {
  // ROOT CAUSE:
  // JSON.stringify omits undefined, and every accepts empty arrays as content parts.
  // Both cases need a string output so a valid tool execution can continue.
  // A plugin can return no value at runtime despite the SDK's narrower declaration.
  const execute = vi.fn<NonNullable<Tool['execute']>>()
  if (result !== undefined)
    execute.mockReturnValue(result)
  const requests: { input: ItemParam[] }[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse(completed(requests.length === 1 ? [{ type: 'function_call', call_id: 'read', name: 'read', arguments: '{}' }] : []))
  }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] }, options: {
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object', properties: {} } }, execute }],
  } })
  expect(requests).toHaveLength(2)
  expect(requests[1].input.at(-1)).toEqual({ type: 'function_call_output', call_id: 'read', output, status: 'completed' })
})

// https://github.com/moeru-ai/airi/pull/2477#discussion_r4005498799
it.each(['explicit', 'compatibility'] as const)('disables hosted search under the %s tool policy (PR #2477)', async (policy) => {
  // ROOT CAUSE:
  // The runtime removed local tools but forwarded hosted search unchanged.
  // The resolved tool policy must govern both kinds of tools.
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('tools')
    return sse(completed([]))
  })
  const chatProvider: GenerationProvider = {
    generation: model => ({ protocol: 'responses', webSearch: true, config: { model, baseURL: 'https://example.test/v1/', fetch } }),
  }
  await streamFrom({ model: 'test', chatProvider, conversation: { turns: [] }, options: policy === 'explicit'
    ? { supportsTools: false }
    : { toolsCompatibility: new Map([['responses:https://example.test/v1/-test', false]]) } })
  expect(fetch).toHaveBeenCalledTimes(1)
})

describe('responses generation', () => {
  it('executes functions and preserves ordered native Items and aggregate usage', async () => {
    const reasoning: ItemParam = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' }
    const call: ItemParam = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'weather', arguments: '{}' }
    const answer: ItemParam = { type: 'message', role: 'assistant', id: 'msg_1', content: [{ type: 'output_text', text: 'Sunny.', annotations: [] }], phase: 'final_answer' }
    const requests: unknown[] = []
    const fetch: typeof globalThis.fetch = async (url, init) => {
      expect(String(url)).toBe('https://example.test/v1/responses')
      requests.push(JSON.parse(String(init?.body)))
      return requests.length === 1
        ? sse([{ type: 'response.reasoning_summary_text.delta', delta: 'Checking.' }, ...completed([reasoning, call])])
        : sse([{ type: 'response.output_text.delta', delta: 'Sunny.' }, ...completed([answer])])
    }
    const execute = vi.fn(() => 'sunny')
    const tool: Tool = { type: 'function', function: { name: 'weather', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } }, execute }
    const onGeneratedTurn = vi.fn()
    const onUsage = vi.fn()
    const onStreamEvent = vi.fn()
    await streamFrom({
      model: 'test',
      chatProvider: provider(fetch),
      conversation: { turns: readTurns([{ id: 'user', role: 'user', segments: [{ type: 'text', text: 'Weather?' }] }]) },
      options: { tools: [tool], providerId: 'provider/test', onGeneratedTurn, onUsage, onStreamEvent },
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({
      store: false,
      input: [
        { type: 'message', role: 'user', content: 'Weather?' },
        reasoning,
        call,
        { type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
      ],
    })
    const generatedTurn: AssistantTurn = onGeneratedTurn.mock.calls[0][0]
    expect(generatedTurn.rounds).toHaveLength(2)
    expect(generatedTurn.rounds[0].continuation?.data).toEqual([reasoning, call, { type: 'function_call_output', call_id: 'call_1', output: 'sunny', status: 'completed' }])
    expect(generatedTurn.rounds[1].continuation?.data).toEqual([answer])
    expect(generatedTurn.rounds[0].toolInvocations[0]).toMatchObject({ callId: 'call_1', execution: { status: 'succeeded', output: [{ type: 'text', text: 'sunny' }] } })
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 20, outputTokens: 10, totalTokens: 30, source: 'reported' })
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'reasoning-delta', text: 'Checking.' })
    expect(onStreamEvent).toHaveBeenLastCalledWith({ type: 'finish' })
  })

  // https://github.com/moeru-ai/airi/pull/2477#discussion_r3950632651
  it('issue #2477 serializes JSON tool results for the next Responses step', async () => {
    const requests: unknown[] = []
    const call: ItemParam = { type: 'function_call', call_id: 'json-call', name: 'lookup', arguments: '{}' }
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return sse(completed(requests.length === 1 ? [call] : []))
    }
    await streamFrom({
      model: 'test',
      chatProvider: provider(fetch),
      conversation: { turns: [] },
      options: { tools: [{ type: 'function', function: { name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: {} } }, execute: async () => ({ found: true }) }] },
    })
    expect(requests[1]).toMatchObject({ input: [call, { type: 'function_call_output', output: '{"found":true}' }] })
  })

  it('maps image input and named function selection without chat wire fields', async () => {
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      expect(request.input).toEqual([{ type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,AA==', detail: 'low' }] }])
      expect(request.tool_choice).toEqual({ type: 'function', name: 'inspect' })
      expect(request.messages).toBeUndefined()
      return sse(completed([]))
    }
    await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: readTurns([{ id: 'user', role: 'user', segments: [{ type: 'image', url: 'data:image/png;base64,AA==', detail: 'low' }] }]) }, options: { toolChoice: { type: 'function', function: { name: 'inspect' } } } })
  })

  it('does not persist a failed response', async () => {
    const onGeneratedTurn = vi.fn()
    await expect(streamFrom({
      model: 'test',
      chatProvider: provider(async () => sse([{ type: 'response.failed', response: { output: [], error: { message: 'provider failed' } } }])),
      conversation: { turns: [] },
      options: { onGeneratedTurn },
    })).rejects.toThrow('provider failed')
    expect(onGeneratedTurn).not.toHaveBeenCalled()
  })

  it('cancels an active reader on abort', async () => {
    const abort = new AbortController()
    const cancelled = vi.fn()
    const fetch: typeof globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"hello"}\n\n'))
      },
      cancel: cancelled,
    }))
    await expect(streamFrom({
      model: 'test',
      chatProvider: provider(fetch),
      conversation: { turns: [] },
      options: {
        abortSignal: abort.signal,
        onStreamEvent: (event) => {
          if (event.type === 'text-delta')
            abort.abort(new Error('cancelled'))
        },
      },
    })).rejects.toThrow('cancelled')
    expect(cancelled).toHaveBeenCalledTimes(1)
  })
})

it('fails instead of storing an unanswered function call at the step limit', async () => {
  let requestCount = 0
  const execute = vi.fn(() => 'done')
  const onGeneratedTurn = vi.fn()
  await expect(streamFrom({
    model: 'test',
    chatProvider: provider(async () => {
      requestCount += 1
      return sse(completed([{ type: 'function_call', id: `fc_${requestCount}`, call_id: `call_${requestCount}`, name: 'repeat', arguments: '{}' }]))
    }),
    conversation: { turns: [] },
    options: {
      tools: [{ type: 'function', function: { name: 'repeat', parameters: { type: 'object', properties: {} } }, execute }],
      onGeneratedTurn,
    },
  })).rejects.toThrow('tool step limit')
  expect(requestCount).toBe(10)
  expect(execute).toHaveBeenCalledTimes(9)
  expect(onGeneratedTurn).not.toHaveBeenCalled()
})

it('projects structured context and media directly without Chat compatibility loss', async () => {
  // ROOT CAUSE:
  // The shared Chat sanitizer ran before protocol selection and discarded
  // media when supportsContentArray was false. Each adapter now projects
  // the original context and applies only its own wire constraints.
  const context: Conversation = { turns: readTurns([{
    id: 'input',
    role: 'user',
    segments: [
      { type: 'text', text: 'Inspect these.' },
      { type: 'image', url: 'https://example.test/image.png' },
      { type: 'file', url: 'https://example.test/report.pdf', name: 'report.pdf' },
      { type: 'domain-event', eventType: 'sensor', payload: { temperature: 21 } },
    ],
  }]) }
  const snapshot = structuredClone(context)
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body))
    expect(request.input[0].content).toEqual([
      { type: 'input_text', text: 'Inspect these.' },
      { type: 'input_image', image_url: 'https://example.test/image.png' },
      { type: 'input_file', file_url: 'https://example.test/report.pdf', filename: 'report.pdf' },
      { type: 'input_text', text: 'Domain event: sensor\n{\n  "temperature": 21\n}' },
    ])
    expect(request.messages).toBeUndefined()
    return sse(completed([]))
  })
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: context, options: { supportsContentArray: false } })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(context).toEqual(snapshot)
})

it('uses one context for Chat and Responses while keeping call and result order', async () => {
  const context: Conversation = { turns: readTurns([
    { id: 'event', role: 'event', segments: [{ type: 'domain-event', eventType: 'clock', payload: { hour: 12 } }] },
    { id: 'call', role: 'assistant', segments: [{ type: 'tool-call', callId: 'call-1', name: 'read', arguments: '{}' }] },
    { id: 'result', role: 'tool', segments: [{ type: 'tool-result', callId: 'call-1', content: [{ type: 'text', text: 'ok' }, { type: 'image', url: 'https://example.test/result.png' }] }] },
    { id: 'refusal', role: 'assistant', segments: [{ type: 'refusal', text: 'Cannot do that.' }] },
  ]) }
  const snapshot = structuredClone(context)
  const requests: Record<string, unknown>[] = []
  const fetch: typeof globalThis.fetch = async (url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    if (String(url).endsWith('/responses'))
      return sse(completed([]))
    return sse([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }])
  }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: context })
  await streamFrom({ model: 'test', chatProvider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch } }) }, conversation: context })
  expect(requests[0].input).toEqual([
    { type: 'message', role: 'user', content: 'Domain event: clock\n{\n  "hour": 12\n}' },
    { type: 'function_call', call_id: 'call-1', name: 'read', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call-1', output: [{ type: 'input_text', text: 'ok' }, { type: 'input_image', image_url: 'https://example.test/result.png' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Cannot do that.' }] },
  ])
  expect(requests[1].messages).toEqual([
    { role: 'user', content: 'Domain event: clock\n{\n  "hour": 12\n}' },
    { role: 'assistant', content: '', tool_calls: [{ type: 'function', id: 'call-1', function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: [{ type: 'text', text: 'ok' }, { type: 'image_url', image_url: { url: 'https://example.test/result.png' } }] },
    { role: 'assistant', content: [{ type: 'refusal', refusal: 'Cannot do that.' }] },
  ])
  expect(context).toEqual(snapshot)
})

it('replays native state only for the same provider, endpoint, model and conversation', async () => {
  const native: ItemParam[] = [
    { type: 'reasoning', id: 'rs-1', summary: [], encrypted_content: 'opaque' },
    { type: 'message', role: 'assistant', phase: 'final_answer', content: 'answer' },
  ]
  const requests: { input: ItemParam[] }[] = []
  let generatedTurn: AssistantTurn | undefined
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse(completed(native))
  }
  const options = { providerId: 'provider-1', requestCorrelation: { conversationId: 'session-1', turnId: 'round-1' } }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] }, options: { ...options, onGeneratedTurn: (turn) => {
    generatedTurn = turn
  } } })
  expect(generatedTurn).toBeDefined()
  if (!generatedTurn)
    throw new Error('Expected a completed generated turn')
  const context = { turns: [structuredClone(generatedTurn)] }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: context, options: { ...options, requestCorrelation: { ...options.requestCorrelation, turnId: 'round-2' } } })
  expect(requests[1].input).toEqual(native)
  for (const change of [
    { model: 'different', chatProvider: provider(fetch), options },
    { model: 'test', chatProvider: provider(fetch), options: { ...options, providerId: 'provider-2' } },
    { model: 'test', chatProvider: provider(fetch), options: { ...options, requestCorrelation: { conversationId: 'session-2', turnId: 'round-1' } } },
    { model: 'test', chatProvider: { generation: (model: string) => ({ protocol: 'responses' as const, webSearch: false, config: { model, baseURL: 'https://another.test/v1/', fetch } }) }, options },
  ]) {
    await streamFrom({ ...change, conversation: context })
    expect(requests.at(-1)?.input).toEqual([{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] }])
  }
})

// https://github.com/moeru-ai/airi/pull/2477
it('replays unknown provider items without filtering their fields through a partial schema', async () => {
  // ROOT CAUSE:
  // A local union rejected new native tools before the provider could receive its own state.
  // Preserve SDK output unchanged inside the matching provider scope.
  const native = { type: 'future_native_tool', id: 'native-1', status: 'provider-status', payload: { opaque: ['state'] } }
  const answer: ItemParam = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] }
  const requests: unknown[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse([
      { type: 'response.output_item.done', item: native },
      ...completed([answer]),
    ])
  }
  const context: Conversation = { turns: [] }
  await streamFrom({
    model: 'test',
    chatProvider: provider(fetch),
    conversation: context,
    options: { onGeneratedTurn: (turn) => {
      context.turns.push(turn)
    } },
  })
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: context })
  expect(requests[1]).toMatchObject({ input: [native, answer] })
  await expect(streamFrom({ model: 'different', chatProvider: provider(fetch), conversation: context })).rejects.toThrow('cannot be projected')
  expect(requests).toHaveLength(2)
})

it.each(['openai', 'openai-compatible'] as const)('sends %s BYOK requests directly without the AIRI backend', async (id) => {
  const definition = getDefinedProvider(id)!
  const instance = await definition.createProvider({
    api: 'responses',
    apiKey: 'test-user-key',
    baseUrl: 'https://byok.example/v1/',
  })
  if (!('generation' in instance))
    throw new Error('Expected a Responses provider')
  const answer: ItemParam = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello.' }] }
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(String(url)).toBe('https://byok.example/v1/responses')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-user-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'byok-model',
      store: false,
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
    })
    return sse(completed([answer]))
  })
  try {
    await streamFrom({
      model: 'byok-model',
      chatProvider: instance,
      conversation: { turns: readTurns([{ id: 'user', role: 'user', segments: [{ type: 'text', text: 'Hello' }] }]) },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
  finally {
    fetchMock.mockRestore()
  }
})

it('runs hosted search and local tools together, then replays native search Items', async () => {
  const search: ItemParam = { type: 'web_search_call', id: 'search-1', status: 'completed', action: { type: 'search', queries: ['weather'] } }
  const call: ItemParam = { type: 'function_call', call_id: 'local-1', name: 'local', arguments: '{}' }
  const answer: ItemParam = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Sunny.', annotations: [{ type: 'url_citation', url: 'https://weather.example/report', title: 'Weather report', start_index: 0, end_index: 6 }] }] }
  const requests: { input: ItemParam[], tools: unknown[] }[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse(completed(requests.length === 1 ? [search, call] : [answer]))
  }
  const nativeProvider: GenerationProvider = { generation: model => ({ protocol: 'responses', webSearch: true, config: { model, baseURL: 'https://example.test/v1/', fetch } }) }
  const onStreamEvent = vi.fn()
  const execute = vi.fn(async () => 'ok')
  let generatedTurn: AssistantTurn | undefined
  await streamFrom({
    model: 'test',
    chatProvider: nativeProvider,
    conversation: { turns: [] },
    options: {
      onStreamEvent,
      onGeneratedTurn: (turn) => {
        generatedTurn = turn
      },
      tools: [{ type: 'function', function: { name: 'local', description: 'Local tool', parameters: { type: 'object', properties: {} } }, execute }],
    },
  })
  expect(execute).toHaveBeenCalledOnce()
  expect(requests[0].tools).toContainEqual({ type: 'web_search' })
  expect(requests[0].tools).toContainEqual(expect.objectContaining({ type: 'function', name: 'local' }))
  expect(requests[1].input).toEqual([search, call, { type: 'function_call_output', call_id: 'local-1', output: 'ok', status: 'completed' }])
  expect(onStreamEvent).toHaveBeenCalledWith({ type: 'search', id: 'search-1', status: 'completed' })
  expect(onStreamEvent).toHaveBeenCalledWith({ type: 'citations', citations: [{ url: 'https://weather.example/report', title: 'Weather report', startIndex: 0, endIndex: 6 }] })
  if (!generatedTurn)
    throw new Error('Expected settled generated turn')
  expect(generatedTurn.rounds.at(-1)?.content[0]).toMatchObject({ type: 'text', text: 'Sunny.', citations: [{ title: 'Weather report' }] })
  await streamFrom({ model: 'test', chatProvider: nativeProvider, conversation: { turns: [structuredClone(generatedTurn)] } })
  expect(requests[2].input).toEqual([...requests[1].input, answer])
})

it('does not send hosted search when disabled', async () => {
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    expect(JSON.parse(String(init?.body)).tools).toBeUndefined()
    return sse(completed([]))
  }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] } })
})

// https://github.com/moeru-ai/airi/pull/2200
it('preserves sampling controls when routing through either protocol adapter', async () => {
  // ROOT CAUSE:
  // Main added sampling options to the old streamText call. Keeping only the
  // protocol dispatch during the merge would drop them from both wire requests.
  const requests: unknown[] = []
  const fetch: typeof globalThis.fetch = async (url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return String(url).endsWith('/responses')
      ? sse(completed([]))
      : sse([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }])
  }
  const context: Conversation = { turns: [] }
  const options = { temperature: 0, topP: 0.8 }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: context, options })
  await streamFrom({ model: 'test', chatProvider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch } }) }, conversation: context, options })
  expect(requests).toHaveLength(2)
  expect(requests[0]).toMatchObject({ temperature: 0, top_p: 0.8 })
  expect(requests[1]).toMatchObject({ temperature: 0, top_p: 0.8 })
})

// https://github.com/moeru-ai/airi/pull/2477
it('groups parallel tool calls in one round and keeps repeated calls in later rounds distinct', async () => {
  const gate = Promise.withResolvers<void>()
  const started: string[] = []
  const execute = vi.fn<Tool['execute']>(async (input) => {
    if (typeof input !== 'object' || input === null || !('city' in input) || typeof input.city !== 'string')
      throw new Error('Expected a city')
    const city = input.city
    started.push(city)
    if (started.length === 2)
      gate.resolve()
    await gate.promise
    return `${city}: sunny`
  })
  const call = (id: string, city: string): ItemParam => ({ type: 'function_call', call_id: id, name: 'weather', arguments: JSON.stringify({ city }) })
  const requests: unknown[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    if (requests.length === 1)
      return sse(completed([call('a', 'Paris'), call('b', 'Tokyo')]))
    if (requests.length === 2)
      return sse(completed([call('c', 'London')]))
    return sse(completed([{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'All sunny.' }] }]))
  }
  let generatedTurn: AssistantTurn | undefined
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] }, options: {
    requestCorrelation: { conversationId: 'conversation', turnId: 'turn', runId: 'run' },
    tools: [{ type: 'function', function: { name: 'weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }, execute }],
    onGeneratedTurn: (turn) => { generatedTurn = turn },
  } })
  expect(generatedTurn?.id).toBe('turn')
  expect(generatedTurn?.runId).toBe('run')
  expect(generatedTurn?.rounds.map(round => round.toolInvocations.length)).toEqual([2, 1, 0])
  expect(generatedTurn?.rounds[0].toolInvocations.map(call => call.execution)).toEqual([
    { status: 'succeeded', output: [{ type: 'text', text: 'Paris: sunny' }] },
    { status: 'succeeded', output: [{ type: 'text', text: 'Tokyo: sunny' }] },
  ])
  expect(new Set(generatedTurn?.rounds.flatMap(round => round.toolInvocations.map(call => call.id))).size).toBe(3)
  expect(execute).toHaveBeenCalledTimes(3)
})

// https://github.com/moeru-ai/airi/pull/2477
it('preserves readable content and raw items when another item cannot be projected', async () => {
  const unknown = { type: 'message', role: 'assistant', content: [{ type: 'future_content', payload: 'opaque' }] }
  const answer = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Visible answer' }] }
  const requests: { input: unknown[] }[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse([
      { type: 'response.output_item.done', item: unknown },
      { type: 'response.output_item.done', item: answer },
      { type: 'response.completed', response: { output: [unknown, answer] } },
    ])
  }
  const conversation: Conversation = { turns: [] }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation, options: { onGeneratedTurn: (turn) => {
    conversation.turns.push(turn)
  } } })
  const turn = conversation.turns[0]
  if (turn.type !== 'assistant')
    throw new Error('Expected assistant turn')
  expect(turn.rounds[0].content).toEqual([{ type: 'text', text: 'Visible answer', citations: undefined }])
  expect(turn.rounds[0].projectionIssues).toEqual(['Unsupported Responses assistant content'])
  expect(turn.rounds[0].continuation?.data).toEqual([unknown, answer])
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation })
  expect(requests[1].input).toEqual([unknown, answer])
  await expect(streamFrom({ model: 'different', chatProvider: provider(fetch), conversation })).rejects.toThrow('cannot be projected')
  expect(requests).toHaveLength(2)
})

// https://github.com/moeru-ai/airi/pull/2477
it.each(['chat-completions', 'responses'] as const)('overrides headers without duplicate credentials for %s', async (protocol) => {
  // ROOT CAUSE:
  // Object spread treats header casing as distinct, and the SDK also adds Authorization.
  // Merge every source through Headers before handing the request to the SDK.
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer override')
    expect(headers.get('x-custom')).toBe('new')
    return protocol === 'responses' ? sse(completed([])) : sse([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }])
  }
  const chatProvider: GenerationProvider = { generation: model => ({
    protocol,
    webSearch: false,
    config: { model, apiKey: 'sdk-key', baseURL: 'https://example.test/v1/', headers: { 'authorization': 'Bearer configured', 'X-Custom': 'old' }, fetch },
  }) }
  await streamFrom({ model: 'test', chatProvider, conversation: { turns: [] }, options: { headers: { 'Authorization': 'Bearer override', 'x-custom': 'new' } } })
})

// https://github.com/moeru-ai/airi/pull/2477
it('keeps native history when only request credentials change (PR #2477)', async () => {
  // ROOT CAUSE:
  // Credential hashing required Web Crypto even for ordinary HTTP-origin chats.
  // Scope now depends only on provider identity, endpoint, model and conversation.
  const requests: { input: ItemParam[] }[] = []
  let apiKey = 'first-account-key'
  const reasoning: ItemParam = { type: 'reasoning', id: 'reasoning', summary: [], encrypted_content: 'private-state' }
  const answer: ItemParam = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] }
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse(completed([reasoning, answer]))
  }
  const chatProvider: GenerationProvider = { generation: model => ({ protocol: 'responses', webSearch: false, config: { model, apiKey, baseURL: 'https://example.test/v1/', fetch } }) }
  const conversation: Conversation = { turns: [] }
  await streamFrom({ model: 'test', chatProvider, conversation, options: { onGeneratedTurn: (turn) => {
    conversation.turns.push(turn)
  } } })
  await streamFrom({ model: 'test', chatProvider, conversation, options: { headers: { 'x-airi-round-id': 'next-round' } } })
  expect(requests[1].input).toEqual([reasoning, answer])
  apiKey = 'second-account-key'
  await streamFrom({ model: 'test', chatProvider, conversation })
  expect(requests[2].input).toEqual([reasoning, answer])
  expect(JSON.stringify(conversation)).not.toContain('first-account-key')
})

// https://github.com/moeru-ai/airi/pull/2477#discussion_r3964857174
// ROOT CAUSE:
//
// Shared Chat tool results used to become JSON text on the Responses wire.
// Images and files must become input parts while tool events retain the original result.
it('translates Chat tool content arrays without changing tool events (PR #2477)', async () => {
  const output = [{ type: 'text', text: 'image' }, { type: 'image_url', image_url: { url: 'https://example.test/image.png', detail: 'low' } }, { type: 'file', file: { file_data: 'data:application/pdf;base64,AA==', filename: 'report.pdf' } }]
  const requests: { input: ItemParam[] }[] = []
  const events: unknown[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse(completed(requests.length === 1 ? [{ type: 'function_call', call_id: 'read', name: 'read', arguments: '{}' }] : []))
  }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] }, options: {
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object', properties: {} } }, execute: () => output }],
    onStreamEvent: (event) => { events.push(event) },
  } })
  expect(requests[1].input.at(-1)).toEqual({ type: 'function_call_output', call_id: 'read', status: 'completed', output: [
    { type: 'input_text', text: 'image' },
    { type: 'input_image', image_url: 'https://example.test/image.png', detail: 'low' },
    { type: 'input_file', file_data: 'data:application/pdf;base64,AA==', filename: 'report.pdf' },
  ] })
  expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', result: output }))
})

// https://github.com/moeru-ai/airi/pull/2477#discussion_r3959733235
it('groups parallel Responses tool calls in one assistant message after a protocol change (PR #2477)', async () => {
  const calls: ItemParam[] = ['first', 'second'].map(call_id => ({ type: 'function_call', call_id, name: 'read', arguments: '{}' }))
  let requests = 0
  const conversation: Conversation = { turns: [] }
  await streamFrom({ model: 'test', chatProvider: provider(async () => sse(completed(++requests === 1 ? calls : []))), conversation, options: {
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object', properties: {} } }, execute: () => 'done' }],
    onGeneratedTurn: (turn) => { conversation.turns.push(turn) },
  } })
  const chatFetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body))
    expect(request.messages.map((message: { role: string }) => message.role)).toEqual(['assistant', 'tool', 'tool'])
    expect(request.messages[0].tool_calls.map((call: { id: string }) => call.id)).toEqual(['first', 'second'])
    expect(request.messages.slice(1).map((message: { tool_call_id: string }) => message.tool_call_id)).toEqual(['first', 'second'])
    return sse([{ choices: [{ index: 0, delta: { content: 'done' }, finish_reason: 'stop' }] }])
  })
  await streamFrom({ model: 'test', conversation, chatProvider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch: chatFetch } }) } })
  expect(chatFetch).toHaveBeenCalledTimes(1)
})

// https://github.com/moeru-ai/airi/pull/2477#discussion_r3964857174
it('preserves native tool parts and serializes ordinary JSON arrays (PR #2477)', async () => {
  for (const output of [[{ type: 'input_image', image_url: 'https://example.test/image.png' }], [{ name: 'first' }]]) {
    const requests: { input: ItemParam[] }[] = []
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return sse(completed(requests.length === 1 ? [{ type: 'function_call', call_id: 'read', name: 'read', arguments: '{}' }] : []))
    }
    await streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] }, options: {
      tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object', properties: {} } }, execute: () => output }],
    } })
    expect(requests[1].input.at(-1)).toMatchObject({ output: 'type' in output[0] ? output : JSON.stringify(output) })
  }
})

// https://github.com/moeru-ai/airi/pull/2477#discussion_r3964857174
it('rejects unsupported audio tool content before sending another request (PR #2477)', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => sse(completed([
    { type: 'function_call', call_id: 'read', name: 'read', arguments: '{}' },
  ])))
  await expect(streamFrom({ model: 'test', chatProvider: provider(fetch), conversation: { turns: [] }, options: {
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object', properties: {} } }, execute: () => [{ type: 'input_audio', input_audio: { data: 'AA==', format: 'wav' } }] }],
  } })).rejects.toThrow('Responses function output does not support Chat audio content')
  expect(fetch).toHaveBeenCalledTimes(1)
})
