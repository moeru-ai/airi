import type { Tool } from '@xsai/shared-chat'

import type { ReadableSpan } from '../../../composables/use-io-tracer'

import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared'
import { afterEach, expect, it } from 'vitest'

import { onIOSpan, startSpan } from '../../../composables/use-io-tracer'
import { withToolSpan } from './tool-span'

const spans: ReadableSpan[] = []
onIOSpan(span => spans.push(span))

afterEach(() => {
  spans.length = 0
})

function tool(execute: Tool['execute']): Tool {
  return { type: 'function', execute, function: { name: 'search', parameters: {} } }
}

function toolSpans() {
  return spans.filter(span => span.name === IOSpanNames.ToolExecution)
}

it('records the name and call ID of a tool call, and never its arguments or result', async () => {
  const parent = startSpan(IOSpanNames.LLMInference)
  const traced = withToolSpan(tool(async () => 'secret result'), parent)
  expect(await traced.execute({ query: 'secret query' }, { toolCallId: 'call-1', messages: [] })).toBe('secret result')

  const [span] = toolSpans()
  expect(span.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
  expect(span.attributes[IOAttributes.GenAIToolName]).toBe('search')
  expect(span.attributes[IOAttributes.GenAIToolCallId]).toBe('call-1')
  expect(span.status.code).not.toBe(SpanStatusCode.ERROR)
  expect(JSON.stringify(span.attributes)).not.toContain('secret')
})

it('sets the error status for a thrown error and an MCP error result, and marks an aborted call as cancelled', async () => {
  const parent = startSpan(IOSpanNames.LLMInference)
  await expect(withToolSpan(tool(async () => {
    throw new TypeError('bad input')
  }), parent).execute({}, { toolCallId: 'thrown', messages: [] })).rejects.toThrow('bad input')
  await withToolSpan(tool(async () => ({ content: [], isError: true })), parent).execute({}, { toolCallId: 'mcp', messages: [] })
  const controller = new AbortController()
  await expect(withToolSpan(tool(async () => {
    controller.abort()
    throw new Error('aborted')
  }), parent).execute({}, { toolCallId: 'aborted', messages: [], abortSignal: controller.signal })).rejects.toThrow('aborted')

  const byCall = new Map(toolSpans().map(span => [span.attributes[IOAttributes.GenAIToolCallId], span]))
  expect(byCall.get('thrown')!.status.code).toBe(SpanStatusCode.ERROR)
  expect(byCall.get('thrown')!.attributes[IOAttributes.ErrorType]).toBe('TypeError')
  expect(byCall.get('mcp')!.status.code).toBe(SpanStatusCode.ERROR)
  expect(byCall.get('mcp')!.attributes[IOAttributes.ErrorType]).toBe('tool_error')
  expect(byCall.get('aborted')!.status.code).not.toBe(SpanStatusCode.ERROR)
  expect(byCall.get('aborted')!.attributes[IOAttributes.Cancelled]).toBe(true)
})
