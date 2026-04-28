import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { streamFrom } from './llm-service'

const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}))

vi.mock('@xsai/stream-text', () => ({
  streamText: streamTextMock,
}))

vi.mock('@xsai/shared-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xsai/shared-chat')>()
  return {
    ...actual,
    stepCountAtLeast: vi.fn(),
  }
})

const provider = {
  chat: () => ({
    baseURL: 'https://example.com/',
  }),
} as unknown as ChatProvider

function createMockStreamResult(steps: Promise<unknown[]> = Promise.resolve([])) {
  return {
    steps,
    messages: Promise.resolve([]),
    usage: Promise.resolve(undefined),
    totalUsage: Promise.resolve(undefined),
  }
}

describe('streamFrom tool error capture', () => {
  /**
   * @example
   * await streamFrom({ model, chatProvider, messages, options: { captureToolErrors: true } })
   */
  it('keeps captureToolErrors internal while forwarding failed tool calls as tool-error events', async () => {
    let resolveSteps: ((steps: unknown[]) => void) | undefined
    const events: unknown[] = []
    const failingTool = {
      type: 'function',
      function: {
        name: 'play_chess',
        description: 'Start chess.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(() => {
        throw new Error('Focus mode does not accept game-state mutation inputs.')
      }),
    } satisfies Tool

    streamTextMock.mockImplementationOnce((options: {
      captureToolErrors?: boolean
      onEvent: (event: unknown) => Promise<void>
      tools?: Tool[]
    }) => {
      const steps = new Promise<unknown[]>((resolve) => {
        resolveSteps = resolve
      })

      queueMicrotask(async () => {
        const result = await options.tools?.[0]?.execute({}, {
          messages: [],
          toolCallId: 'call-1',
        })

        await options.onEvent({
          type: 'tool-result',
          args: {},
          result,
          toolCallId: 'call-1',
          toolName: 'play_chess',
        })
        await options.onEvent({ type: 'finish', finishReason: 'stop' })
        resolveSteps?.([])
      })

      return createMockStreamResult(steps)
    })

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      messages: [{ role: 'user', content: 'play chess' }] as Message[],
      options: {
        captureToolErrors: true,
        tools: [failingTool],
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    })

    const streamOptions = streamTextMock.mock.calls[0]?.[0]
    expect(streamOptions.captureToolErrors).toBeUndefined()
    expect(streamOptions.tools?.[0]).not.toBe(failingTool)
    expect(failingTool.execute).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-error',
      isError: true,
      toolCallId: 'call-1',
      toolName: 'play_chess',
      result: expect.stringContaining('Focus mode does not accept game-state mutation inputs.'),
    }))
  })
})
