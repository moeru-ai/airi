import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import type { ExecutableTool } from './tools'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isToolRelatedError, useLLM } from './llm'
import { useLlmToolsStore } from './tools'

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

vi.mock('../../../tools', () => ({
  mcp: mcpMock,
  debug: debugMock,
  createSparkCommandTool: createSparkCommandToolMock,
  // NOTICE: the resolver imports `createWebSearchTools` from the tools barrel, so
  // the mock must expose it or module loading fails with a missing-export error.
  createWebSearchTools: vi.fn(async (): Promise<Tool[]> => []),
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

function mockStreamEvents(events: unknown[]) {
  streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => void }) => {
    const steps = new Promise<unknown[]>((resolve) => {
      queueMicrotask(() => {
        for (const event of events)
          options.onEvent(event)
        resolve([])
      })
    })

    return { ...createMockStreamResult(), steps }
  })
}

function createSparkTool(): Tool {
  return {
    type: 'function',
    function: {
      name: 'builtIn_emitSparkCommand',
      description: 'Send a command to a connected game module.',
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(async () => 'ok'),
  }
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

  it('resolves from steps and emits a single finish event', async () => {
    streamTextMock.mockImplementation(() => createMockStreamResult())

    const store = useLLM()
    const onStreamEvent = vi.fn()

    await store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      waitForTools: true,
      onStreamEvent,
    })

    expect(onStreamEvent).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
  })

  it('ignores later error events after steps have resolved', async () => {
    let onEvent: ((event: unknown) => Promise<void>) | undefined
    let resolveSteps: ((steps: unknown[]) => void) | undefined
    streamTextMock.mockImplementation((options: { onEvent: (event: unknown) => Promise<void> }) => {
      onEvent = options.onEvent
      return {
        ...createMockStreamResult(),
        steps: new Promise<unknown[]>((resolve) => {
          resolveSteps = resolve
        }),
      }
    })

    const store = useLLM()
    const pending = store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      waitForTools: true,
    })

    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))
    resolveSteps?.([])
    await Promise.resolve()
    await onEvent!({ type: 'error', message: 'stream failed', cause: new Error('stream failed') })
    await expect(pending).resolves.toBeUndefined()
  })

  it('keeps builtin tools when stream steps resolve before a tool-related error event', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const customTool = {
      type: 'function',
      function: {
        name: 'custom-tool',
        description: 'Custom tool.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => 'ok'),
    } satisfies Tool
    const runtimeTool = {
      id: 'plugin:chess:runtime_play_chess_match',
      type: 'function' as const,
      function: {
        name: 'runtime_play_chess_match',
        description: 'Start a runtime chess match.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool

    llmToolsStore.addTools(runtimeTool)

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'error', message: 'model does not support tools', cause: new Error('model does not support tools') })
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
    expect(firstCallTools?.map(toolNameFrom)).toContain('custom-tool')
    expect(firstCallTools?.map(toolNameFrom)).toContain('runtime_play_chess_match')

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    await store.stream('model-a', provider, [{ role: 'user', content: 'hello again' }] as Message[], {
      tools: [customTool],
    })

    const secondCallTools = streamTextMock.mock.calls[1]?.[0]?.tools
    expect(Array.isArray(secondCallTools)).toBe(true)
    expect(secondCallTools?.map(toolNameFrom)).toContain('runtime_play_chess_match')
  })

  // https://github.com/moeru-ai/airi/issues/2161
  it('retries without tools when a model emits a plain-text tool call for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const fallbackText = 'I cannot play a game because no game tool is available.'
    const customTool = createSparkTool()
    const events: unknown[] = []
    const splitAt = Math.floor(rawToolCall.length / 2)

    mockStreamEvents([
      { type: 'text.delta', delta: rawToolCall.slice(0, splitAt) },
      { type: 'text.delta', delta: rawToolCall.slice(splitAt) },
    ])
    mockStreamEvents([
      { type: 'text.delta', delta: fallbackText },
    ])

    const store = useLLM()
    await store.stream('model-a', provider, [{ role: 'user', content: 'Can you play games?' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
      onStreamEvent: (event) => {
        events.push(event)
      },
    })

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[0]?.[0]?.tools?.map(toolNameFrom)).toContain('builtIn_emitSparkCommand')
    expect(streamTextMock.mock.calls[0]?.[0]?.toolChoice).toBe('auto')
    expect(streamTextMock.mock.calls[1]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[1]?.[0]?.toolChoice).toBeUndefined()
    expect(events
      .filter((event): event is { type: 'text-delta', text: string } => (
        typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'text-delta'
      ))
      .map(event => event.text)
      .join(''))
      .toBe(fallbackText)

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())
    await store.stream('model-a', provider, [{ role: 'user', content: 'Try again.' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
    })

    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(streamTextMock.mock.calls[2]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[2]?.[0]?.toolChoice).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/issues/2161
  it('does not replay earlier native tool work after a later plain-text tool call for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const customTool = createSparkTool()
    const events: unknown[] = []

    mockStreamEvents([
      { type: 'step.start' },
      {
        type: 'tool-call.done',
        args: '{}',
        toolCallId: 'call-1',
        toolCallType: 'function',
        toolName: 'builtIn_emitSparkCommand',
      },
      { type: 'step.done', usage: {} },
      { type: 'step.start' },
      { type: 'text.delta', delta: rawToolCall },
      { type: 'step.done', usage: {} },
    ])
    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    const store = useLLM()
    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'Can you play games?' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
      onStreamEvent: (event) => {
        events.push(event)
      },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-call',
      toolCallId: 'call-1',
    }))

    await store.stream('model-a', provider, [{ role: 'user', content: 'Try again.' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
    })

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[1]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[1]?.[0]?.toolChoice).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/issues/2161
  it('does not retry a forced tool choice without tools for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const customTool = createSparkTool()

    mockStreamEvents([
      { type: 'text.delta', delta: rawToolCall },
    ])
    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    const store = useLLM()
    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'You must play a game.' }] as Message[], {
      supportsTools: true,
      toolChoice: {
        type: 'function',
        function: { name: 'builtIn_emitSparkCommand' },
      },
      tools: [customTool],
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })

  it('merges runtime-registered tools from the llm-tools store into the builtin tool resolver', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const playChessTool = {
      id: 'plugin:chess:runtime_open_chess_board',
      type: 'function' as const,
      function: {
        name: 'runtime_open_chess_board',
        description: 'Open the runtime chess board.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool
    const runtimeMcpStatusTool = {
      id: 'mcp:runtime_sync_mcp_status',
      type: 'function' as const,
      function: {
        name: 'runtime_sync_mcp_status',
        description: 'Sync runtime MCP status.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool

    llmToolsStore.addTools(runtimeMcpStatusTool, playChessTool)

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    await store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(mergedTools?.map(toolNameFrom)).toEqual(expect.arrayContaining([
      'runtime_sync_mcp_status',
      'runtime_open_chess_board',
    ]))
  })

  it('prefers runtime-registered tools when duplicate tool names collide with builtin tools', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const builtinTool = {
      type: 'function',
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Builtin version.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    } as unknown as Tool
    const runtimeTool = {
      id: 'plugin:runtime:duplicate_runtime_tool',
      type: 'function' as const,
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Runtime version.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool

    mcpMock.mockResolvedValueOnce([builtinTool] as Tool[])
    llmToolsStore.addTools(runtimeTool)

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    await store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools as Array<{ function?: { name?: string, description?: string } }>
    const duplicateNameTools = mergedTools.filter(tool => tool.function?.name === 'duplicate_runtime_tool')

    expect(duplicateNameTools).toHaveLength(1)
    expect(duplicateNameTools[0]).toMatchObject({
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Runtime version.',
      },
    })
  })
})
