import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem, ContextMessage, StreamingAssistantMessage } from '../types/chat'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it, vi } from 'vitest'

import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

function createHarness() {
  const sessionMessages: Record<string, ChatHistoryItem[]> = {
    'session-1': [
      {
        role: 'system',
        content: 'system prompt',
        createdAt: new Date(2026, 3, 25, 18, 0).getTime(),
        id: 'system',
      },
    ],
  }
  const contextSnapshot: Record<string, ContextMessage[]> = {}
  const foregroundPatches: StreamingAssistantMessage[] = []
  const foregroundResets: StreamingAssistantMessage[] = []
  const lifecycleRecords: unknown[] = []
  const promptProjections: unknown[] = []
  const userAppended: unknown[] = []
  const assistantAppended: unknown[] = []
  const userTurns: unknown[] = []
  const assistantTurns: unknown[] = []
  const stateChanges: unknown[] = []
  const telemetry = {
    chatActivationStarted: [] as unknown[],
    chatActivationSucceeded: [] as unknown[],
    chatActivationFailed: [] as unknown[],
    messageSendStarted: [] as unknown[],
    llmRequestStarted: [] as unknown[],
    llmFirstToken: [] as unknown[],
    assistantResponseRendered: [] as unknown[],
    llmGeneration: [] as unknown[],
    messageRound: [] as unknown[],
    messageRoundFailed: [] as unknown[],
  }
  const stream = vi.fn(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options?: StreamOptions) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'assistant reply' })
    await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
  })
  const ids = ['stream-context', 'assistant-id', 'user-id', 'fallback-id']
  let systemPromptSupplement: string | undefined
  let nowValue = new Date(2026, 3, 25, 18, 47).getTime()
  let monotonicNowValues = [1000]
  let generation = 1

  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: (sessionId) => {
        sessionMessages[sessionId] ??= []
      },
      getSessionMessages: sessionId => sessionMessages[sessionId] ?? [],
      appendSessionMessage: (sessionId, message) => {
        sessionMessages[sessionId] ??= []
        sessionMessages[sessionId].push(message)
      },
      getSessionGeneration: () => generation,
    },
    context: {
      ingest: vi.fn(),
      snapshot: () => structuredClone(contextSnapshot),
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
    getSystemPromptSupplement: () => systemPromptSupplement,
    now: () => nowValue,
    monotonicNow: () => monotonicNowValues.shift() ?? 1000,
    createId: () => ids.shift() ?? 'generated-id',
    onLifecycle: record => lifecycleRecords.push(record),
    onPromptProjection: payload => promptProjections.push(payload),
    onUserMessageAppended: event => userAppended.push(event),
    onAssistantMessageAppended: event => assistantAppended.push(event),
    onUserTurnReady: event => userTurns.push(event),
    onAssistantTurnReady: event => assistantTurns.push(event),
    onStateChange: state => stateChanges.push(state),
    onChatActivationStarted: event => telemetry.chatActivationStarted.push(event),
    onChatActivationSucceeded: event => telemetry.chatActivationSucceeded.push(event),
    onChatActivationFailed: event => telemetry.chatActivationFailed.push(event),
    onMessageSendStarted: event => telemetry.messageSendStarted.push(event),
    onLlmRequestStarted: event => telemetry.llmRequestStarted.push(event),
    onLlmFirstToken: event => telemetry.llmFirstToken.push(event),
    onAssistantResponseRendered: event => telemetry.assistantResponseRendered.push(event),
    onLlmGeneration: event => telemetry.llmGeneration.push(event),
    onMessageRound: event => telemetry.messageRound.push(event),
    onMessageRoundFailed: event => telemetry.messageRoundFailed.push(event),
  })

  return {
    assistantAppended,
    assistantTurns,
    contextSnapshot,
    foregroundPatches,
    foregroundResets,
    generation: {
      set: (next: number) => {
        generation = next
      },
    },
    lifecycleRecords,
    now: {
      set: (next: number) => {
        nowValue = next
      },
    },
    monotonicNow: {
      set: (next: number[]) => {
        monotonicNowValues = [...next]
      },
    },
    promptProjections,
    runtime,
    sessionMessages,
    stateChanges,
    stream,
    systemPromptSupplement: {
      set: (next: string | undefined) => {
        systemPromptSupplement = next
      },
    },
    telemetry,
    userAppended,
    userTurns,
  }
}

describe('createChatOrchestratorRuntime', () => {
  // ROOT CAUSE:
  //
  // The marker parser buffered 24 literal characters plus its marker-safety tail.
  // Providers that emitted small, slow deltas therefore showed no visible text for several seconds.
  //
  // We fixed this by keeping only the marker-safety tail before the first foreground update.
  it('updates the foreground stream before a slow response reaches 24 characters', async () => {
    const harness = createHarness()
    let patchesBeforeFinish = 0

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      for (const text of '1234567890')
        await options?.onStreamEvent?.({ type: 'text-delta', text })

      patchesBeforeFinish = harness.foregroundPatches.length
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('show a slow response', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(patchesBeforeFinish).toBeGreaterThan(1)
    expect(harness.foregroundPatches.some(message => message.content === '1234')).toBe(true)
  })

  it('stores tool names with the user message and omits them from provider messages', async () => {
    const harness = createHarness()

    await harness.runtime.ingest('use a widget', {
      model: 'gpt-test',
      chatProvider: provider,
      toolReferences: [{ name: 'stage_widgets' }],
    })

    const storedUserMessage = harness.sessionMessages['session-1']?.find(message => message.role === 'user')
    const providerMessages = harness.stream.mock.calls[0]?.[2]
    const providerUserMessage = providerMessages?.find(message => message.role === 'user')

    expect(storedUserMessage).toMatchObject({
      role: 'user',
      tools: [{ name: 'stage_widgets' }],
    })
    expect(providerUserMessage).not.toHaveProperty('tools')
  })

  // ROOT CAUSE:
  //
  // xsAI kept the assistant tool call and tool result in its private message copy.
  // AIRI stored only UI slices, then removed those slices from the next provider request.
  //
  // We fixed this by storing the provider transcript on the finalized UI message.
  // The next request expands that transcript back into chronological provider messages.
  it('includes completed tool rounds in the next provider request', async () => {
    const harness = createHarness()

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      await options?.onStreamEvent?.({
        type: 'tool-call',
        toolCallId: 'call-weather',
        toolName: 'weather',
        args: '{}',
      } as StreamEvent)
      await options?.onStreamEvent?.({
        type: 'tool-result',
        toolCallId: 'call-weather',
        result: 'sunny',
      } as StreamEvent)
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'The weather is sunny.' })

      await (options as StreamOptions & { onMessages?: (messages: Message[]) => void })?.onMessages?.([
        ...messages,
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call-weather',
              type: 'function',
              function: {
                name: 'weather',
                arguments: '{}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call-weather',
          content: 'sunny',
        },
        {
          role: 'assistant',
          content: 'The weather is sunny.',
        },
      ])
    })

    await harness.runtime.ingest('What is the weather?', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    await harness.runtime.ingest('Can you repeat that?', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    const messages = harness.stream.mock.calls[1]?.[2]

    expect(messages?.map(message => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
    ])
    expect(messages?.[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'call-weather',
          type: 'function',
          function: {
            name: 'weather',
            arguments: '{}',
          },
        },
      ],
    })
    expect(messages?.[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call-weather',
      content: 'sunny',
    })
    expect(messages?.[4]).toEqual({
      role: 'assistant',
      content: 'The weather is sunny.',
    })
  })

  it('keeps hook order and appends context prompt to the latest user message', async () => {
    const harness = createHarness()
    harness.contextSnapshot['system:weather'] = [
      {
        id: 'weather',
        contextId: 'system:weather',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'sunny',
        createdAt: 1,
      },
    ]
    const hookOrder: string[] = []
    let composedMessages: Message[] = []

    harness.runtime.hooks.onBeforeMessageComposed(async () => {
      hookOrder.push('before-compose')
    })
    harness.runtime.hooks.onAfterMessageComposed(async () => {
      hookOrder.push('after-compose')
    })
    harness.runtime.hooks.onBeforeSend(async () => {
      hookOrder.push('before-send')
    })
    harness.runtime.hooks.onTokenLiteral(async () => {
      hookOrder.push('token-literal')
    })
    harness.runtime.hooks.onStreamEnd(async () => {
      hookOrder.push('stream-end')
    })
    harness.runtime.hooks.onAssistantResponseEnd(async () => {
      hookOrder.push('assistant-end')
    })
    harness.runtime.hooks.onAfterSend(async () => {
      hookOrder.push('after-send')
    })
    harness.runtime.hooks.onAssistantMessage(async () => {
      hookOrder.push('assistant-message')
    })
    harness.runtime.hooks.onChatTurnComplete(async () => {
      hookOrder.push('turn-complete')
    })
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'hello' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(hookOrder).toEqual([
      'before-compose',
      'after-compose',
      'before-send',
      'token-literal',
      'stream-end',
      'assistant-end',
      'after-send',
      'assistant-message',
      'turn-complete',
    ])
    expect(composedMessages).toHaveLength(2)
    expect(composedMessages[0]).toMatchObject({ role: 'system', content: 'system prompt' })
    expect(composedMessages[1]).toMatchObject({ role: 'user' })
    expect(composedMessages[1]?.content).toEqual([
      {
        type: 'text',
        text: '[2026-04-25 18:47] hello from user',
      },
      {
        type: 'text',
        text: '\n[Context]\n- system:weather: sunny',
      },
    ])
    expect(harness.lifecycleRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'before-compose' }),
      expect.objectContaining({ phase: 'prompt-context-built' }),
      expect.objectContaining({ phase: 'after-compose' }),
    ]))
    expect(harness.promptProjections).toHaveLength(1)
  })

  // ROOT CAUSE:
  //
  // Speech-muted consumers dispatch plugin CALL markers without a TTS
  // session. If the hook context has no turn id, a locally unhandled call
  // cannot be correlated and relayed to another Electron renderer.
  it('preserves the round turn id on special-token hooks', async () => {
    const harness = createHarness()
    let specialTurnId = ''

    harness.runtime.hooks.onTokenSpecial(async (_special, context) => {
      specialTurnId = context.turnId
    })
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: '<|CALL ["plugin.action"]|>' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('trigger special', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(specialTurnId).toBe('user-id')
    expect(harness.telemetry.messageSendStarted).toEqual([
      expect.objectContaining({ roundId: specialTurnId }),
    ])
  })

  it('keeps timestamp prefixes stable for legacy user messages without createdAt', async () => {
    const harness = createHarness()
    const legacyUserMessage: ChatHistoryItem = {
      role: 'user' as const,
      content: 'legacy prompt',
      id: 'legacy-user',
    }
    harness.sessionMessages['session-1'] = [
      { role: 'system', content: 'system prompt', createdAt: 1, id: 'system' },
      legacyUserMessage,
    ]
    const firstMessages: Message[][] = []
    const secondMessages: Message[][] = []

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      firstMessages.push(structuredClone(messages))
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })
    harness.now.set(new Date(2026, 3, 25, 18, 47).getTime())

    await harness.runtime.ingest('first send', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      secondMessages.push(structuredClone(messages))
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })
    harness.now.set(new Date(2026, 3, 25, 19, 12).getTime())

    await harness.runtime.ingest('second send', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(firstMessages[0]?.[1]?.content).toBe('[2026-04-25 18:47] legacy prompt')
    expect(secondMessages[0]?.[1]?.content).toBe('[2026-04-25 18:47] legacy prompt')
    expect(legacyUserMessage.createdAt).toBe(new Date(2026, 3, 25, 18, 47).getTime())
  })

  it('appends system prompt supplement to the provider system message', async () => {
    const harness = createHarness()
    let composedMessages: Message[] = []
    harness.systemPromptSupplement.set('Plugin toolset guidance.')
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'hello' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(composedMessages[0]).toMatchObject({
      role: 'system',
      content: 'system prompt\n\nPlugin toolset guidance.',
    })
  })

  it('creates a system message when only a system prompt supplement is available', async () => {
    const harness = createHarness()
    let composedMessages: Message[] = []
    harness.sessionMessages['session-1'] = []
    harness.systemPromptSupplement.set('Plugin toolset guidance.')
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'hello' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(composedMessages[0]).toMatchObject({
      role: 'system',
      content: 'Plugin toolset guidance.',
    })
    expect(composedMessages[1]).toMatchObject({ role: 'user' })
  })

  it('emits telemetry milestones for a successful voice-backed message round', async () => {
    const harness = createHarness()
    harness.monotonicNow.set([100, 150, 250, 400, 460])
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'assistant reply' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
      await options?.onUsage?.({
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        source: 'reported',
      })
    })

    await harness.runtime.ingest('hello from voice', {
      model: 'gpt-test',
      chatProvider: provider,
      input: {
        type: 'input:text:voice',
        data: {
          transcription: 'hello from voice',
        },
      },
    })

    expect(harness.telemetry.messageSendStarted).toEqual([{
      conversationId: 'session-1',
      roundId: 'user-id',
      source: 'voice',
      model: 'gpt-test',
      turnIndex: 1,
    }])
    expect(harness.telemetry.llmRequestStarted).toEqual([{
      conversationId: 'session-1',
      roundId: 'user-id',
      model: 'gpt-test',
      provider: 'mock-provider',
      hasVoice: true,
      turnIndex: 1,
    }])
    expect(harness.telemetry.llmFirstToken).toEqual([{
      conversationId: 'session-1',
      roundId: 'user-id',
      model: 'gpt-test',
      ttfbMs: 100,
      turnIndex: 1,
    }])
    expect(harness.telemetry.assistantResponseRendered).toEqual([{
      conversationId: 'session-1',
      roundId: 'user-id',
      model: 'gpt-test',
      latencyMs: 250,
      turnIndex: 1,
    }])
    expect(harness.telemetry.llmGeneration).toEqual([{
      conversationId: 'session-1',
      roundId: 'user-id',
      model: 'gpt-test',
      provider: 'mock-provider',
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      usageSource: 'reported',
      turnIndex: 1,
    }])
    expect(harness.telemetry.messageRound).toEqual([{
      conversationId: 'session-1',
      roundId: 'user-id',
      durationMs: 360,
      hasVoice: true,
      inputTokens: 12,
      model: 'gpt-test',
      outputTokens: 8,
      totalTokens: 20,
      turnIndex: 1,
      usageSource: 'reported',
    }])
    expect(harness.telemetry.chatActivationStarted).toEqual([{
      conversationId: 'session-1',
      model: 'gpt-test',
      provider: 'mock-provider',
      roundId: 'user-id',
      source: 'voice',
      turnIndex: 1,
    }])
    expect(harness.telemetry.chatActivationSucceeded).toEqual([{
      conversationId: 'session-1',
      durationMs: 360,
      model: 'gpt-test',
      provider: 'mock-provider',
      roundId: 'user-id',
      source: 'voice',
      turnIndex: 1,
    }])
    expect(harness.telemetry.chatActivationFailed).toEqual([])
  })

  // Review: https://github.com/moeru-ai/airi/pull/2325
  it('pr #2325 treats input:text metadata as text telemetry', async () => {
    const harness = createHarness()

    await harness.runtime.ingest('hello from text input', {
      model: 'gpt-test',
      chatProvider: provider,
      input: {
        type: 'input:text',
        data: {
          text: 'hello from text input',
        },
      },
    })

    expect(harness.telemetry.messageSendStarted).toEqual([
      expect.objectContaining({ source: 'text' }),
    ])
    expect(harness.telemetry.llmRequestStarted).toEqual([
      expect.objectContaining({ hasVoice: false }),
    ])
    expect(harness.telemetry.messageRound).toEqual([
      expect.objectContaining({ hasVoice: false }),
    ])
    expect(harness.userAppended).toEqual([
      expect.objectContaining({ source: 'text' }),
    ])
  })

  // ROOT CAUSE:
  //
  // Activation callbacks were emitted for every chat round, so production
  // `chat_activation_*` volume tracked message traffic instead of the first
  // successful assistant response in a conversation.
  it('emits activation milestones only until the conversation gets its first assistant response', async () => {
    const harness = createHarness()

    await harness.runtime.ingest('first turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    await harness.runtime.ingest('second turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(harness.telemetry.chatActivationStarted).toHaveLength(1)
    expect(harness.telemetry.chatActivationSucceeded).toHaveLength(1)
    expect(harness.telemetry.chatActivationFailed).toHaveLength(0)
    expect(harness.telemetry.messageSendStarted).toHaveLength(2)
    expect(harness.telemetry.messageRound).toHaveLength(2)
  })

  it('emits chat activation failure telemetry without raw provider messages', async () => {
    const harness = createHarness()
    harness.stream.mockRejectedValueOnce(new Error('provider rejected with sensitive details'))

    await expect(harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })).rejects.toThrow('provider rejected')

    expect(harness.telemetry.chatActivationStarted).toEqual([{
      conversationId: 'session-1',
      model: 'gpt-test',
      provider: 'mock-provider',
      roundId: 'user-id',
      source: 'text',
      turnIndex: 1,
    }])
    expect(harness.telemetry.chatActivationSucceeded).toEqual([])
    expect(harness.telemetry.chatActivationFailed).toEqual([{
      conversationId: 'session-1',
      errorCode: 'llm_response_failed',
      failureStage: 'llm_response',
      model: 'gpt-test',
      provider: 'mock-provider',
      roundId: 'user-id',
      source: 'text',
      turnIndex: 1,
    }])
    expect(harness.telemetry.messageRoundFailed).toEqual([{
      conversationId: 'session-1',
      errorCode: 'llm_response_failed',
      failureStage: 'llm_response',
      model: 'gpt-test',
      provider: 'mock-provider',
      roundId: 'user-id',
      source: 'text',
      turnIndex: 1,
    }])
  })

  it('emits a round failure for later turns without repeating activation failure', async () => {
    const harness = createHarness()

    await harness.runtime.ingest('first turn succeeds', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    harness.stream.mockRejectedValueOnce(new Error('later turn rejected'))

    await expect(harness.runtime.ingest('second turn fails', {
      model: 'gpt-test',
      chatProvider: provider,
    })).rejects.toThrow('later turn rejected')

    expect(harness.telemetry.chatActivationFailed).toEqual([])
    expect(harness.telemetry.messageRoundFailed).toEqual([
      expect.objectContaining({
        conversationId: 'session-1',
        errorCode: 'llm_response_failed',
        failureStage: 'llm_response',
        roundId: expect.any(String),
        turnIndex: 2,
      }),
    ])
  })

  it('rejects cancelled queued sends before they start', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const firstSend = harness.runtime.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingest('cancel me', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })
    harness.runtime.cancelPendingSends('session-1')
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3714754876
  it('suppresses completion hooks when an active send session is deleted for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Generation checks protected message mutation during a stream, but the
    // runtime still emitted completion hooks and success analytics after the
    // provider returned for a deleted session.
    const harness = createHarness()
    const completionHook = vi.fn()
    harness.runtime.hooks.onStreamEnd(completionHook)
    harness.runtime.hooks.onAssistantResponseEnd(completionHook)
    harness.runtime.hooks.onAfterSend(completionHook)
    harness.runtime.hooks.onAssistantMessage(completionHook)
    harness.runtime.hooks.onChatTurnComplete(completionHook)

    let finishStream: (() => void) | undefined
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await new Promise<void>((resolve) => {
        finishStream = resolve
      })
      options?.onUsage?.({
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        source: 'reported',
      })
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'deleted reply' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    const pendingSend = harness.runtime.ingest('delete this chat', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    harness.generation.set(2)
    finishStream?.()
    await pendingSend

    expect(completionHook).not.toHaveBeenCalled()
    expect(harness.assistantAppended).toEqual([])
    expect(harness.assistantTurns).toEqual([])
    expect(harness.telemetry.assistantResponseRendered).toEqual([])
    expect(harness.telemetry.llmGeneration).toEqual([])
    expect(harness.telemetry.messageRound).toEqual([])
    expect(harness.telemetry.chatActivationSucceeded).toEqual([])
  })

  it('rejects stale generation sends before they start', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const firstSend = harness.runtime.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingest('stale request', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })
    harness.generation.set(2)
    releaseFirstSend?.()

    await firstSend
    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    expect(harness.stream).toHaveBeenCalledTimes(1)
  })

  it('keeps sending externally writable for UI facades', () => {
    const harness = createHarness()

    harness.runtime.setSending(true)
    expect(harness.runtime.getSending()).toBe(true)
    expect(harness.stateChanges.at(-1)).toEqual({
      activeSendSessionId: 'session-1',
      activeStreamingMessage: undefined,
      sending: true,
      pendingQueuedSendCount: 0,
    })

    harness.runtime.setSending(false)
    expect(harness.runtime.getSending()).toBe(false)
    expect(harness.stateChanges.at(-1)).toEqual({
      activeSendSessionId: undefined,
      activeStreamingMessage: undefined,
      sending: false,
      pendingQueuedSendCount: 0,
    })
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('reports the queued send target while a background session is sending for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Runtime state exposed only a global sending boolean. A window-level sync
    // layer therefore had to infer the owner from the authority's visible
    // session, which is wrong when a follower targets a background session.
    const harness = createHarness()
    let finishSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'background reply' })
      await new Promise<void>((resolve) => {
        finishSend = resolve
      })
    })

    const pendingSend = harness.runtime.ingest('background request', {
      model: 'gpt-test',
      chatProvider: provider,
    }, 'session-2')

    await vi.waitFor(() => {
      expect(harness.stateChanges).toContainEqual(expect.objectContaining({
        activeSendSessionId: 'session-2',
        activeStreamingMessage: expect.objectContaining({
          role: 'assistant',
          createdAt: expect.any(Number),
        }),
        sending: true,
        pendingQueuedSendCount: 0,
      }))
    })
    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.stateChanges).toContainEqual(expect.objectContaining({
        activeSendSessionId: 'session-2',
        activeStreamingMessage: expect.objectContaining({ content: expect.stringContaining('background') }),
      }))
    })

    finishSend?.()
    await pendingSend

    expect(harness.stateChanges.at(-1)).toEqual({
      activeSendSessionId: undefined,
      activeStreamingMessage: undefined,
      sending: false,
      pendingQueuedSendCount: 0,
    })
  })

  it('returns pending queued send snapshots with public fields', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const queuedMessage = 'queued-message-'.repeat(12)
    const firstSend = harness.runtime.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingest(queuedMessage, {
      model: 'gpt-test',
      chatProvider: provider,
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
          text: 'queued input',
        },
      },
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })

    expect(harness.runtime.getPendingQueuedSendSnapshot()).toEqual([
      {
        sessionId: 'session-1',
        generation: 1,
        cancelled: false,
        messagePreview: queuedMessage.slice(0, 120),
        hasAttachments: true,
        inputType: 'input:text',
      },
    ])

    harness.runtime.cancelPendingSends('session-1')
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
  })

  it('handles attachments, reasoning deltas, tool events, and assistant finalization', async () => {
    const harness = createHarness()
    let composedMessages: Message[] = []
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'reasoning-delta', text: 'thinking' })
      await options?.onStreamEvent?.({
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'weather',
        args: {},
      } as StreamEvent)
      await options?.onStreamEvent?.({
        type: 'tool-result',
        toolCallId: 'tool-1',
        result: 'sunny',
      } as StreamEvent)
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'visible reply' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('see image', {
      model: 'gpt-test',
      chatProvider: provider,
      attachments: [
        {
          type: 'image',
          data: 'aW1hZ2U=',
          mimeType: 'image/png',
        },
      ],
    })

    expect(composedMessages[1]?.content).toEqual([
      {
        type: 'text',
        text: '[2026-04-25 18:47] see image',
      },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,aW1hZ2U=',
        },
      },
    ])
    const assistant = harness.sessionMessages['session-1']?.at(-1)
    expect(assistant).toMatchObject({
      role: 'assistant',
      content: 'visible reply',
      categorization: {
        reasoning: 'thinking',
      },
    })
    expect((assistant as StreamingAssistantMessage).slices).toEqual([
      expect.objectContaining({
        type: 'tool-call',
        toolCall: expect.objectContaining({
          toolCallId: 'tool-1',
        }),
      }),
      {
        type: 'text',
        text: 'visible reply',
      },
    ])
    expect((assistant as StreamingAssistantMessage).tool_results).toEqual([
      {
        type: 'tool-call-result',
        id: 'tool-1',
        result: 'sunny',
      },
    ])
    expect(harness.assistantAppended).toHaveLength(1)
    expect(harness.foregroundResets).toHaveLength(1)
  })
})
