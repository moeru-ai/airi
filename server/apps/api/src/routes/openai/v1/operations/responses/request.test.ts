import { describe, expect, it } from 'vitest'

import { parseResponsesRequest } from './request'

describe('stateless Responses request boundary', () => {
  it.each([{}, { input: null }])('rejects a missing input as a bad request: %j', (body) => {
    expect(() => parseResponsesRequest(body)).toThrow('Invalid stateless Responses request')
  })

  // https://github.com/moeru-ai/airi/issues/2479
  it.each([
    { store: true },
    { background: true },
    { previous_response_id: 'resp-foreign' },
    { conversation: 'conv-foreign' },
    { input: [{ type: 'item_reference', id: 'item-foreign' }] },
    { input: [{ role: 'user', content: [{ type: 'input_file', file_id: 'file-foreign' }] }] },
    { input: [{ role: 'user', content: [{ type: 'input_image', file_id: 'file-foreign' }] }] },
    { tools: [{ type: 'web_search', file_id: 'foreign' }] },
    { tools: [{ type: 'file_search', vector_store_ids: ['foreign'] }] },
    { tools: [{ type: 'code_interpreter', container: 'auto' }] },
  ])('issue #2479 rejects unsupported state or tool contracts: %j', (body) => {
    expect(() => parseResponsesRequest({ input: 'hello', ...body })).toThrow('Invalid stateless Responses request')
  })

  it('keeps portable messages, encrypted reasoning and local tool outputs', () => {
    const input = [
      { role: 'user', content: 'hello' },
      { type: 'reasoning', id: 'rs-1', summary: [], encrypted_content: 'opaque' },
      { type: 'function_call', call_id: 'call-1', name: 'read', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call-1', output: '[]' },
    ]
    const request = parseResponsesRequest({ input, tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {}, required: [] } }], tool_choice: { type: 'function', name: 'read' } })
    expect(request.body.store).toBe(false)
    expect(request.policy.model).toBe('auto')
    expect(request.policy.input).toEqual(input)
    expect(request.policy.tools?.[0]).toMatchObject({ name: 'read' })
  })

  it('preserves nullable reasoning replay fields', () => {
    const input = [{ type: 'reasoning', summary: [], content: null, status: null, encrypted_content: 'opaque' }]

    expect(parseResponsesRequest({ input }).policy.input).toEqual(input)
  })

  it('preserves provider fields in encrypted reasoning replay items', () => {
    // ROOT CAUSE:
    //
    // The gateway parsed each input item with a strict local schema. A provider
    // added `format`, so the gateway rejected the stateless continuation.
    //
    // The gateway now checks only policy fields. It keeps provider fields in
    // the forwarded request.
    const input = [{
      type: 'reasoning',
      id: 'rs-1',
      summary: [],
      encrypted_content: 'opaque',
      format: 'openai-responses-v1',
    }]

    expect(parseResponsesRequest({ input }).policy.input).toEqual(input)
  })

  it('preserves nullable image options when inline content is portable', () => {
    const input = [{ role: 'user', content: [{ type: 'input_image', file_id: null, image_url: 'https://example.com/image.png', detail: null }] }]

    expect(parseResponsesRequest({ input }).policy.input).toEqual(input)
  })

  it('accepts a function tool with a minimal object parameter schema', () => {
    const tool = { type: 'function', name: 'ping', parameters: { type: 'object' } }

    expect(parseResponsesRequest({ input: 'hello', tools: [tool] }).policy.tools).toEqual([tool])
  })

  it.each([
    { role: 'user', content: [{ type: 'output_text', text: 'answer' }] },
    { role: 'system', content: [{ type: 'input_image', image_url: 'https://example.com/image.png' }] },
    { role: 'assistant', content: [{ type: 'input_text', text: 'question' }] },
  ])('leaves message content validation to the selected provider: %j', (message) => {
    expect(parseResponsesRequest({ input: [message] }).policy.input).toEqual([message])
  })

  it('keeps inline video parts in function outputs', () => {
    const output = [{ type: 'input_video', video_url: 'data:video/mp4;base64,AAAA' }]
    const request = parseResponsesRequest({ input: [{ type: 'function_call_output', call_id: 'call-1', output }] })

    expect(request.policy.input).toEqual([{ type: 'function_call_output', call_id: 'call-1', output }])
  })

  it('accepts the minimal reasoning effort', () => {
    const request = parseResponsesRequest({ input: 'hello', reasoning: { effort: 'minimal' } })

    expect(request.body.reasoning).toEqual({ effort: 'minimal' })
  })

  it('preserves unknown reasoning options for the selected provider', () => {
    const reasoning = { summmary: 'auto' }

    expect(parseResponsesRequest({ input: 'hello', reasoning }).body.reasoning).toEqual(reasoning)
  })

  it('preserves provider-owned tool choice extensions', () => {
    const toolChoice = { type: 'provider_strategy', strategy: 'future' }

    expect(parseResponsesRequest({ input: 'hello', tool_choice: toolChoice }).body.tool_choice).toEqual(toolChoice)
  })

  it('accepts nullable Responses options as unset', () => {
    const request = parseResponsesRequest({ input: 'hello', tools: null, tool_choice: null, max_output_tokens: null })

    expect(request.body).toMatchObject({ tools: null, tool_choice: null, max_output_tokens: null })
  })

  it.each([
    { temperature: -0.01 },
    { temperature: 2.01 },
    { top_p: -0.01 },
    { top_p: 1.01 },
  ])('leaves sampling parameter validation to the selected provider: %j', (sampling) => {
    expect(parseResponsesRequest({ input: 'hello', ...sampling }).body).toMatchObject(sampling)
  })

  // https://github.com/moeru-ai/airi/pull/2554#discussion_r4044384483
  it.each([
    {},
    { type: 'array', items: { type: 'string' } },
    { type: 'object', properties: [], required: [] },
    { type: 'object', required: ['missing'] },
    { type: 'object', properties: { query: { type: 'string' } }, required: ['missing'] },
  ])('preserves provider-owned function parameter schemas: %j', (parameters) => {
    expect(parseResponsesRequest({
      input: 'hello',
      tools: [{ type: 'function', name: 'search', parameters }],
    }).policy.tools?.[0]).toMatchObject({ parameters })
  })

  it.each([
    { type: 'json_schema' },
    { type: 'json_schema', name: 'answer' },
    { type: 'json_schema', schema: { type: 'object' } },
    { type: 'json_schema', name: 'answer', schema: [] },
    { type: 'json_schema', name: 'answer', schema: { type: 'array' } },
    { type: 'json_schema', name: 'answer', schema: { type: 'object', properties: [] } },
    { type: 'json_schema', name: 'answer', schema: { type: 'object', required: ['missing'] } },
  ])('preserves provider-owned structured output schemas: %j', (format) => {
    expect(parseResponsesRequest({ input: 'hello', text: { format } }).body.text).toEqual({ format })
  })
})

it('preserves search options, tool choice, sources and client-owned search history', () => {
  const input = [{ type: 'web_search_call', id: 'ws-1', status: 'completed', action: { type: 'search', queries: ['AIRI'], sources: [{ type: 'url', url: 'https://airi.moeru.ai' }] } }]
  const tools = [{ type: 'web_search', external_web_access: false, filters: { allowed_domains: ['airi.moeru.ai'] }, user_location: { type: 'approximate', country: 'JP' } }]
  const request = parseResponsesRequest({ input, tools, tool_choice: 'none', include: ['web_search_call.action.sources'] })
  expect(request.policy.input).toEqual(input)
  expect(request.policy.tools).toEqual(tools)
  expect(request.body.tool_choice).toBe('none')
  expect(request.body.store).toBe(false)
  expect(request.policy.requiresWebSearch).toBe(true)
})

it('preserves a live find-in-page search item without a URL', () => {
  const input = [{ type: 'web_search_call', id: 'ws-1', status: 'completed', action: { type: 'find_in_page', pattern: 'AIRI' } }]

  const request = parseResponsesRequest({ input })

  expect(request.policy.input).toEqual(input)
  expect(request.policy.requiresWebSearch).toBe(true)
})

it('preserves structured output schemas and assistant replay fields', () => {
  const text = { format: { type: 'json_schema', name: 'answer', strict: true, schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } } }
  const input = [
    { type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: 'thinking' }], encrypted_content: 'opaque', status: 'completed' },
    { id: 'msg-1', role: 'assistant', content: [{ type: 'output_text', text: 'answer', annotations: [] }], phase: 'final_answer', status: 'completed' },
  ]
  const request = parseResponsesRequest({ input, text, max_output_tokens: 1 })
  expect(request.body.text).toEqual(text)
  expect(request.policy.input).toEqual(input)
})
