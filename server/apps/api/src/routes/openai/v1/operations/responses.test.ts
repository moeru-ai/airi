import { describe, expect, it } from 'vitest'

import { parseResponsesRequest } from './responses'

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
    { tools: [{ type: 'web_search' }] },
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
    expect(body.tools?.[0].name).toBe('read')
  })
})
