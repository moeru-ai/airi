import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNativeAnthropicFetch } from './native'

interface ChatChunkToolCall {
  index?: number
  id?: string
  type?: string
  function?: { name?: string, arguments?: string }
}

interface ChatChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { role?: string, content?: string, reasoning_content?: string, tool_calls?: ChatChunkToolCall[] }
    finish_reason: string | null
  }>
  usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
  error?: unknown
}

const CHAT_URL = 'https://api.anthropic.com/v1/chat/completions'

function jsonResponse(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), { status, headers })
}

/**
 * Drives the public fetch surface with a stubbed upstream and captures what
 * was actually POSTed to the Messages endpoint.
 */
async function capture(requestBody: Record<string, unknown>, upstream?: Response) {
  const baseFetch = vi.fn().mockResolvedValue(upstream ?? jsonResponse({ content: [], stop_reason: 'end_turn' }))
  const nativeFetch = createNativeAnthropicFetch({ apiKey: 'sk-ant-test', fetch: baseFetch })
  const response = await nativeFetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-ant-test' },
    body: JSON.stringify(requestBody),
  })
  const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
  return { response, url, init, sent: JSON.parse(String(init.body)) as Record<string, any>, baseFetch }
}

/** Streams Anthropic SSE slices through the adapter and returns the translated SSE text. */
async function streamThrough(slices: Array<string | Uint8Array>): Promise<string> {
  const encoder = new TextEncoder()
  const upstreamBody = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const slice of slices)
        controller.enqueue(typeof slice === 'string' ? encoder.encode(slice) : slice)
      controller.close()
    },
  })
  const baseFetch = vi.fn().mockResolvedValue(new Response(upstreamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
  const nativeFetch = createNativeAnthropicFetch({ apiKey: 'k', fetch: baseFetch })
  const response = await nativeFetch(CHAT_URL, {
    method: 'POST',
    body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  })
  return response.text()
}

function parseChunks(sse: string): ChatChunk[] {
  return sse
    .split('\n\n')
    .map(block => block.trim())
    .filter(block => block.startsWith('data:'))
    .map(block => block.slice(5).trim())
    .filter(data => data !== '[DONE]')
    .map(data => JSON.parse(data) as ChatChunk)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('request translation', () => {
  it('hoists system and developer messages into a single system prompt', async () => {
    const { sent } = await capture({
      model: 'claude-sonnet-4-5-20250929',
      messages: [
        { role: 'system', content: 'You are AIRI.' },
        { role: 'developer', content: 'Stay in character.' },
        { role: 'user', content: 'hi' },
      ],
    })

    expect(sent.system).toBe('You are AIRI.\nStay in character.')
    expect(sent.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
    expect(sent.model).toBe('claude-sonnet-4-5-20250929')
  })

  it('defaults max_tokens to the all-model-safe floor and honors explicit caps', async () => {
    expect((await capture({ messages: [{ role: 'user', content: 'hi' }] })).sent.max_tokens).toBe(4096)
    expect((await capture({ max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })).sent.max_tokens).toBe(1)
    expect((await capture({ max_completion_tokens: 42, messages: [{ role: 'user', content: 'hi' }] })).sent.max_tokens).toBe(42)
  })

  it('clamps temperature into [0, 1] and never sends temperature and top_p together', async () => {
    const both = (await capture({ messages: [{ role: 'user', content: 'hi' }], temperature: 1.4, top_p: 0.9 })).sent
    // Claude 4+ rejects requests carrying both sampling params.
    expect(both.temperature).toBe(1)
    expect(both.top_p).toBeUndefined()

    expect((await capture({ messages: [{ role: 'user', content: 'hi' }], temperature: -0.3 })).sent.temperature).toBe(0)
    expect((await capture({ messages: [{ role: 'user', content: 'hi' }], top_p: 0.5 })).sent.top_p).toBe(0.5)
  })

  it('drops whitespace-only stop sequences the Messages API rejects', async () => {
    const { sent } = await capture({ messages: [{ role: 'user', content: 'hi' }], stop: ['END', '\n', '  '] })
    expect(sent.stop_sequences).toEqual(['END'])

    const allBlank = (await capture({ messages: [{ role: 'user', content: 'hi' }], stop: '\n' })).sent
    expect(allBlank.stop_sequences).toBeUndefined()
  })

  it('only whitelisted fields reach the native body', async () => {
    // Runtime-only options that xsai serializes into the wire body must not
    // leak: the Messages API rejects unknown top-level fields with a 400.
    const leakedRuntimeOptions = { capture_tool_errors: true, wait_for_tools: true, stream_options: { include_usage: true } }
    const { sent } = await capture({ messages: [{ role: 'user', content: 'hi' }], ...leakedRuntimeOptions })

    expect(Object.keys(sent).sort()).toEqual(['max_tokens', 'messages', 'model'])
  })

  it('sets stream only when requested', async () => {
    expect((await capture({ messages: [{ role: 'user', content: 'hi' }] })).sent.stream).toBeUndefined()
  })

  it('maps tools and tool_choice variants', async () => {
    const base = {
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'web_search', description: 'Search.', parameters: { type: 'object', properties: {} } } }],
    }

    const auto = (await capture({ ...base, tool_choice: 'auto' })).sent
    expect(auto.tools).toEqual([{ name: 'web_search', description: 'Search.', input_schema: { type: 'object', properties: {} } }])
    expect(auto.tool_choice).toEqual({ type: 'auto' })

    expect((await capture({ ...base, tool_choice: 'none' })).sent.tool_choice).toEqual({ type: 'none' })
    expect((await capture({ ...base, tool_choice: 'required' })).sent.tool_choice).toEqual({ type: 'any' })
    expect((await capture({ ...base, tool_choice: { type: 'function', function: { name: 'web_search' } } })).sent.tool_choice).toEqual({ type: 'tool', name: 'web_search' })
  })

  it('disables thinking for tool requests only on adaptive-default models', async () => {
    const tools = [{ type: 'function', function: { name: 't', parameters: {} } }]

    // Sonnet 5 family: adaptive thinking is ON when the field is omitted, and
    // the OpenAI-shaped history cannot echo signed thinking blocks back — so
    // tool loops need an explicit off switch.
    expect((await capture({ model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }], tools })).sent.thinking).toEqual({ type: 'disabled' })
    expect((await capture({ model: 'anthropic/claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }], tools })).sent.thinking).toEqual({ type: 'disabled' })

    // Everything else: omitting the field already means off, and older models
    // may reject the field outright — never send it.
    expect((await capture({ model: 'claude-sonnet-4-5-20250929', messages: [{ role: 'user', content: 'hi' }], tools })).sent.thinking).toBeUndefined()
    expect((await capture({ model: 'claude-opus-4-8', messages: [{ role: 'user', content: 'hi' }], tools })).sent.thinking).toBeUndefined()
    expect((await capture({ model: 'claude-fable-5', messages: [{ role: 'user', content: 'hi' }], tools })).sent.thinking).toBeUndefined()

    // No tools -> never sent, regardless of model.
    expect((await capture({ model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] })).sent.thinking).toBeUndefined()
  })

  it('converts assistant tool_calls into tool_use blocks and tolerates malformed arguments', async () => {
    const { sent } = await capture({
      messages: [
        { role: 'user', content: 'weather?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'toolu_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' } },
            { id: 'toolu_2', type: 'function', function: { name: 'get_weather', arguments: '{not json' } },
          ],
        },
      ],
    })

    expect(sent.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Tokyo' } },
        { type: 'tool_use', id: 'toolu_2', name: 'get_weather', input: {} },
      ],
    })
  })

  // https://github.com/moeru-ai/airi/issues/1565
  it('merges consecutive tool results into one user turn for strict alternation (Issue #1565)', async () => {
    const { sent } = await capture({
      messages: [
        { role: 'user', content: 'weather in two cities' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'toolu_1', type: 'function', function: { name: 'w', arguments: '{}' } },
            { id: 'toolu_2', type: 'function', function: { name: 'w', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'toolu_1', content: 'Sunny' },
        { role: 'tool', tool_call_id: 'toolu_2', content: [{ type: 'text', text: 'Rainy' }] },
      ],
    })

    expect(sent.messages).toHaveLength(3)
    expect(sent.messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'Sunny' },
        { type: 'tool_result', tool_use_id: 'toolu_2', content: [{ type: 'text', text: 'Rainy' }] },
      ],
    })
  })

  it('drops tool results whose tool_use never reached the translated history', async () => {
    const { sent } = await capture({
      messages: [
        { role: 'user', content: 'hi' },
        // A nameless tool_call is untranslatable and skipped — its result must
        // be dropped too, or the Messages API rejects the unpaired
        // tool_result with a 400.
        { role: 'assistant', content: '', tool_calls: [{ id: 'toolu_ghost', type: 'function', function: { arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'toolu_ghost', content: 'orphaned' },
        { role: 'user', content: 'and now?' },
      ],
    })

    expect(JSON.stringify(sent.messages)).not.toContain('toolu_ghost')
    expect(JSON.stringify(sent.messages)).not.toContain('orphaned')
  })

  it('maps image parts to base64 and url sources and drops unsupported parts', async () => {
    const { sent } = await capture({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
            { type: 'input_audio', text: 'ignored' },
          ],
        },
      ],
    })

    expect(sent.messages[0].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'image', source: { type: 'url', url: 'https://example.com/cat.png' } },
    ])
  })

  it('drops empty assistant text so the API never sees an empty text block', async () => {
    const { sent } = await capture({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'still there?' },
      ],
    })

    expect(sent.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'still there?' }] },
    ])
  })
})

describe('response translation', () => {
  it('maps text, usage (including cache tokens), and stop_reason', async () => {
    const { response } = await capture({ messages: [{ role: 'user', content: 'hi' }] }, jsonResponse({
      id: 'msg_01',
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 },
    }))

    const body = await response.json() as Record<string, any>
    expect(body.id).toBe('msg_01')
    expect(body.object).toBe('chat.completion')
    expect(body.choices[0].message.content).toBe('Hello there')
    expect(body.choices[0].finish_reason).toBe('stop')
    expect(body.usage).toEqual({ prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 })
  })

  it('maps tool_use blocks to tool_calls with stringified arguments', async () => {
    const { response } = await capture({ messages: [{ role: 'user', content: 'hi' }] }, jsonResponse({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool_use', id: 'toolu_9', name: 'get_weather', input: { city: 'Tokyo' } },
      ],
    }))

    const body = await response.json() as Record<string, any>
    expect(body.choices[0].finish_reason).toBe('tool_calls')
    expect(body.choices[0].message.tool_calls).toEqual([
      { id: 'toolu_9', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' } },
    ])
  })

  it('surfaces thinking blocks as reasoning_content and maps terminal stop reasons', async () => {
    const { response } = await capture({ messages: [{ role: 'user', content: 'hi' }] }, jsonResponse({
      stop_reason: 'max_tokens',
      content: [{ type: 'thinking', thinking: 'pondering…' }, { type: 'text', text: 'partial' }],
    }))

    const body = await response.json() as Record<string, any>
    expect(body.choices[0].message.reasoning_content).toBe('pondering…')
    expect(body.choices[0].finish_reason).toBe('length')

    const refused = await capture({ messages: [{ role: 'user', content: 'hi' }] }, jsonResponse({ stop_reason: 'refusal', content: [] }))
    expect(((await refused.response.json()) as Record<string, any>).choices[0].finish_reason).toBe('content_filter')
  })

  it('keeps upstream diagnostic headers on the translated response', async () => {
    const { response } = await capture({ messages: [{ role: 'user', content: 'hi' }] }, jsonResponse(
      { content: [], stop_reason: 'end_turn' },
      200,
      { 'request-id': 'req_123', 'anthropic-ratelimit-requests-remaining': '99' },
    ))

    expect(response.headers.get('request-id')).toBe('req_123')
    expect(response.headers.get('anthropic-ratelimit-requests-remaining')).toBe('99')
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  it('returns a 2xx non-JSON body untouched so the real payload surfaces in errors', async () => {
    const { response } = await capture(
      { messages: [{ role: 'user', content: 'hi' }] },
      new Response('<html>proxy speaking html</html>', { status: 200 }),
    )

    expect(await response.text()).toBe('<html>proxy speaking html</html>')
  })
})

describe('sse translation', () => {
  const textStream = [
    'event: message_start\n',
    'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":12}}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('')

  it('translates a text stream into chat.completion chunks with usage and [DONE]', async () => {
    const output = await streamThrough([textStream])
    const chunks = parseChunks(output)

    expect(chunks[0].choices[0].delta).toEqual({ role: 'assistant' })
    expect(chunks[0].id).toBe('msg_1')
    expect(chunks[0].model).toBe('claude-sonnet-4-5-20250929')

    const text = chunks.map(chunk => chunk.choices[0].delta.content ?? '').join('')
    expect(text).toBe('Hello')

    const final = chunks[chunks.length - 1]
    expect(final.choices[0].finish_reason).toBe('stop')
    expect(final.usage).toEqual({ prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 })
    expect(output.trimEnd().endsWith('data: [DONE]')).toBe(true)
  })

  it('is byte-boundary safe: chunked delivery produces identical output', async () => {
    // Freeze the clock: every chunk embeds a per-translator `created`
    // timestamp, and the two runs below must serialize identically.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const whole = await streamThrough([textStream])
    const bytewise = await streamThrough([...textStream].map(character => character))

    expect(bytewise).toBe(whole)
  })

  it('reassembles multi-byte UTF-8 characters split across chunks', async () => {
    const frames = [
      'data: {"type":"message_start","message":{"id":"msg_utf8","model":"m","usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好🎉"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')
    const encoded = new TextEncoder().encode(frames)
    // Slice the raw bytes into 3-byte chunks, guaranteed to cut through the
    // middle of the CJK and emoji code points.
    const slices: Uint8Array[] = []
    for (let offset = 0; offset < encoded.length; offset += 3)
      slices.push(encoded.slice(offset, offset + 3))

    const output = await streamThrough(slices)
    const chunks = parseChunks(output)

    expect(chunks.map(chunk => chunk.choices[0].delta.content ?? '').join('')).toBe('你好🎉')
  })

  it('translates tool_use blocks into indexed tool_call deltas', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_2","model":"m","usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"Tokyo\\"}"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":2}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')])
    const chunks = parseChunks(output)

    const toolChunks = chunks.filter(chunk => chunk.choices[0].delta.tool_calls)
    expect(toolChunks[0].choices[0].delta.tool_calls).toEqual([
      { index: 0, id: 'toolu_1', type: 'function', function: { name: 'get_weather', arguments: '' } },
    ])
    const args = toolChunks.slice(1).map(chunk => chunk.choices[0].delta.tool_calls![0].function!.arguments).join('')
    expect(args).toBe('{"city":"Tokyo"}')

    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('tool_calls')
  })

  it('closes an argument-less tool block with an empty object literal', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_2b","model":"m","usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_0","name":"list_tools"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":1}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')])
    const chunks = parseChunks(output)

    // A tool registered with an empty schema streams no input_json_delta, so
    // the argument text must be completed on block stop to stay valid JSON.
    const toolChunks = chunks.filter(chunk => chunk.choices[0].delta.tool_calls)
    const args = toolChunks.map(chunk => chunk.choices[0].delta.tool_calls![0].function!.arguments).join('')
    expect(args).toBe('{}')
    expect(toolChunks[toolChunks.length - 1].choices[0].delta.tool_calls).toEqual([
      { index: 0, id: 'toolu_0', type: 'function', function: { name: 'list_tools', arguments: '{}' } },
    ])
  })

  it('does not append an empty object when the tool block already streamed arguments', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_2c","model":"m","usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Tokyo\\"}"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":2}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')])
    const chunks = parseChunks(output)

    const toolChunks = chunks.filter(chunk => chunk.choices[0].delta.tool_calls)
    const args = toolChunks.map(chunk => chunk.choices[0].delta.tool_calls![0].function!.arguments).join('')
    expect(args).toBe('{"city":"Tokyo"}')
  })

  it('maps thinking deltas to reasoning_content and drops signature deltas', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_3","model":"m","usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig"}}\n\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hi"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')])
    const chunks = parseChunks(output)

    expect(chunks.some(chunk => chunk.choices[0].delta.reasoning_content === 'hmm')).toBe(true)
    expect(output).not.toContain('sig')
    expect(chunks.map(chunk => chunk.choices[0].delta.content ?? '').join('')).toBe('hi')
  })

  it('forwards provider error events on the error channel xsai raises on', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_4","model":"m","usage":{"input_tokens":1}}}\n\n',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    ].join('')])

    expect(output).toContain('"error":{"type":"overloaded_error"')
  })

  it('preserves finish_reason and usage when the upstream closes without message_stop', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_5","model":"m","usage":{"input_tokens":3}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"cut"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":7}}\n\n',
    ].join('')])
    const chunks = parseChunks(output)

    const final = chunks[chunks.length - 1]
    expect(final.choices[0].finish_reason).toBe('length')
    expect(final.usage).toEqual({ prompt_tokens: 3, completion_tokens: 7, total_tokens: 10 })
    expect(output.trimEnd().endsWith('data: [DONE]')).toBe(true)
  })

  it('handles CRLF-delimited SSE frames', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_6","model":"m","usage":{"input_tokens":1}}}\r\n\r\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\r\n\r\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"crlf"}}\r\n\r\n',
      'data: {"type":"message_stop"}\r\n\r\n',
    ].join('')])
    const chunks = parseChunks(output)

    expect(chunks.map(chunk => chunk.choices[0].delta.content ?? '').join('')).toBe('crlf')
  })
})

describe('fetch wiring', () => {
  it('rewrites chat/completions to messages with Anthropic auth headers and forwards the abort signal', async () => {
    const baseFetch = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'pong' }], stop_reason: 'end_turn' }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'sk-ant-test', fetch: baseFetch })
    const abortController = new AbortController()

    await nativeFetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-ant-test' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: abortController.signal,
    })

    const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(Object.keys(init.headers).some(key => key.toLowerCase() === 'authorization')).toBe(false)
    expect(init.signal).toBe(abortController.signal)
  })

  // https://github.com/moeru-ai/airi/issues/1565
  it('rewrites custom proxy base URLs, keeping the path prefix and query (Issue #1565)', async () => {
    const baseFetch = vi.fn().mockResolvedValue(jsonResponse({ content: [], stop_reason: 'end_turn' }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'k', fetch: baseFetch })

    await nativeFetch('https://proxy.example/anthropic/v1/chat/completions?key=abc', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    })

    expect((baseFetch.mock.calls[0] as [string])[0]).toBe('https://proxy.example/anthropic/v1/messages?key=abc')
  })

  it('translates streaming responses into chat.completion.chunk SSE', async () => {
    const output = await streamThrough([[
      'data: {"type":"message_start","message":{"id":"msg_8","model":"m","usage":{"input_tokens":2}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hey"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('')])
    const chunks = parseChunks(output)

    expect(chunks.map(chunk => chunk.choices[0].delta.content ?? '').join('')).toBe('hey')
    expect(output.trimEnd().endsWith('data: [DONE]')).toBe(true)
  })

  it('passes non-2xx responses through untouched for xsai error handling', async () => {
    const errorBody = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    const baseFetch = vi.fn().mockResolvedValue(new Response(errorBody, { status: 401 }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'bad', fetch: baseFetch })

    const response = await nativeFetch(CHAT_URL, {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    })

    expect(response.status).toBe(401)
    expect(await response.text()).toBe(errorBody)
  })

  it('forwards an unparseable request body verbatim so the provider names the real error', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{"type":"error"}', { status: 400 }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'k', fetch: baseFetch })

    await nativeFetch(CHAT_URL, { method: 'POST', body: '{not json' })

    const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(String(init.body)).toBe('{not json')
  })

  it('honors Request-object input per fetch semantics', async () => {
    const baseFetch = vi.fn().mockResolvedValue(jsonResponse({ content: [], stop_reason: 'end_turn' }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'k', fetch: baseFetch })

    await nativeFetch(new Request(CHAT_URL, {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'from-request' }] }),
    }))

    const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const sent = JSON.parse(String(init.body)) as Record<string, any>
    expect(sent.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'from-request' }] }])
  })

  it('passes non-chat requests through with swapped auth headers', async () => {
    const baseFetch = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'claude-sonnet-4-5-20250929' }] }))
    const nativeFetch = createNativeAnthropicFetch({ apiKey: 'sk-ant-test', fetch: baseFetch })

    await nativeFetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer sk-ant-test' },
    })

    const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://api.anthropic.com/v1/models')
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
    expect(Object.keys(init.headers).some(key => key.toLowerCase() === 'authorization')).toBe(false)
  })
})

// Env-gated integration coverage against a real native Messages endpoint
// (official API or a /v1/messages proxy — the Issue #1565 scenario). Gated on
// a DEDICATED opt-in variable so a developer's ambient ANTHROPIC_API_KEY (or
// one picked up from .env by vitest's loadEnv) never triggers network calls.
// Set ANTHROPIC_NATIVE_SMOKE_KEY (+ optional ANTHROPIC_NATIVE_SMOKE_BASE_URL
// without /v1, and ANTHROPIC_NATIVE_SMOKE_MODEL) to enable.
const smokeKey = process.env.ANTHROPIC_NATIVE_SMOKE_KEY

describe.skipIf(!smokeKey)('createNativeAnthropicFetch (integration)', () => {
  const base = (process.env.ANTHROPIC_NATIVE_SMOKE_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '')
  const model = process.env.ANTHROPIC_NATIVE_SMOKE_MODEL ?? 'claude-haiku-4-5-20251001'
  const chatCompletionsURL = `${base}/v1/chat/completions`

  // https://github.com/moeru-ai/airi/issues/1565
  it('completes a non-streaming round trip (Issue #1565)', async () => {
    const nativeFetch = createNativeAnthropicFetch({ apiKey: smokeKey! })
    const response = await nativeFetch(chatCompletionsURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
      }),
    })

    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, any>
    expect(body.object).toBe('chat.completion')
    expect(typeof body.choices[0].message.content).toBe('string')
    expect(body.choices[0].message.content.length).toBeGreaterThan(0)
    expect(body.usage.prompt_tokens).toBeGreaterThan(0)
  }, 60_000)

  // https://github.com/moeru-ai/airi/issues/1565
  it('completes a streaming round trip ending in [DONE] (Issue #1565)', async () => {
    const nativeFetch = createNativeAnthropicFetch({ apiKey: smokeKey! })
    const response = await nativeFetch(chatCompletionsURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
      }),
    })

    expect(response.status).toBe(200)
    const output = await response.text()
    const chunks = parseChunks(output)
    expect(chunks[0].choices[0].delta.role).toBe('assistant')
    expect(chunks.map(chunk => chunk.choices[0].delta.content ?? '').join('').length).toBeGreaterThan(0)
    expect(chunks[chunks.length - 1].usage!.completion_tokens).toBeGreaterThan(0)
    expect(output.trimEnd().endsWith('data: [DONE]')).toBe(true)
  }, 60_000)
})
