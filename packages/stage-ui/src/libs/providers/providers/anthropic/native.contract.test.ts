import type { Tool } from '@xsai/shared-chat'

import { generateText } from '@xsai/generate-text'
import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'
import { describe, expect, it, vi } from 'vitest'

import { createNativeAnthropicFetch } from './native'

/**
 * Consumer-contract tests: the REAL xsai pipeline (streamText / generateText,
 * exactly what `stores/llm.ts` and the provider validators run) is driven
 * through the adapter, with only the Anthropic upstream stubbed. This locks
 * the two boundaries a unit test cannot: xsai must be able to parse the
 * translated stream, and the OpenAI-shaped history xsai builds between tool
 * rounds must translate back into a valid Messages request.
 */

const BASE_URL = 'https://api.anthropic.com/v1/'

function sseResponse(frames: string[]): Response {
  return new Response(frames.join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const textRoundFrames = [
  'data: {"type":"message_start","message":{"id":"msg_text","model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":9}}}\n\n',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}\n\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"let me think"}}\n\n',
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"lo"}}\n\n',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
  'data: {"type":"message_stop"}\n\n',
]

const toolRoundFrames = [
  'data: {"type":"message_start","message":{"id":"msg_tool","model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":20}}}\n\n',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_w1","name":"get_weather"}}\n\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"Tokyo\\"}"}}\n\n',
  'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":6}}\n\n',
  'data: {"type":"message_stop"}\n\n',
]

describe('xsai consumer contract', () => {
  it('streamText consumes a translated text stream: text, reasoning, finish usage', async () => {
    const baseFetch = vi.fn().mockResolvedValueOnce(sseResponse(textRoundFrames))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'sk-ant-test', fetch: baseFetch })

    const events: Array<Record<string, unknown>> = []
    const result = streamText({
      apiKey: 'sk-ant-test',
      baseURL: BASE_URL,
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'hi' }],
      fetch: nativeFetch,
      streamOptions: { includeUsage: true },
      onEvent: event => void events.push(event as Record<string, unknown>),
    })

    const steps = await result.steps
    expect(steps).toHaveLength(1)
    expect(steps[0].text).toBe('Hello')
    expect(steps[0].finishReason).toBe('stop')
    expect(steps[0].usage).toEqual({ prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 })

    // Thinking deltas surface on xsai's native reasoning channel.
    expect(events.some(event => event.type === 'reasoning-delta' && event.text === 'let me think')).toBe(true)

    const messages = await result.messages
    const assistantTurn = messages[messages.length - 1]
    expect(assistantTurn.role).toBe('assistant')
    expect(assistantTurn.content).toBe('Hello')
  })

  it('streamText drives a full tool loop through both translation directions', async () => {
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(sseResponse(toolRoundFrames))
      .mockResolvedValueOnce(sseResponse([
        'data: {"type":"message_start","message":{"id":"msg_final","model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":30}}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Sunny in Tokyo."}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'sk-ant-test', fetch: baseFetch })

    const execute = vi.fn(async (input: { city: string }) => `Sunny in ${input.city}`)
    const weatherTool = {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the weather for a city.',
        parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false },
      },
      execute,
    } as unknown as Tool

    const result = streamText({
      apiKey: 'sk-ant-test',
      baseURL: BASE_URL,
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'weather in Tokyo?' }],
      fetch: nativeFetch,
      tools: [weatherTool],
      // Mirrors stores/llm.ts (streamFrom), which allows multi-step tool rounds.
      stopWhen: stepCountAtLeast(10),
      streamOptions: { includeUsage: true },
    })

    const steps = await result.steps
    expect(execute).toHaveBeenCalledWith({ city: 'Tokyo' }, expect.objectContaining({ toolCallId: 'toolu_w1' }))
    expect(steps[steps.length - 1].text).toBe('Sunny in Tokyo.')

    // Round 2 is built from the OpenAI-shaped history xsai accumulated — the
    // adapter must translate it back into paired tool_use / tool_result
    // blocks the Messages API accepts.
    expect(baseFetch).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(String((baseFetch.mock.calls[1] as [string, RequestInit])[1].body)) as Record<string, any>
    expect(secondBody.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'weather in Tokyo?' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_w1', name: 'get_weather', input: { city: 'Tokyo' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_w1', content: 'Sunny in Tokyo' }] },
    ])
    expect(secondBody.tools).toHaveLength(1)
    // claude-sonnet-4-5 is not adaptive-thinking-default: the field must be absent.
    expect(secondBody.thinking).toBeUndefined()
    // xsai's runtime-only fields must never leak into the native body.
    expect(secondBody.stream_options).toBeUndefined()
    expect(secondBody.stop_when).toBeUndefined()
  })

  it('streamText surfaces upstream HTTP errors with the Anthropic error payload', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      { status: 401 },
    ))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'bad', fetch: baseFetch })

    const result = streamText({
      apiKey: 'bad',
      baseURL: BASE_URL,
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'hi' }],
      fetch: nativeFetch,
    })

    await expect(result.steps).rejects.toThrow(/401[\s\S]*invalid x-api-key/)
    // streamText rejects every deferred on failure; consume them the way
    // stores/llm.ts does, or they surface as unhandled rejections.
    await expect(result.messages).rejects.toThrow()
    await expect(result.usage).rejects.toThrow()
    await expect(result.totalUsage).rejects.toThrow()
  })

  it('generateText (the provider validators path) completes non-streaming', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_ping',
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'pong' }],
      usage: { input_tokens: 3, output_tokens: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'sk-ant-test', fetch: baseFetch })

    // Mirrors createOpenAICompatibleValidators' connectivity check, including
    // its max_tokens: 1 — the Messages API requires the field, so the check
    // only works if the adapter forwards it.
    const { text } = await generateText({
      apiKey: 'sk-ant-test',
      baseURL: BASE_URL,
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: 'ping' }],
      fetch: nativeFetch,
      max_tokens: 1,
    } as Parameters<typeof generateText>[0])

    expect(text).toBe('pong')
    const sent = JSON.parse(String((baseFetch.mock.calls[0] as [string, RequestInit])[1].body)) as Record<string, any>
    expect(sent.max_tokens).toBe(1)
    expect((baseFetch.mock.calls[0] as [string])[0]).toBe('https://api.anthropic.com/v1/messages')
  })
})
