import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isToolRelatedError, useLLM } from './llm'

const {
  streamTextMock,
  mcpMock,
  debugMock,
  createSparkCommandToolMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  mcpMock: vi.fn(async () => []),
  debugMock: vi.fn(async () => []),
  createSparkCommandToolMock: vi.fn(async () => ({
    name: 'spark',
    description: '',
    parameters: {},
    execute: vi.fn(),
  })),
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

  it('keeps stream pending on tool_calls finish when waitForTools is true', async () => {
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
    expect(resolved).toBe(false)

    await onEvent!({ type: 'finish', finishReason: 'stop' })
    await pending

    expect(onStreamEvent).toHaveBeenCalledTimes(2)
  })

  it('rejects stream on error event after waitForTools hold', async () => {
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
    await expect(pending).rejects.toThrow('stream failed')
  })

  it('keeps builtin tools and auto-disables tools after tool-related errors', async () => {
    const store = useLLM()
    const customTool = { name: 'custom-tool' } as any

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void>, tools?: unknown[] }) => {
      queueMicrotask(async () => {
        await options.onEvent({ type: 'error', error: new Error('model does not support tools') })
      })
      return createMockStreamResult()
    })

    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      tools: [customTool],
    })).rejects.toThrow('does not support tools')

    const firstCallTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(Array.isArray(firstCallTools)).toBe(true)
    expect(mcpMock).toHaveBeenCalledTimes(1)
    expect(debugMock).toHaveBeenCalledTimes(1)
    expect(firstCallTools).toContain(customTool)

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
    expect(secondCallTools).toBeUndefined()
  })
})
