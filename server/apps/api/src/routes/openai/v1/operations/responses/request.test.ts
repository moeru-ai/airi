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

  it('keeps inline video parts in function outputs', () => {
    const output = [{ type: 'input_video', video_url: 'data:video/mp4;base64,AAAA' }]
    const body = parseResponsesRequest({ input: [{ type: 'function_call_output', call_id: 'call-1', output }] })

    expect(body.input).toEqual([{ type: 'function_call_output', call_id: 'call-1', output }])
  })

  it('accepts the minimal reasoning effort', () => {
    const body = parseResponsesRequest({ input: 'hello', reasoning: { effort: 'minimal' } })

    expect(body.reasoning).toEqual({ effort: 'minimal' })
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
    { type: 'object', properties: {} },
    { type: 'object', properties: [], required: [] },
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
