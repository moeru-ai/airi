import type { Message, Tool, ToolCall } from '@xsai/shared-chat'

import { InvalidToolCallError, InvalidToolInputError, ToolExecutionError } from '@xsai/shared'
import { executeTool } from '@xsai/shared-chat'
import { describe, expect, it, vi } from 'vitest'

function createToolCall(overrides: Partial<ToolCall> & {
  function?: Partial<ToolCall['function']> & { name?: string, arguments?: string }
} = {}): ToolCall {
  const fn = overrides.function ?? {}
  return {
    id: 'call_1',
    type: 'function',
    function: {
      name: 'myTool',
      arguments: '{}',
      ...fn,
    },
    ...overrides,
  } as ToolCall
}

function createTool(name: string, execute: Tool['execute']): Tool {
  return {
    type: 'function',
    function: { name, description: '', parameters: {} },
    execute,
  }
}

const emptyMessages: Message[] = []

describe('executeTool (patched @xsai/shared-chat)', () => {
  it('returns success tool message when tool executes', async () => {
    const tools = [createTool('myTool', async () => 'ok')]
    const toolCall = createToolCall()

    const out = await executeTool({
      messages: emptyMessages,
      toolCall,
      tools,
    })

    expect(out.completionToolResult.isError).toBeUndefined()
    expect(out.completionToolResult.result).toBe('ok')
    expect(out.message.role).toBe('tool')
    expect(out.message.content).toBe('ok')
    expect(out.message.tool_call_id).toBe('call_1')
  })

  it('captures unknown tool as error result instead of throwing', async () => {
    const tools = [createTool('other', async () => 'x')]
    const toolCall = createToolCall({ function: { name: 'missingTool', arguments: '{}' } })

    const out = await executeTool({
      captureToolErrors: true,
      messages: emptyMessages,
      toolCall,
      tools,
    })

    expect(out.completionToolResult.isError).toBe(true)
    expect(out.completionToolResult.error).toBeDefined()
    expect(InvalidToolCallError.isInstance(out.completionToolResult.error)).toBe(true)
    expect(String(out.message.content)).toContain('missingTool')
    expect(out.message.role).toBe('tool')
  })

  it('captures invalid JSON arguments as error result', async () => {
    const tools = [createTool('myTool', async () => 'x')]
    const toolCall = createToolCall({ function: { name: 'myTool', arguments: '{broken' } })

    const out = await executeTool({
      captureToolErrors: true,
      messages: emptyMessages,
      toolCall,
      tools,
    })

    expect(out.completionToolResult.isError).toBe(true)
    expect(InvalidToolInputError.isInstance(out.completionToolResult.error)).toBe(true)
    expect(String(out.message.content)).toContain('myTool')
  })

  it('captures tool execute rejection as error result', async () => {
    const tools = [
      createTool('myTool', async () => {
        throw new Error('execute failed')
      }),
    ]
    const toolCall = createToolCall()

    const out = await executeTool({
      captureToolErrors: true,
      messages: emptyMessages,
      toolCall,
      tools,
    })

    expect(out.completionToolResult.isError).toBe(true)
    expect(ToolExecutionError.isInstance(out.completionToolResult.error)).toBe(true)
    expect(String(out.message.content)).toContain('myTool')
    expect(String(out.message.content)).toContain('execution failed')
  })

  it('rethrows AbortError from tool execute', async () => {
    const controller = new AbortController()
    const tools = [
      createTool('myTool', async () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }),
    ]
    const toolCall = createToolCall()

    await expect(
      executeTool({
        abortSignal: controller.signal,
        messages: emptyMessages,
        toolCall,
        tools,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('repairs invalid tool call when repairToolCall returns a valid call', async () => {
    const tools = [
      createTool('goodTool', async () => 'repaired'),
    ]
    const toolCall = createToolCall({ function: { name: 'badTool', arguments: '{}' } })

    const out = await executeTool({
      messages: emptyMessages,
      repairToolCall: async () => ({
        id: 'call_1',
        type: 'function',
        function: { name: 'goodTool', arguments: '{}' },
      }),
      toolCall,
      tools,
    })

    expect(out.completionToolResult.isError).toBeUndefined()
    expect(out.completionToolResult.result).toBe('repaired')
  })

  it('returns error when repairToolCall returns null', async () => {
    const tools = [createTool('goodTool', async () => 'x')]
    const toolCall = createToolCall({ function: { name: 'badTool', arguments: '{}' } })

    const out = await executeTool({
      captureToolErrors: true,
      messages: emptyMessages,
      repairToolCall: async () => null,
      toolCall,
      tools,
    })

    expect(out.completionToolResult.isError).toBe(true)
    expect(InvalidToolCallError.isInstance(out.completionToolResult.error)).toBe(true)
  })

  it('invokes lifecycle callbacks on success and on error', async () => {
    const onToolCallStart = vi.fn()
    const onToolCallFinish = vi.fn()
    const tools = [createTool('myTool', async () => 'done')]

    const successCall = createToolCall()
    const successOut = await executeTool({
      messages: emptyMessages,
      onToolCallFinish,
      onToolCallStart,
      toolCall: successCall,
      tools,
    })

    expect(onToolCallStart).toHaveBeenCalledOnce()
    expect(onToolCallStart).toHaveBeenCalledWith({
      input: {},
      toolCallId: 'call_1',
      toolName: 'myTool',
    })
    expect(onToolCallFinish).toHaveBeenCalled()
    const successFinish = onToolCallFinish.mock.calls[0][0]
    expect(successFinish.toolName).toBe('myTool')
    expect(successFinish.toolCallId).toBe('call_1')
    expect(successFinish.output).toBe(successOut.completionToolResult.result)
    expect(successFinish.error).toBeUndefined()
    expect(typeof successFinish.durationMs).toBe('number')

    onToolCallStart.mockClear()
    onToolCallFinish.mockClear()

    const badCall = createToolCall({ function: { name: 'nope', arguments: '{}' } })
    await executeTool({
      captureToolErrors: true,
      messages: emptyMessages,
      onToolCallFinish,
      onToolCallStart,
      toolCall: badCall,
      tools,
    })

    expect(onToolCallStart).not.toHaveBeenCalled()
    expect(onToolCallFinish).toHaveBeenCalledOnce()
    const errFinish = onToolCallFinish.mock.calls[0][0]
    expect(errFinish.output).toBeUndefined()
    expect(InvalidToolCallError.isInstance(errFinish.error)).toBe(true)
  })

  describe('without captureToolErrors (default upstream behavior)', () => {
    it('throws InvalidToolCallError for unknown tool', async () => {
      const tools = [createTool('other', async () => 'x')]
      const toolCall = createToolCall({ function: { name: 'missingTool', arguments: '{}' } })

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(InvalidToolCallError.isInstance(thrown)).toBe(true)
    })

    it('throws InvalidToolInputError for invalid JSON arguments', async () => {
      const tools = [createTool('myTool', async () => 'x')]
      const toolCall = createToolCall({ function: { name: 'myTool', arguments: '{broken' } })

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(InvalidToolInputError.isInstance(thrown)).toBe(true)
    })

    it('throws ToolExecutionError when tool execute rejects', async () => {
      const tools = [
        createTool('myTool', async () => {
          throw new Error('execute failed')
        }),
      ]
      const toolCall = createToolCall()

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(ToolExecutionError.isInstance(thrown)).toBe(true)
    })

    it('throws InvalidToolCallError when repairToolCall returns null', async () => {
      const tools = [createTool('goodTool', async () => 'x')]
      const toolCall = createToolCall({ function: { name: 'badTool', arguments: '{}' } })

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          repairToolCall: async () => null,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(InvalidToolCallError.isInstance(thrown)).toBe(true)
    })
  })
})
