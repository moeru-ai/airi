import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem, ChatStreamEventContext, StreamingAssistantMessage } from '../types/chat'
import type { StreamEvent } from '../types/llm'

import { describe, expect, it, vi } from 'vitest'

import { createChannelAgentRuntime } from './channel-agent-runtime'

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

function createHarness() {
  const sessionMessages: Record<string, ChatHistoryItem[]> = {}
  const foregroundPatches: StreamingAssistantMessage[] = []
  const foregroundResets: StreamingAssistantMessage[] = []
  const stateChanges: unknown[] = []
  const ensureSession = vi.fn((sessionId: string) => {
    sessionMessages[sessionId] ??= [
      {
        role: 'system',
        content: 'system prompt',
        createdAt: 1,
        id: 'system',
      },
    ]
  })
  const stream = vi.fn(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options?: {
    onStreamEvent?: (event: StreamEvent) => Promise<void> | void
  }) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'channel reply' })
    await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
  })

  const runtime = createChannelAgentRuntime({
    session: {
      ensureSession,
      getSessionMessages: sessionId => sessionMessages[sessionId] ?? [],
      appendSessionMessage: (sessionId, message) => {
        sessionMessages[sessionId] ??= []
        sessionMessages[sessionId].push(message)
      },
      getSessionGeneration: () => 1,
    },
    context: {
      ingest: vi.fn(),
      snapshot: () => ({}),
    },
    foregroundStream: {
      patch: message => foregroundPatches.push(message),
      reset: () => foregroundResets.push({ role: 'assistant', content: '', slices: [], tool_results: [] }),
    },
    llm: {
      stream,
    },
    getActiveSessionId: () => 'session-1',
    getActiveProvider: () => 'mock-provider',
    now: () => 200,
    monotonicNow: () => 100,
    createId: () => 'generated-id',
    onStateChange: state => stateChanges.push(state),
  })

  return {
    ensureSession,
    foregroundPatches,
    foregroundResets,
    runtime,
    sessionMessages,
    stateChanges,
    stream,
  }
}

/**
 * @example
 * const runtime = createChannelAgentRuntime(deps)
 * await runtime.ingestMessage(channelMessage, { model, chatProvider })
 */
describe('createChannelAgentRuntime', () => {
  /**
   * @example
   * Channel message facts are preserved in hook context while existing chat composition handles attachments.
   */
  it('maps channel messages into chat sends and preserves channel facts in turn context', async () => {
    const harness = createHarness()
    let hookContext: Omit<ChatStreamEventContext, 'composedMessage'> | undefined
    let composedMessages: Message[] = []

    harness.runtime.hooks.onBeforeMessageComposed(async (_message, context) => {
      hookContext = context
    })
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'visible reply' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingestMessage({
      id: 'channel-message-1',
      channelId: 'stage-ui',
      sessionId: 'session-channel',
      role: 'user',
      content: 'see image',
      createdAt: 777,
      attachments: [
        {
          type: 'image',
          data: 'aW1hZ2U=',
          mimeType: 'image/png',
        },
      ],
      input: {
        type: 'input:text',
        data: {
          text: 'see image',
        },
      },
      metadata: {
        source: 'contract-test',
      },
    }, {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(harness.ensureSession).toHaveBeenCalledWith('session-channel')
    expect(hookContext?.input).toEqual({
      type: 'input:text',
      data: {
        text: 'see image',
      },
    })
    expect(hookContext?.channel).toEqual({
      channelId: 'stage-ui',
      channelMessageId: 'channel-message-1',
      sessionId: 'session-channel',
      createdAt: 777,
      metadata: {
        source: 'contract-test',
      },
    })
    const userMessageContent = composedMessages[1]?.content
    if (!Array.isArray(userMessageContent))
      throw new TypeError('Expected composed channel user message content to be an array')
    expect(userMessageContent[0]).toEqual({
      type: 'text',
      text: expect.stringMatching(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] see image$/),
    })
    expect(userMessageContent[1]).toEqual(
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,aW1hZ2U=',
        },
      },
    )
    expect(harness.sessionMessages['session-channel']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        createdAt: 200,
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'visible reply',
      }),
    ]))
  })

  /**
   * @example
   * runtime.cancelPendingSends(sessionId)
   * await expect(queuedSend).rejects.toThrow()
   */
  it('keeps queue, cancel, snapshot, and sending state behavior delegated to chat runtime', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const firstSend = harness.runtime.ingestMessage({
      id: 'first-channel-message',
      channelId: 'stage-ui',
      sessionId: 'session-1',
      role: 'user',
      content: 'hold queue',
      createdAt: 100,
    }, {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingestMessage({
      id: 'second-channel-message',
      channelId: 'stage-ui',
      sessionId: 'session-1',
      role: 'user',
      content: 'cancel me',
      createdAt: 101,
    }, {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })

    expect(harness.runtime.getSending()).toBe(true)
    expect(harness.runtime.getPendingQueuedSendSnapshot()).toEqual([
      {
        sessionId: 'session-1',
        generation: 1,
        cancelled: false,
        messagePreview: 'cancel me',
        hasAttachments: false,
        inputType: undefined,
      },
    ])

    harness.runtime.cancelPendingSends('session-1')
    expect(harness.runtime.getPendingQueuedSendCount()).toBe(0)
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
    expect(harness.runtime.getSending()).toBe(false)

    harness.runtime.setSending(true)
    expect(harness.runtime.getSending()).toBe(true)
    harness.runtime.setSending(false)
    expect(harness.runtime.getSending()).toBe(false)
    expect(harness.stateChanges).toEqual(expect.arrayContaining([
      {
        sending: true,
        pendingQueuedSendCount: 0,
      },
      {
        sending: false,
        pendingQueuedSendCount: 0,
      },
    ]))
  })
})
