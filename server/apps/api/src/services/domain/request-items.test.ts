import type { RequestContent } from './request-content'

import { describe, expect, it } from 'vitest'

import { captureRequestContent } from './request-content'
import { splitInputItems, splitOutputItems } from './request-items'

function sse(events: unknown[], state: RequestContent['state'] = 'complete'): RequestContent {
  return { format: 'sse', text: events.map(event => JSON.stringify(event)).join('\n\n'), state, omittedMedia: false }
}

describe('splitInputItems', () => {
  it('stores the user message of a first request and no system message', () => {
    const prompt = captureRequestContent({ messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hello' }] })
    expect(splitInputItems(prompt)).toEqual([{ role: 'user', partType: 'text', text: 'Hello', truncated: false }])
  })

  it('stores only the messages after the last assistant message', () => {
    const prompt = captureRequestContent({ messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: [{ type: 'text', text: 'What is the weather?' }, { type: 'image_url', image_url: { url: 'https://example.test/a.png' } }] },
    ] })
    expect(splitInputItems(prompt)).toEqual([{ role: 'user', partType: 'text', text: 'What is the weather?', truncated: false }])
  })

  it('stores the tool results of a tool round', () => {
    const prompt = captureRequestContent({ messages: [
      { role: 'user', content: 'What is the weather?' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'weather', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: 'Sunny' },
    ] })
    expect(splitInputItems(prompt)).toEqual([{ role: 'tool', partType: 'tool_call_response', text: 'Sunny', toolCallId: 'call-1', truncated: false }])
  })

  it('reads a string input and an item list of the Responses protocol', () => {
    expect(splitInputItems(captureRequestContent({ input: 'Hello' }))).toEqual([{ role: 'user', partType: 'text', text: 'Hello', truncated: false }])
    const prompt = captureRequestContent({ input: [
      { role: 'user', content: [{ type: 'input_text', text: 'What is the weather?' }] },
      { type: 'reasoning', id: 'rs-1', summary: [] },
      { type: 'function_call', call_id: 'call-1', name: 'weather', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call-1', output: 'Sunny' },
      { role: 'user', content: 'And tomorrow?' },
    ] })
    expect(splitInputItems(prompt)).toEqual([
      { role: 'tool', partType: 'tool_call_response', text: 'Sunny', toolCallId: 'call-1', truncated: false },
      { role: 'user', partType: 'text', text: 'And tomorrow?', truncated: false },
    ])
  })

  it('returns no items for a text preview', () => {
    expect(splitInputItems({ format: 'text', text: '{"messages":[{"role":"user","content":"Hel', state: 'truncated', omittedMedia: false })).toEqual([])
  })

  it('cuts a long text at the item limit', () => {
    const [item] = splitInputItems(captureRequestContent({ messages: [{ role: 'user', content: '好'.repeat(100_000) }] }))
    expect(item.truncated).toBe(true)
    expect(new TextEncoder().encode(item.text).byteLength).toBeLessThanOrEqual(256 * 1024)
    expect(item.text?.endsWith('好')).toBe(true)
  })

  it('does not carry the bytes of a split character into the next item', () => {
    const items = splitInputItems(captureRequestContent({ messages: [{ role: 'user', content: '好'.repeat(100_000) }, { role: 'user', content: 'a'.repeat(300 * 1024) }] }))
    expect(items[1].text).toBe('a'.repeat(256 * 1024))
  })
})

describe('splitOutputItems', () => {
  const call = (toolCallId: string, toolName: string, args: unknown, extra: object = {}) => ({ role: 'assistant', partType: 'tool_call', toolName, toolCallId, arguments: args, truncated: false, ...extra })
  const text = (value: string, extra: object = {}) => ({ role: 'assistant', partType: 'text', text: value, truncated: false, ...extra })

  it('reads a Chat Completions body with more than one choice and keeps the choice index', () => {
    const completion = captureRequestContent({ choices: [
      { index: 0, message: { role: 'assistant', content: 'Let me check.', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'weather', arguments: '{"city":"Tokyo"}' } }] } },
      { index: 1, message: { role: 'assistant', content: 'Sunny' } },
    ] })
    expect(splitOutputItems(completion)).toEqual([
      text('Let me check.', { attributes: { choice: 0 } }),
      call('call-1', 'weather', { city: 'Tokyo' }, { attributes: { choice: 0 } }),
      text('Sunny', { attributes: { choice: 1 } }),
    ])
  })

  it('joins the deltas of a Chat Completions stream for each choice and call index', () => {
    const completion = sse([
      { choices: [{ index: 0, delta: { content: 'Let me ' } }] },
      { choices: [{ index: 0, delta: { content: 'check.' } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'weather', arguments: '{"city":' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"Tokyo"}' } }, { index: 1, id: 'call-2', function: { name: 'time', arguments: '{}' } }] } }] },
      { choices: [{ index: 1, delta: { tool_calls: [{ index: 0, id: 'call-3', function: { name: 'time', arguments: '{}' } }] } }] },
      { choices: [], usage: { total_tokens: 3 } },
    ])
    expect(splitOutputItems(completion)).toEqual([
      text('Let me check.', { attributes: { choice: 0 } }),
      call('call-1', 'weather', { city: 'Tokyo' }, { attributes: { choice: 0 } }),
      call('call-2', 'time', {}, { attributes: { choice: 0 } }),
      call('call-3', 'time', {}, { attributes: { choice: 1 } }),
    ])
  })

  it('reads a Responses body without storing reasoning', () => {
    const completion = captureRequestContent({ output: [
      { type: 'reasoning', id: 'rs-1', summary: [] },
      { type: 'message', id: 'msg-1', role: 'assistant', content: [{ type: 'output_text', text: 'Let me check.' }] },
      { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'weather', arguments: '{}' },
    ] })
    expect(splitOutputItems(completion)).toEqual([text('Let me check.'), call('call-1', 'weather', {})])
  })

  it('stores provider calls apart from client calls, and a refusal apart from the text', () => {
    const completion = captureRequestContent({ output: [
      { type: 'web_search_call', id: 'ws-1', status: 'completed', action: { type: 'search', query: 'weather Tokyo' } },
      { type: 'mcp_call', id: 'mcp-1', server_label: 'calendar', name: 'list_events', arguments: '{}', output: 'none' },
      { type: 'custom_tool_call', id: 'ct-1', call_id: 'call-9', name: 'shell', input: '{"not":"parsed"}' },
      { type: 'message', id: 'msg-1', role: 'assistant', content: [{ type: 'output_text', text: 'Partly.' }, { type: 'refusal', refusal: 'I cannot help with that.' }] },
    ] })
    expect(splitOutputItems(completion)).toEqual([
      { role: 'assistant', partType: 'server_tool_call', toolName: 'web_search', toolCallId: 'ws-1', arguments: { action: { type: 'search', query: 'weather Tokyo' } }, truncated: false },
      { role: 'assistant', partType: 'server_tool_call', toolName: 'list_events', toolCallId: 'mcp-1', arguments: {}, attributes: { serverLabel: 'calendar' }, truncated: false },
      call('call-9', 'shell', '{"not":"parsed"}'),
      text('Partly.'),
      { role: 'assistant', partType: 'refusal', text: 'I cannot help with that.', truncated: false },
    ])
    const prompt = captureRequestContent({ input: [
      { role: 'user', content: 'Search it.' },
      { type: 'web_search_call', id: 'ws-1', status: 'completed' },
      { type: 'custom_tool_call_output', call_id: 'call-9', output: 'a.txt' },
    ] })
    expect(splitInputItems(prompt)).toEqual([{ role: 'tool', partType: 'tool_call_response', text: 'a.txt', toolCallId: 'call-9', truncated: false }])
  })

  it('stores a Chat Completions refusal as a refusal part', () => {
    const refusal = { role: 'assistant', partType: 'refusal', text: 'No.', truncated: false }
    expect(splitOutputItems(captureRequestContent({ choices: [{ message: { role: 'assistant', content: null, refusal: 'No.' } }] }))).toEqual([refusal])
    expect(splitOutputItems(sse([{ choices: [{ index: 0, delta: { content: null, refusal: 'No' } }] }, { choices: [{ index: 0, delta: { refusal: '.' } }] }]))).toEqual([refusal])
  })

  it('stores each call of a Responses stream one time when the terminal event repeats it', () => {
    const item = { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'weather', arguments: '{"city":"Tokyo"}' }
    const completion = sse([
      { type: 'response.output_item.added', item: { ...item, arguments: '' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc-1', delta: '{"city":"Tokyo"}' },
      { type: 'response.output_item.done', item },
      { type: 'response.completed', response: { output: [item] } },
    ])
    expect(splitOutputItems(completion)).toEqual([call('call-1', 'weather', { city: 'Tokyo' })])
  })

  it('keeps the items of a Responses stream that stopped before the terminal event, with cut arguments as a string', () => {
    const completion = sse([
      { type: 'response.output_item.added', item: { type: 'message', id: 'msg-1', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', item_id: 'msg-1', delta: 'Let me ' },
      { type: 'response.output_text.delta', item_id: 'msg-1', delta: 'check.' },
      { type: 'response.output_item.added', item: { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'weather', arguments: '' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc-1', delta: '{"city":' },
    ], 'partial')
    expect(splitOutputItems(completion)).toEqual([text('Let me check.'), call('call-1', 'weather', '{"city":')])
  })

  it('reads a Responses stream that holds only the terminal event', () => {
    const completion = sse([{ type: 'response.completed', response: { output: [{ type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'weather', arguments: '{}' }] } }])
    expect(splitOutputItems(completion)).toEqual([call('call-1', 'weather', {})])
  })

  it('cuts long arguments at the item limit', () => {
    const [item] = splitOutputItems(captureRequestContent({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', function: { name: 'write', arguments: JSON.stringify({ body: 'a'.repeat(300 * 1024) }) } }] } }] }))
    expect(item.truncated).toBe(true)
    expect(typeof item.arguments).toBe('string')
    expect(new TextEncoder().encode(item.arguments as string).byteLength).toBeLessThanOrEqual(256 * 1024)
  })

  it('skips an event that is cut and returns no items for a text preview', () => {
    const completion: RequestContent = { format: 'sse', text: `${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Hi' } }] })}\n\n{"choices":[{"ind`, state: 'partial', omittedMedia: false }
    expect(splitOutputItems(completion)).toEqual([text('Hi')])
    expect(splitOutputItems({ format: 'text', text: 'upstream error', state: 'complete', omittedMedia: false })).toEqual([])
  })
})
