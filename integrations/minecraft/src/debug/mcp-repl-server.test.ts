import type { Brain } from '../cognitive/conscious/brain'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { McpReplServer } from './mcp-repl-server'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  McpServerConstructor: vi.fn(),
  resource: vi.fn(),
  tool: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class MockMcpServer {
      constructor(config: any) {
        mocks.McpServerConstructor(config)
        return {
          connect: mocks.connect,
          resource: mocks.resource,
          tool: mocks.tool,
        }
      }
    },
    ResourceTemplate: class MockResourceTemplate {
      uri: string
      constructor(uri: string) {
        this.uri = uri
      }
    },
  }
})

describe('mcpReplServer', () => {
  let brain: Brain

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock Brain
    brain = {
      executeDebugRepl: vi.fn().mockResolvedValue({ result: 'success' }),
      getDebugSnapshot: vi.fn().mockReturnValue({
        contextView: 'test context',
        conversationHistory: [],
        givenUp: false,
        isProcessing: false,
        llmLogEntries: [],
        paused: false,
        queueLength: 0,
        turnCounter: 1,
      }),
      getLastLlmInput: vi.fn().mockReturnValue({
        attempt: 1,
        conversationHistory: [],
        messages: [
          { content: 'sys', role: 'system' },
          { content: 'user', role: 'user' },
        ],
        systemPrompt: 'sys',
        updatedAt: 0,
        userMessage: 'user',
      }),
      getLlmLogs: vi.fn().mockReturnValue([{ id: 1, text: 'log' }]),
      getLlmTrace: vi.fn().mockReturnValue([{
        content: 'await skip()',
        estimatedTokens: 10,
        id: 1,
        messageCount: 2,
        turnId: 1,
      }]),
      getReplState: vi.fn().mockReturnValue({ updatedAt: 0, variables: [] }),
      injectDebugEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Brain

    void new McpReplServer(brain)
  })

  it('registers resources on initialization', () => {
    expect(mocks.McpServerConstructor).toHaveBeenCalled()

    expect(mocks.resource).toHaveBeenCalledWith('brain-state', expect.anything(), expect.any(Function))
    expect(mocks.resource).toHaveBeenCalledWith('brain-context', expect.anything(), expect.any(Function))
    expect(mocks.resource).toHaveBeenCalledWith('brain-history', expect.anything(), expect.any(Function))
    expect(mocks.resource).toHaveBeenCalledWith('brain-logs', expect.anything(), expect.any(Function))
  })

  it('registers tools on initialization', () => {
    expect(mocks.tool).toHaveBeenCalledWith('execute_repl', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('inject_chat', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('inject_event', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_state', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_last_prompt', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_logs', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_llm_trace', expect.anything(), expect.any(Function))
  })

  it('executes repl via tool handler', async () => {
    const executeReplCall = mocks.tool.mock.calls.find(call => call[0] === 'execute_repl')
    const handler = executeReplCall![2]

    const result = await handler({ code: 'test code' })

    expect(brain.executeDebugRepl).toHaveBeenCalledWith('test code')
    expect(result.content[0].text).toContain('success')
  })

  it('injects chat via tool handler', async () => {
    const injectChatCall = mocks.tool.mock.calls.find(call => call[0] === 'inject_chat')
    const handler = injectChatCall![2]

    await handler({ message: 'hi', username: 'steve' })

    expect(brain.injectDebugEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        metadata: { message: 'hi', username: 'steve' },
        type: 'chat_message',
      }),
      type: 'perception',
    }))
  })

  it('injects validated events via tool handler', async () => {
    const injectEventCall = mocks.tool.mock.calls.find(call => call[0] === 'inject_event')!
    const handler = injectEventCall[2]

    await handler({
      payload: {
        confidence: 1,
        description: 'Chat from steve: "hi"',
        metadata: {
          message: 'hi',
          username: 'steve',
        },
        sourceId: 'steve',
        timestamp: 123,
        type: 'chat_message',
      },
      source: {
        id: 'steve',
        type: 'minecraft',
      },
      type: 'perception',
    })

    expect(brain.injectDebugEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        metadata: {
          message: 'hi',
          username: 'steve',
        },
        type: 'chat_message',
      }),
      source: {
        id: 'steve',
        type: 'minecraft',
      },
      type: 'perception',
    }))
  })

  it('rejects invalid inject_event payloads', async () => {
    const injectEventCall = mocks.tool.mock.calls.find(call => call[0] === 'inject_event')!
    const handler = injectEventCall[2]

    await expect(handler({
      payload: {
        confidence: 2,
        description: 'Chat from steve: "hi"',
        metadata: {},
        timestamp: 123,
        type: 'chat_message',
      },
      source: {
        id: 'steve',
        type: 'minecraft',
      },
      type: 'perception',
    })).rejects.toThrow()
  })

  it('gets repl state via tool handler (skips builtins by default)', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_state')
    const handler = toolCall![2]

    await handler({})

    expect(brain.getReplState).toHaveBeenCalledWith({ includeBuiltins: false })
  })

  it('gets repl state via tool handler (can include builtins)', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_state')
    const handler = toolCall![2]

    await handler({ includeBuiltins: true })

    expect(brain.getReplState).toHaveBeenCalledWith({ includeBuiltins: true })
  })

  it('reads brain state via resource handler', async () => {
    const resourceCall = mocks.resource.mock.calls.find(call => call[0] === 'brain-state')
    const handler = resourceCall![2]

    const result = await handler({ href: 'brain://state' })

    expect(brain.getDebugSnapshot).toHaveBeenCalled()
    expect(result.contents[0].text).toContain('"processing": false')
  })

  it('gets last prompt via tool handler', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_last_prompt')
    const handler = toolCall![2]

    const result = await handler({})
    const text = result.content[0].text as string

    expect(brain.getLastLlmInput).toHaveBeenCalled()
    expect(text).toContain('user')
    expect(text).not.toContain('systemPrompt')
    expect(text).not.toContain('"role":"system"')
  })

  it('gets logs via tool handler', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_logs')
    const handler = toolCall![2]

    const result = await handler({ limit: 10 })

    expect(brain.getLlmLogs).toHaveBeenCalledWith(10)
    expect(result.content[0].text).toContain('log')
  })

  it('gets llm trace via tool handler', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_llm_trace')
    const handler = toolCall![2]

    const result = await handler({ limit: 5, turnId: 3 })
    const text = result.content[0].text as string

    expect(brain.getLlmTrace).toHaveBeenCalledWith(5, 3)
    expect(text).toContain('await skip()')
    expect(text).toContain('"messageCount":2')
    expect(text).toContain('"estimatedTokens":10')
  })
})
