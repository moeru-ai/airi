import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatProviderRuntime } from './chat-provider-adapter'

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
  chat: (model: string) => ({
    baseURL: 'https://example.com/',
    model,
  }),
} as unknown as ChatProvider

function createMockStreamResult() {
  return {
    steps: Promise.resolve([]),
    messages: Promise.resolve([]),
    usage: Promise.resolve(undefined),
    totalUsage: Promise.resolve(undefined),
  }
}

describe('chat provider compatibility adapter', () => {
  beforeEach(() => {
    streamTextMock.mockReset()
    streamTextMock.mockReturnValue(createMockStreamResult())
  })

  it('keeps the existing ChatProvider streamFrom call chain', async () => {
    const runtime = createChatProviderRuntime(provider)
    const events: unknown[] = []

    await runtime.stream({
      model: 'model-a',
      messages: [{ role: 'user', content: 'hello' }] as Message[],
      options: {
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    })

    expect(runtime.protocol).toBe('openai-chat-completions')
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://example.com/',
      model: 'model-a',
      streamOptions: { includeUsage: true },
    }))
    expect(events).toContainEqual({ type: 'finish' })
  })

  it('marks ChatProvider model discovery as unsupported', async () => {
    const runtime = createChatProviderRuntime(provider)

    await expect(runtime.discover()).resolves.toEqual({ status: 'unsupported' })
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('validates generation through the existing streamFrom path', async () => {
    const runtime = createChatProviderRuntime(provider)

    await expect(runtime.validateGeneration({ model: 'model-a' })).resolves.toEqual({ success: true })
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'model-a',
    }))
  })
})
