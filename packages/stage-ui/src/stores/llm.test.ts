import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isToolRelatedError, useLLM } from './llm'
import { useLlmToolsStore } from './llm-tools'

const {
  streamTextMock,
  mcpMock,
  debugMock,
  createSparkCommandToolMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  mcpMock: vi.fn(async (): Promise<Tool[]> => []),
  debugMock: vi.fn(async (): Promise<Tool[]> => []),
  createSparkCommandToolMock: vi.fn(async (): Promise<unknown> => [{
    name: 'spark',
    description: '',
    parameters: {},
    execute: vi.fn(),
  }]),
}))

vi.mock('@xsai/model', () => ({
  listModels: vi.fn(),
}))

vi.mock('@xsai/stream-text', () => ({
  streamText: streamTextMock,
}))

vi.mock('@xsai/shared-chat', () => ({
  stepCountAtLeast: vi.fn(),
}))

vi.mock('../tools', () => ({
  mcp: mcpMock,
  debug: debugMock,
  createSparkCommandTool: createSparkCommandToolMock,
}))

const provider = {
  chat: () => ({
    baseURL: 'https://example.com/',
  }),
} as unknown as ChatProvider

function createMockStreamResult() {
  return {
    steps: Promise.resolve([]),
    messages: Promise.resolve([]),
    usage: Promise.resolve({}),
    totalUsage: Promise.resolve({}),
  }
}

function toolNameFrom(tool: unknown) {
  if (typeof tool !== 'object' || tool === null)
    return undefined

  const candidate = tool as {
    name?: string
    function?: {
      name?: string
    }
  }

  return candidate.function?.name ?? candidate.name
}

describe('isToolRelatedError', () => {
  beforeEach(() => {
    streamTextMock.mockReset()
    mcpMock.mockClear()
    debugMock.mockClear()
    createSparkCommandToolMock.mockClear()
    setActivePinia(createPinia())
  })

  const positives: [provider: string, msg: string][] = [
    ['ollama', 'llama3 does not support tools'],
    ['ollama', 'phi does not support tools'],
    ['openrouter', 'No endpoints found that support tool use'],
    ['openai-compatible', 'Invalid schema for function \'myFunc\': \'dict\' is not valid under any of the given schemas'],
    ['openai-compatible', 'invalid_function_parameters'],
    ['openai-compatible', 'invalid function parameters'],
    ['azure', 'Functions are not supported at this time'],
    ['azure', 'Unrecognized request argument supplied: tools'],
    ['azure', 'Unrecognized request arguments supplied: tool_choice, tools'],
    ['google', 'Tool use with function calling is unsupported'],
    ['groq', 'tool_use_failed'],
    ['groq', 'Error code: tool_use_failed - Failed to call a function'],
    ['anthropic', 'This model does not support function calling'],
    ['anthropic', 'does not support function_calling'],
    ['cloudflare', 'tools is not supported'],
    ['cloudflare', 'tool is not supported for this model'],
    ['cloudflare', 'tools are not supported'],
  ]

  const negatives = [
    'network error',
    'timeout',
    'rate limit exceeded',
    'invalid api key',
    'model not found',
    'context length exceeded',
    '',
  ]

  for (const [provider, msg] of positives) {
    it(`matches [${provider}]: "${msg}"`, () => {
      expect(isToolRelatedError(msg)).toBe(true)
      expect(isToolRelatedError(new Error(msg))).toBe(true)
    })
  }

  for (const msg of negatives) {
    it(`rejects: "${msg}"`, () => {
      expect(isToolRelatedError(msg)).toBe(false)
      expect(isToolRelatedError(new Error(msg))).toBe(false)
    })
  }

  it('resolves from steps while still forwarding tool_calls finish events', async () => {
    let onEvent: ((event: unknown) => Promise<void>) | undefined
    streamTextMock.mockImplementation((options: { onEvent: (event: unknown) => Promise<void> }) => {
      onEvent = options.onEvent
      return createMockStreamResult()
    })

    const store = useLLM()
    const onStreamEvent = vi.fn()
    let resolved = false

    const pending = store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      waitForTools: true,
      onStreamEvent,
    }).then(() => {
      resolved = true
    })

    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))
    await onEvent!({ type: 'finish', finishReason: 'tool_calls' })
    await Promise.resolve()
    expect(resolved).toBe(true)

    await onEvent!({ type: 'finish', finishReason: 'stop' })
    await pending

    expect(onStreamEvent).toHaveBeenCalledTimes(2)
  })

  it('ignores later error events after steps have resolved', async () => {
    let onEvent: ((event: unknown) => Promise<void>) | undefined
    streamTextMock.mockImplementation((options: { onEvent: (event: unknown) => Promise<void> }) => {
      onEvent = options.onEvent
      return createMockStreamResult()
    })

    const store = useLLM()
    const pending = store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      waitForTools: true,
    })

    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))
    await onEvent!({ type: 'finish', finishReason: 'tool_calls' })
    await onEvent!({ type: 'error', error: new Error('stream failed') })
    await expect(pending).resolves.toBeUndefined()
  })

  it('keeps builtin tools when stream steps resolve before a tool-related error event', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const customTool = { name: 'custom-tool' } as any
    const runtimeTool = {
      function: {
        name: 'runtime_play_chess_match',
        description: 'Start a runtime chess match.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    }

    llmToolsStore.registerTools('plugin-tools', [runtimeTool as any])

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'error', error: new Error('model does not support tools') })
      })
      return createMockStreamResult()
    })

    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      tools: [customTool],
    })).resolves.toBeUndefined()

    const firstCallTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(Array.isArray(firstCallTools)).toBe(true)
    expect(mcpMock).toHaveBeenCalledTimes(1)
    expect(debugMock).toHaveBeenCalledTimes(1)
    expect(firstCallTools).toContain(customTool)
    expect(firstCallTools?.map(toolNameFrom)).toContain('runtime_play_chess_match')

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'finish', finishReason: 'stop' })
      })
      return createMockStreamResult()
    })

    await store.stream('model-a', provider, [{ role: 'user', content: 'hello again' }] as Message[], {
      tools: [customTool],
    })

    const secondCallTools = streamTextMock.mock.calls[1]?.[0]?.tools
    expect(Array.isArray(secondCallTools)).toBe(true)
    expect(secondCallTools?.map(toolNameFrom)).toContain('runtime_play_chess_match')
  })

  it('merges runtime-registered tools from the llm-tools store into the builtin tool resolver', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const playChessTool = {
      function: {
        name: 'runtime_open_chess_board',
        description: 'Open the runtime chess board.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    }
    const runtimeMcpStatusTool = {
      function: {
        name: 'runtime_sync_mcp_status',
        description: 'Sync runtime MCP status.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    }

    llmToolsStore.registerTools('mcp', [runtimeMcpStatusTool as any])
    llmToolsStore.registerTools('plugin-tools', [playChessTool as any])

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'finish', finishReason: 'stop' })
      })
      return createMockStreamResult()
    })

    await store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(mergedTools).toEqual(expect.arrayContaining([runtimeMcpStatusTool, playChessTool]))
  })

  it('prefers runtime-registered tools when duplicate tool names collide with builtin tools', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const builtinTool = {
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Builtin version.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    } as unknown as Tool
    const runtimeTool = {
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Runtime version.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    }

    mcpMock.mockResolvedValueOnce([builtinTool] as Tool[])
    llmToolsStore.registerTools('plugin-tools', [runtimeTool as any])

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'finish', finishReason: 'stop' })
      })
      return createMockStreamResult()
    })

    await store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools as Array<{ function?: { name?: string } }>
    const duplicateNameTools = mergedTools.filter(tool => tool.function?.name === 'duplicate_runtime_tool')

    expect(duplicateNameTools).toHaveLength(1)
    expect(duplicateNameTools[0]).toMatchObject({
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Runtime version.',
      },
    })
  })

  /**
   * @example
   * llmToolsStore.registerTools('plugin-tools', pendingRuntimeTools)
   * await store.stream('model-a', provider, messages)
   */
  it('waits for pending runtime tool registrations before building stream tools', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const runtimeTool = {
      function: {
        name: 'runtime_pending_tool',
        description: 'Pending runtime tool.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    }
    let resolveTools: ((tools: unknown[]) => void) | undefined
    const pendingTools = new Promise<unknown[]>((resolve) => {
      resolveTools = resolve
    })

    llmToolsStore.registerTools('plugin-tools', pendingTools as Promise<any[]>)

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'finish', finishReason: 'stop' })
      })
      return createMockStreamResult()
    })

    const pendingStream = store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])
    await Promise.resolve()

    expect(streamTextMock).not.toHaveBeenCalled()

    resolveTools?.([runtimeTool])
    await pendingStream

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(mergedTools?.map(toolNameFrom)).toContain('runtime_pending_tool')
  })
})
