import type { Brain } from '../cognitive/conscious/brain'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { McpReplServer } from './mcp-repl-server'

const mocks = vi.hoisted(() => ({
  resource: vi.fn(),
  tool: vi.fn(),
  connect: vi.fn(),
  McpServerConstructor: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class MockMcpServer {
      constructor(config: any) {
        mocks.McpServerConstructor(config)
        return {
          resource: mocks.resource,
          tool: mocks.tool,
          connect: mocks.connect,
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
  let server: McpReplServer

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock Brain
    brain = {
      getDebugSnapshot: vi.fn().mockReturnValue({
        isProcessing: false,
        queueLength: 0,
        turnCounter: 1,
        giveUpUntil: 0,
        paused: false,
        contextView: 'test context',
        conversationHistory: [],
        llmLogEntries: [],
      }),
      executeDebugRepl: vi.fn().mockResolvedValue({ result: 'success' }),
      injectDebugEvent: vi.fn().mockResolvedValue(undefined),
      getReplState: vi.fn().mockReturnValue({ variables: [], updatedAt: 0 }),
      getLastLlmInput: vi.fn().mockReturnValue({
        systemPrompt: 'sys',
        userMessage: 'user',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'user' },
        ],
        conversationHistory: [],
        updatedAt: 0,
        attempt: 1,
      }),
      getLlmLogs: vi.fn().mockReturnValue([{ id: 1, text: 'log' }]),
      getLlmTrace: vi.fn().mockReturnValue([{
        id: 1,
        turnId: 1,
        content: 'await skip()',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'u' },
        ],
      }]),
    } as unknown as Brain

    server = new McpReplServer(brain)
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
    expect(mocks.tool).toHaveBeenCalledWith('get_state', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_last_prompt', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_logs', expect.anything(), expect.any(Function))
    expect(mocks.tool).toHaveBeenCalledWith('get_llm_trace', expect.anything(), expect.any(Function))
  })

  it('executes repl via tool handler', async () => {
    const executeReplCall = mocks.tool.mock.calls.find(call => call[0] === 'execute_repl')
    const handler = executeReplCall[2]

    const result = await handler({ code: 'test code' })

    expect(brain.executeDebugRepl).toHaveBeenCalledWith('test code')
    expect(result.content[0].text).toContain('success')
  })

  it('injects chat via tool handler', async () => {
    const injectChatCall = mocks.tool.mock.calls.find(call => call[0] === 'inject_chat')
    const handler = injectChatCall[2]

    await handler({ username: 'steve', message: 'hi' })

    expect(brain.injectDebugEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'perception',
      payload: expect.objectContaining({
        type: 'chat_message',
        metadata: { username: 'steve', message: 'hi' },
      }),
    }))
  })

  it('reads brain state via resource handler', async () => {
    const resourceCall = mocks.resource.mock.calls.find(call => call[0] === 'brain-state')
    const handler = resourceCall[2]

    const result = await handler({ href: 'brain://state' })

    expect(brain.getDebugSnapshot).toHaveBeenCalled()
    expect(result.contents[0].text).toContain('"processing": false')
  })

  it('gets last prompt via tool handler', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_last_prompt')
    const handler = toolCall[2]

    const result = await handler({})
    const text = result.content[0].text as string

    expect(brain.getLastLlmInput).toHaveBeenCalled()
    expect(text).toContain('user')
    expect(text).not.toContain('systemPrompt')
    expect(text).not.toContain('"role":"system"')
  })

  it('gets logs via tool handler', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_logs')
    const handler = toolCall[2]

    const result = await handler({ limit: 10 })

    expect(brain.getLlmLogs).toHaveBeenCalledWith(10)
    expect(result.content[0].text).toContain('log')
  })

  it('gets llm trace via tool handler', async () => {
    const toolCall = mocks.tool.mock.calls.find(call => call[0] === 'get_llm_trace')
    const handler = toolCall[2]

    const result = await handler({ limit: 5, turnId: 3 })
    const text = result.content[0].text as string

    expect(brain.getLlmTrace).toHaveBeenCalledWith(5, 3)
    expect(text).toContain('await skip()')
    expect(text).toContain('"role":"user"')
    expect(text).not.toContain('"role":"system"')
  })
})
