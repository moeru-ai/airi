import { safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { createResponseSchema } from '../../../../../services/adapters/llm/schemas/responses'
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
    { tool_choice: { type: 'function' } },
    { tool_choice: { type: 'allowed_tools', mode: 'auto' } },
    { input: [{ type: 'function_call_output', call_id: 'call-1', output: [] }] },
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
    const body = parseResponsesRequest({ input, tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {}, required: [] } }], tool_choice: { type: 'function', name: 'read' } })
    expect(body.store).toBe(false)
    expect(body.model).toBe('auto')
    expect(body.input).toEqual([{ ...input[0], type: 'message' }, ...input.slice(1)])
    expect(body.tools?.[0]).toMatchObject({ name: 'read' })
  })

  it('preserves nullable reasoning replay fields', () => {
    const input = [{ type: 'reasoning', summary: [], content: null, status: null, encrypted_content: 'opaque' }]

    expect(parseResponsesRequest({ input }).input).toEqual(input)
  })

  it('preserves nullable image options when inline content is portable', () => {
    const input = [{ role: 'user', content: [{ type: 'input_image', file_id: null, image_url: 'https://example.com/image.png', detail: null }] }]

    expect(parseResponsesRequest({ input }).input).toEqual([{ ...input[0], type: 'message' }])
  })

  it('accepts a function tool with a minimal object parameter schema', () => {
    const tool = { type: 'function', name: 'ping', parameters: { type: 'object' } }

    expect(parseResponsesRequest({ input: 'hello', tools: [tool] }).tools).toEqual([tool])
  })

  it('rejects more than 128 allowed tool references', () => {
    const ping = { type: 'function', name: 'ping' }

    expect(() => parseResponsesRequest({
      input: 'hello',
      tools: [{ ...ping, parameters: { type: 'object' } }],
      tool_choice: { type: 'allowed_tools', mode: 'auto', tools: Array.from({ length: 129 }).fill(ping) },
    })).toThrow('Invalid stateless Responses request')
  })

  it.each([
    { tools: [{ type: 'function', name: 'write', parameters: { type: 'object' } }], tool_choice: { type: 'function', name: 'read' } },
    { tools: [{ type: 'function', name: 'read', parameters: { type: 'object' } }], tool_choice: { type: 'web_search' } },
    { tools: [{ type: 'web_search' }], tool_choice: { type: 'allowed_tools', mode: 'required', tools: [{ type: 'function', name: 'read' }] } },
  ])('rejects a tool choice that references an undeclared tool: %j', (selection) => {
    expect(() => parseResponsesRequest({ input: 'hello', ...selection })).toThrow('Invalid stateless Responses request')
  })

  it.each([
    { role: 'user', content: [{ type: 'output_text', text: 'answer' }] },
    { role: 'system', content: [{ type: 'input_image', image_url: 'https://example.com/image.png' }] },
    { role: 'assistant', content: [{ type: 'input_text', text: 'question' }] },
  ])('rejects content parts that do not belong to the message role: %j', (message) => {
    expect(() => parseResponsesRequest({ input: [message] })).toThrow('Invalid stateless Responses request')
  })

  it('keeps inline video parts in function outputs', () => {
    const output = [{ type: 'input_video', video_url: 'data:video/mp4;base64,AAAA' }]
    const body = parseResponsesRequest({ input: [{ type: 'function_call_output', call_id: 'call-1', output }] })

    expect(body.input).toEqual([{ type: 'function_call_output', call_id: 'call-1', output }])
  })

  it('accepts the minimal reasoning effort', () => {
    const body = parseResponsesRequest({ input: 'hello', reasoning: { effort: 'minimal' } })

    expect(body.reasoning).toEqual({ effort: 'minimal' })
  })

  it('accepts nullable Responses options as unset', () => {
    const body = parseResponsesRequest({ input: 'hello', tools: null, tool_choice: null, max_output_tokens: null })

    expect(body).toMatchObject({ tools: null, tool_choice: null, max_output_tokens: null })
  })

  it.each([
    { temperature: -0.01 },
    { temperature: 2.01 },
    { top_p: -0.01 },
    { top_p: 1.01 },
  ])('rejects an out-of-range sampling parameter: %j', (sampling) => {
    expect(() => parseResponsesRequest({ input: 'hello', ...sampling })).toThrow('Invalid stateless Responses request')
  })

  // https://github.com/moeru-ai/airi/pull/2554#discussion_r4044384483
  it.each([
    {},
    { type: 'array', items: { type: 'string' } },
    { type: 'object', properties: [], required: [] },
    { type: 'object', required: ['missing'] },
    { type: 'object', properties: { query: { type: 'string' } }, required: ['missing'] },
  ])('pR #2554 rejects an invalid function parameter schema: %j', (parameters) => {
    expect(() => parseResponsesRequest({
      input: 'hello',
      tools: [{ type: 'function', name: 'search', parameters }],
    })).toThrow('Invalid stateless Responses request')
  })

  it.each([
    { type: 'json_schema' },
    { type: 'json_schema', name: 'answer' },
    { type: 'json_schema', schema: { type: 'object' } },
    { type: 'json_schema', name: 'answer', schema: [] },
    { type: 'json_schema', name: 'answer', schema: { type: 'array' } },
    { type: 'json_schema', name: 'answer', schema: { type: 'object', properties: [] } },
    { type: 'json_schema', name: 'answer', schema: { type: 'object', required: ['missing'] } },
  ])('pR #2554 rejects an incomplete structured output schema: %j', (format) => {
    expect(() => parseResponsesRequest({ input: 'hello', text: { format } })).toThrow('Invalid stateless Responses request')
  })
})

it('preserves search options, tool choice, sources and client-owned search history', () => {
  const input = [{ type: 'web_search_call', id: 'ws-1', status: 'completed', action: { type: 'search', queries: ['AIRI'], sources: [{ type: 'url', url: 'https://airi.moeru.ai' }] } }]
  const tools = [{ type: 'web_search', external_web_access: false, filters: { allowed_domains: ['airi.moeru.ai'] }, user_location: { type: 'approximate', country: 'JP' } }]
  const body = parseResponsesRequest({ input, tools, tool_choice: 'none', include: ['web_search_call.action.sources'] })
  expect(body.input).toEqual(input)
  expect(body.tools).toEqual(tools)
  expect(body.tool_choice).toBe('none')
  expect(body.store).toBe(false)
})

it('preserves a live find-in-page search item without a URL', () => {
  const input = [{ type: 'web_search_call', id: 'ws-1', status: 'completed', action: { type: 'find_in_page', pattern: 'AIRI' } }]

  expect(parseResponsesRequest({ input }).input).toEqual(input)
})

it.each([
  { store: true },
  { previous_response_id: 'resp-existing' },
  { conversation: 'conv-existing' },
  { input: [{ type: 'item_reference', id: 'item-existing' }] },
  { input: [{ role: 'user', content: [{ type: 'input_file', file_id: 'file-existing' }] }] },
  { input: [{ type: 'function_call_output', call_id: 'call-1', output: [{ type: 'input_image', file_id: 'file-existing', image_url: 'https://example.com/image.png' }] }] },
])('keeps shared-account policy outside the reusable protocol schema: %j', (fields) => {
  const body = { model: 'gpt-5-mini', input: 'hello', ...fields }
  expect(safeParse(createResponseSchema, body).success).toBe(true)
  expect(() => parseResponsesRequest(body)).toThrow('Invalid stateless Responses request')
})

it('preserves structured output schemas and assistant replay fields', () => {
  const text = { format: { type: 'json_schema', name: 'answer', strict: true, schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } } }
  const input = [
    { type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: 'thinking' }], encrypted_content: 'opaque', status: 'completed' },
    { id: 'msg-1', role: 'assistant', content: [{ type: 'output_text', text: 'answer', annotations: [] }], phase: 'final_answer', status: 'completed' },
  ]
  const body = parseResponsesRequest({ input, text, max_output_tokens: 1 })
  expect(body.text).toEqual(text)
  expect(body.input).toEqual([input[0], { ...input[1], type: 'message' }])
})
