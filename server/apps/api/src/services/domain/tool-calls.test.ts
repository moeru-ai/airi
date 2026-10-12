import type { RequestContent } from './request-content'

import { describe, expect, it } from 'vitest'

import { countToolCalls } from './tool-calls'

function stream(...events: unknown[]): RequestContent {
  return { format: 'sse', text: events.map(event => JSON.stringify(event)).join('\n\n'), state: 'complete', omittedMedia: false }
}

function body(value: unknown): RequestContent {
  return { format: 'json', text: JSON.stringify(value), state: 'complete', omittedMedia: false }
}

describe('tool call count', () => {
  it('merges streamed Chat Completions deltas by index', () => {
    expect(countToolCalls(stream(
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'weather', arguments: '{' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', function: { name: 'time', arguments: '{}' } }] } }] },
      { choices: [{ delta: { content: 'done' } }] },
    ))).toBe(2)
  })

  it('keeps the calls of different choices apart when each choice starts at index 0', () => {
    expect(countToolCalls(stream(
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'weather', arguments: '{' } }] } }] },
      { choices: [{ index: 1, delta: { tool_calls: [{ index: 0, id: 'b', function: { name: 'weather', arguments: '{' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] } }] },
      { choices: [{ index: 1, delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] } }] },
    ))).toBe(2)
  })

  it('merges streamed Responses item events and argument deltas by call ID', () => {
    expect(countToolCalls(stream(
      { type: 'response.output_item.added', item: { type: 'function_call', id: 'item-1', call_id: 'call-1', name: 'weather' } },
      { type: 'response.function_call_arguments.delta', item_id: 'item-1', delta: '{}' },
      { type: 'response.output_item.done', item: { type: 'function_call', id: 'item-1', call_id: 'call-1', arguments: '{}' } },
      { type: 'response.output_item.added', item: { type: 'message', id: 'item-2' } },
    ))).toBe(1)
  })

  it('counts the complete events of a stream that stops inside an event', () => {
    const complete = JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'a' }] } }] })
    expect(countToolCalls({ format: 'sse', text: `${complete}\n\n{"choices":[{"delta":{"tool_ca`, state: 'partial', omittedMedia: false })).toBe(1)
  })

  it('reads a body from its choices or its output', () => {
    expect(countToolCalls(body({ choices: [{ message: { tool_calls: [{ id: 'a' }, { id: 'b' }] } }, { message: { content: 'x' } }] }))).toBe(2)
    expect(countToolCalls(body({ output: [{ type: 'function_call', call_id: 'a' }, { type: 'message' }] }))).toBe(1)
    expect(countToolCalls(body({ response: { output: [{ type: 'function_call', call_id: 'a' }, { type: 'function_call', call_id: 'b' }] } }))).toBe(2)
  })

  it('counts zero for content without a tool call', () => {
    expect(countToolCalls(body({ choices: [{ message: { content: 'answer' } }] }))).toBe(0)
    expect(countToolCalls(stream({ choices: [{ delta: { content: 'answer' } }] }))).toBe(0)
    expect(countToolCalls({ format: 'json', text: '{"choices":', state: 'complete', omittedMedia: false })).toBe(0)
  })

  it('returns no count for a text preview', () => {
    expect(countToolCalls({ format: 'text', text: '{"choices":[{"message":{"tool_calls":[{}]', state: 'truncated', omittedMedia: false })).toBeUndefined()
  })
})
