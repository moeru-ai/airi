import { describe, expect, it } from 'vitest'

import { parseResponsesRequest } from './request'

describe('stateless Responses request boundary', () => {
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
    const body = parseResponsesRequest({ input, tools: [{ type: 'function', name: 'read', parameters: { type: 'object', properties: {} } }], tool_choice: { type: 'function', name: 'read' } })
    expect(body.store).toBe(false)
    expect(body.model).toBe('auto')
    expect(body.input).toEqual([{ ...input[0], type: 'message' }, ...input.slice(1)])
    expect(body.tools?.[0]).toMatchObject({ name: 'read' })
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
