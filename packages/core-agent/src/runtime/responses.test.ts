import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { ItemParam } from '@xsai-ext/responses'
import type { Tool } from '@xsai/shared-chat'

import type { ConversationContext, ConversationTurn } from '../messages/types'

import { describe, expect, it, vi } from 'vitest'

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
    responses: model => ({ model, baseURL: 'https://example.test/v1/', fetch }),
  }
}

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
    const onTranscript = vi.fn()
    const onUsage = vi.fn()
    const onStreamEvent = vi.fn()
    await streamFrom({
      model: 'test',
      chatProvider: provider(fetch),
      context: { turns: [{ messages: [{ id: 'user', role: 'user', segments: [{ type: 'text', text: 'Weather?' }] }] }] },
      options: { tools: [tool], providerId: 'provider/test', onTranscript, onUsage, onStreamEvent },
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
    expect(onTranscript).toHaveBeenCalledWith(expect.objectContaining({
      continuation: { protocol: 'responses', scope: JSON.stringify(['provider/test', 'https://example.test/v1/', 'test', undefined]), data: [reasoning, call, { type: 'function_call_output', call_id: 'call_1', output: 'sunny', status: 'completed' }, answer] },
    }))
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 20, outputTokens: 10, totalTokens: 30, source: 'reported' })
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'reasoning-delta', text: 'Checking.' })
    expect(onStreamEvent).toHaveBeenLastCalledWith({ type: 'finish' })
  })

  it('maps image input and named function selection without chat wire fields', async () => {
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      expect(request.input).toEqual([{ type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,AA==', detail: 'low' }] }])
      expect(request.tool_choice).toEqual({ type: 'function', name: 'inspect' })
      expect(request.messages).toBeUndefined()
      return sse(completed([]))
    }
    await streamFrom({ model: 'test', chatProvider: provider(fetch), context: { turns: [{ messages: [{ id: 'user', role: 'user', segments: [{ type: 'image', url: 'data:image/png;base64,AA==', detail: 'low' }] }] }] }, options: { toolChoice: { type: 'function', function: { name: 'inspect' } } } })
  })

  it('does not persist a failed response', async () => {
    const onTranscript = vi.fn()
    await expect(streamFrom({
      model: 'test',
      chatProvider: provider(async () => sse([{ type: 'response.failed', response: { output: [], error: { message: 'provider failed' } } }])),
      context: { turns: [] },
      options: { onTranscript },
    })).rejects.toThrow('provider failed')
    expect(onTranscript).not.toHaveBeenCalled()
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
      context: { turns: [] },
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
  const onTranscript = vi.fn()
  await expect(streamFrom({
    model: 'test',
    chatProvider: provider(async () => {
      requestCount += 1
      return sse(completed([{ type: 'function_call', id: `fc_${requestCount}`, call_id: `call_${requestCount}`, name: 'repeat', arguments: '{}' }]))
    }),
    context: { turns: [] },
    options: {
      tools: [{ type: 'function', function: { name: 'repeat', parameters: { type: 'object', properties: {} } }, execute }],
      onTranscript,
    },
  })).rejects.toThrow('tool step limit')
  expect(requestCount).toBe(10)
  expect(execute).toHaveBeenCalledTimes(9)
  expect(onTranscript).not.toHaveBeenCalled()
})

it('projects structured context and media directly without Chat compatibility loss', async () => {
  // ROOT CAUSE:
  // The shared Chat sanitizer ran before protocol selection and discarded
  // media when supportsContentArray was false. Each adapter now projects
  // the original context and applies only its own wire constraints.
  const context: ConversationContext = { turns: [{ messages: [{
    id: 'input',
    role: 'user',
    segments: [
      { type: 'text', text: 'Inspect these.' },
      { type: 'image', url: 'https://example.test/image.png' },
      { type: 'file', url: 'https://example.test/report.pdf', name: 'report.pdf' },
      { type: 'domain-event', eventType: 'sensor', payload: { temperature: 21 } },
    ],
  }] }] }
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
  await streamFrom({ model: 'test', chatProvider: provider(fetch), context, options: { supportsContentArray: false } })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(context).toEqual(snapshot)
})

it('uses one context for Chat and Responses while keeping call and result order', async () => {
  const context: ConversationContext = { turns: [{ messages: [
    { id: 'event', role: 'event', segments: [{ type: 'domain-event', eventType: 'clock', payload: { hour: 12 } }] },
    { id: 'call', role: 'assistant', segments: [{ type: 'tool-call', callId: 'call-1', name: 'read', arguments: '{}' }] },
    { id: 'result', role: 'tool', segments: [{ type: 'tool-result', callId: 'call-1', content: [{ type: 'text', text: 'ok' }, { type: 'image', url: 'https://example.test/result.png' }] }] },
    { id: 'refusal', role: 'assistant', segments: [{ type: 'refusal', text: 'Cannot do that.' }] },
  ] }] }
  const snapshot = structuredClone(context)
  const requests: Record<string, unknown>[] = []
  const fetch: typeof globalThis.fetch = async (url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    if (String(url).endsWith('/responses'))
      return sse(completed([]))
    return sse([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }])
  }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), context })
  await streamFrom({ model: 'test', chatProvider: { chat: model => ({ model, baseURL: 'https://example.test/v1/', fetch }) }, context })
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
  let transcript: ConversationTurn | undefined
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return sse(completed(native))
  }
  const options = { providerId: 'provider-1', requestCorrelation: { conversationId: 'session-1', roundId: 'round-1' } }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), context: { turns: [] }, options: { ...options, onTranscript: (turn) => {
    transcript = turn
  } } })
  expect(transcript).toBeDefined()
  if (!transcript)
    throw new Error('Expected a completed transcript')
  const context = { turns: [structuredClone(transcript)] }
  await streamFrom({ model: 'test', chatProvider: provider(fetch), context, options: { ...options, requestCorrelation: { ...options.requestCorrelation, roundId: 'round-2' } } })
  expect(requests[1].input).toEqual(native)
  for (const change of [
    { model: 'different', chatProvider: provider(fetch), options },
    { model: 'test', chatProvider: provider(fetch), options: { ...options, providerId: 'provider-2' } },
    { model: 'test', chatProvider: provider(fetch), options: { ...options, requestCorrelation: { conversationId: 'session-2', roundId: 'round-1' } } },
    { model: 'test', chatProvider: { responses: (model: string) => ({ model, baseURL: 'https://another.test/v1/' as const, fetch }) }, options },
  ]) {
    await streamFrom({ ...change, context })
    expect(requests.at(-1)?.input).toEqual([{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] }])
  }
})

it('rejects malformed persisted continuation before sending a request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  const context: ConversationContext = { turns: [{
    messages: [],
    continuation: { protocol: 'responses', scope: JSON.stringify([undefined, 'https://example.test/v1/', 'test', undefined]), data: [{ type: 'function_call', call_id: 'missing-arguments' }] },
  }] }
  await expect(streamFrom({ model: 'test', chatProvider: provider(fetch), context })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
