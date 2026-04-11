import type { LLMResponse, QueryEngineConfig, QueryMessage, ToolCall } from './types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runQueryEngine } from './engine'
import { callLLMStreaming } from './streaming'
import { buildToolRoutes, executeToolCall } from './tool-router'
import { verifyModifiedFiles } from './verification'

vi.mock('./streaming', () => ({
  callLLMStreaming: vi.fn(),
}))

vi.mock('./tool-router', () => ({
  buildToolRoutes: vi.fn(() => ({})),
  getToolDefinitions: vi.fn(() => []),
  executeToolCall: vi.fn(),
}))

vi.mock('./verification', () => ({
  verifyModifiedFiles: vi.fn(async () => []),
}))

function createConfig(overrides: Partial<QueryEngineConfig> = {}): QueryEngineConfig {
  return {
    model: 'test-model',
    apiKey: 'test-key',
    baseURL: 'https://example.invalid/v1',
    maxTurns: 12,
    maxToolCalls: 20,
    maxTokenBudget: 100_000,
    approvalMode: 'auto',
    ...overrides,
  }
}

function createResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    content: null,
    toolCalls: [],
    finishReason: 'stop',
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    },
    ...overrides,
  }
}

function hasMessage(messages: QueryMessage[], snippet: string) {
  return messages.some((message) => {
    if (message.role === 'assistant' || message.role === 'tool')
      return false
    return message.content.includes(snippet)
  })
}

describe('runQueryEngine regressions', () => {
  const workspacePath = '/tmp/query-engine-regression'
  const primitives = {} as any
  const terminal = {
    execute: vi.fn(),
    getState: vi.fn(),
    resetState: vi.fn(),
    describe: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(buildToolRoutes).mockReturnValue({})
    vi.mocked(executeToolCall).mockResolvedValue({ result: 'ok', error: false })
    vi.mocked(verifyModifiedFiles).mockResolvedValue([])
  })

  it('does not exit immediately on first text-only response', async () => {
    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'Thinking...' }))
      .mockResolvedValueOnce(createResponse({ content: 'Still thinking...' }))
      .mockResolvedValueOnce(createResponse({ content: 'Done.' }))

    const result = await runQueryEngine({
      goal: 'Do something',
      workspacePath,
      primitives,
      terminal,
      config: createConfig(),
    })

    expect(result.status).toBe('completed')
    expect(vi.mocked(callLLMStreaming)).toHaveBeenCalledTimes(3)
  })

  it('injects continuation nudges across consecutive no-tool rounds', async () => {
    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'Thinking only' }))
      .mockResolvedValueOnce(createResponse({ content: 'Still text-only' }))
      .mockResolvedValueOnce(createResponse({ content: 'Wrap up' }))

    await runQueryEngine({
      goal: 'No tool behavior',
      workspacePath,
      primitives,
      terminal,
      config: createConfig(),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    const secondMessages = calls[1]?.[0].messages as QueryMessage[]
    const thirdMessages = calls[2]?.[0].messages as QueryMessage[]

    expect(hasMessage(secondMessages, '(1/3 text-only rounds used)')).toBe(true)
    expect(hasMessage(thirdMessages, '(2/3 text-only rounds used)')).toBe(true)
  })

  it('injects verification-specific nudge after edits when assistant goes text-only', async () => {
    const editCall: ToolCall = {
      id: 'tc-edit-1',
      type: 'function',
      function: {
        name: 'edit_file',
        arguments: JSON.stringify({
          file_path: 'src/feature.ts',
          old_text: 'old',
          new_text: 'new',
        }),
      },
    }

    vi.mocked(callLLMStreaming)
      .mockResolvedValueOnce(createResponse({ content: 'Applying edit', toolCalls: [editCall] }))
      .mockResolvedValueOnce(createResponse({ content: 'I changed it' }))
      .mockResolvedValueOnce(createResponse({ content: 'All done' }))

    vi.mocked(executeToolCall).mockResolvedValue({
      result: '{"success": true}',
      error: false,
    })

    const result = await runQueryEngine({
      goal: 'Apply an edit',
      workspacePath,
      primitives,
      terminal,
      config: createConfig(),
    })

    const calls = vi.mocked(callLLMStreaming).mock.calls
    const thirdMessages = calls[2]?.[0].messages as QueryMessage[]

    expect(hasMessage(thirdMessages, 'You\'ve modified files')).toBe(true)
    expect(hasMessage(thirdMessages, 'VERIFY your changes')).toBe(true)
    expect(result.filesModified).toEqual(['src/feature.ts'])
  })

  it.each(['edit_file', 'write_file'] as const)(
    'does not include failed %s in filesModified',
    async (toolName) => {
      const toolCall: ToolCall = {
        id: `tc-${toolName}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify({
            file_path: 'src/fail.ts',
            old_text: 'old',
            new_text: 'new',
            content: 'replacement',
          }),
        },
      }

      vi.mocked(callLLMStreaming)
        .mockResolvedValueOnce(createResponse({ content: 'Trying edit', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createResponse({ content: 'No tools 1' }))
        .mockResolvedValueOnce(createResponse({ content: 'No tools 2' }))
        .mockResolvedValueOnce(createResponse({ content: 'No tools 3' }))

      vi.mocked(executeToolCall).mockResolvedValue({
        result: 'mutation failed',
        error: true,
      })

      const result = await runQueryEngine({
        goal: 'Attempt failing mutation',
        workspacePath,
        primitives,
        terminal,
        config: createConfig(),
      })

      expect(result.status).toBe('completed')
      expect(result.filesModified).toEqual([])
      expect(vi.mocked(verifyModifiedFiles)).toHaveBeenCalledWith([], workspacePath)
    },
  )
})
