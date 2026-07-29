import type { Tool } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { createToolErrorCapture, formatCapturedToolError } from './tool-error-capture'

function makeTool(overrides?: Partial<Tool> & { function?: Partial<Tool['function']> }): Tool {
  return {
    type: 'function',
    function: {
      name: 'echo',
      description: 'Echo',
      parameters: { type: 'object', properties: {} },
      ...overrides?.function,
    },
    execute: overrides?.execute ?? (async () => 'ok'),
    validate: overrides?.validate,
  }
}

describe('formatCapturedToolError', () => {
  it('formats a stable model-facing error string', () => {
    expect(formatCapturedToolError('echo', new Error('boom'))).toBe(
      'Tool call error for "echo": boom',
    )
  })
})

describe('createToolErrorCapture', () => {
  it('returns a CompletionToolResult from preToolCall for unknown tools', async () => {
    const capture = createToolErrorCapture([makeTool()])
    const out = await capture.preToolCall({
      args: '{}',
      toolCallId: 'call-unknown',
      toolCallType: 'function',
      toolName: 'missing_tool',
    }, { messages: [], toolCallId: 'call-unknown' })

    expect(out).toEqual(expect.objectContaining({
      toolCallId: 'call-unknown',
      toolName: 'missing_tool',
      result: expect.stringContaining('unavailable tool "missing_tool"'),
    }))
    expect(capture.toStreamEvent({
      type: 'tool-result.done',
      args: {},
      result: (out as { result: string }).result,
      toolCallId: 'call-unknown',
      toolName: 'missing_tool',
    })).toEqual(expect.objectContaining({
      type: 'tool-error',
      isError: true,
      toolCallId: 'call-unknown',
      result: expect.stringContaining('unavailable tool "missing_tool"'),
    }))
  })

  it('returns a CompletionToolResult from preToolCall for invalid JSON arguments', async () => {
    const capture = createToolErrorCapture([makeTool()])
    const out = await capture.preToolCall({
      args: '{not-json',
      toolCallId: 'call-bad-json',
      toolCallType: 'function',
      toolName: 'echo',
    }, { messages: [], toolCallId: 'call-bad-json' })

    expect(out).toEqual(expect.objectContaining({
      toolCallId: 'call-bad-json',
      toolName: 'echo',
      result: expect.stringMatching(/^Tool call error for "echo":/),
    }))
  })

  it('returns a CompletionToolResult from preToolCall when tool.validate fails', async () => {
    const capture = createToolErrorCapture([makeTool({
      validate: () => ({ issues: [{ message: 'city is required' }] }),
    })])

    const out = await capture.preToolCall({
      args: '{}',
      toolCallId: 'call-invalid',
      toolCallType: 'function',
      toolName: 'echo',
    }, { messages: [], toolCallId: 'call-invalid' })

    expect(out).toEqual(expect.objectContaining({
      result: 'Tool call error for "echo": city is required',
    }))
  })

  it('lets preToolCall continue when the tool call is valid', async () => {
    const capture = createToolErrorCapture([makeTool()])
    const out = await capture.preToolCall({
      args: '{"x":1}',
      toolCallId: 'call-ok',
      toolCallType: 'function',
      toolName: 'echo',
    }, { messages: [], toolCallId: 'call-ok' })

    expect(out).toBeUndefined()
  })

  it('wraps execute so throws become tool results and tool-error events', async () => {
    const capture = createToolErrorCapture([makeTool({
      execute: async () => {
        throw new Error('Focus mode does not accept game-state mutation inputs.')
      },
    })])

    const result = await capture.tools[0]!.execute({}, {
      messages: [],
      toolCallId: 'call-1',
    })

    expect(result).toContain('Focus mode does not accept game-state mutation inputs.')
    expect(capture.toStreamEvent({
      type: 'tool-result.done',
      args: {},
      result,
      toolCallId: 'call-1',
      toolName: 'echo',
    })).toEqual(expect.objectContaining({
      type: 'tool-error',
      isError: true,
      toolCallId: 'call-1',
      toolName: 'echo',
      result,
    }))
  })

  it('rethrows AbortError from wrapped execute', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const capture = createToolErrorCapture([makeTool({
      execute: async () => {
        throw abortError
      },
    })])

    await expect(capture.tools[0]!.execute({}, {
      messages: [],
      toolCallId: 'call-abort',
    })).rejects.toBe(abortError)
  })

  it('maps xsai stream events onto AIRI StreamEvent shapes', () => {
    const capture = createToolErrorCapture([])

    expect(capture.toStreamEvent({ type: 'text.delta', delta: 'hi' })).toEqual({
      type: 'text-delta',
      text: 'hi',
    })
    expect(capture.toStreamEvent({ type: 'reasoning.delta', delta: 'think' })).toEqual({
      type: 'reasoning-delta',
      text: 'think',
    })
    expect(capture.toStreamEvent({
      type: 'tool-call.done',
      args: '{}',
      toolCallId: 'c1',
      toolCallType: 'function',
      toolName: 'echo',
    })).toEqual({
      type: 'tool-call',
      args: '{}',
      toolCallId: 'c1',
      toolCallType: 'function',
      toolName: 'echo',
    })
    expect(capture.toStreamEvent({
      type: 'tool-result.done',
      args: {},
      result: 'ok',
      toolCallId: 'c1',
      toolName: 'echo',
    })).toEqual({
      type: 'tool-result',
      toolCallId: 'c1',
      result: 'ok',
    })
    expect(capture.toStreamEvent({ type: 'step.done' })).toBeNull()
    expect(capture.toStreamEvent({ type: 'text.start' })).toBeNull()
    expect(capture.toStreamEvent({ type: 'error', message: 'boom' })).toEqual({
      type: 'error',
      error: expect.any(Error),
    })
  })

  it('passes validate success through without capturing', async () => {
    const validate = vi.fn(() => ({ value: { city: 'Shanghai' } }))
    const capture = createToolErrorCapture([makeTool({ validate })])

    const out = await capture.preToolCall({
      args: '{"city":"Shanghai"}',
      toolCallId: 'call-valid',
      toolCallType: 'function',
      toolName: 'echo',
    }, { messages: [], toolCallId: 'call-valid' })

    expect(out).toBeUndefined()
    expect(validate).toHaveBeenCalledWith({ city: 'Shanghai' })
  })
})
