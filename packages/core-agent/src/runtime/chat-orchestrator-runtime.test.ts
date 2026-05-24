import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem, ContextMessage, StreamingAssistantMessage } from '../types/chat'
import type { StreamEvent } from '../types/llm'

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
    messageSendStarted: [] as unknown[],
    llmRequestStarted: [] as unknown[],
    llmFirstToken: [] as unknown[],
    assistantResponseRendered: [] as unknown[],
    messageRound: [] as unknown[],
  }
  const stream = vi.fn(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options?: {
    onStreamEvent?: (event: StreamEvent) => Promise<void> | void
  }) => {
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
    onMessageSendStarted: event => telemetry.messageSendStarted.push(event),
    onLlmRequestStarted: event => telemetry.llmRequestStarted.push(event),
    onLlmFirstToken: event => telemetry.llmFirstToken.push(event),
    onAssistantResponseRendered: event => telemetry.assistantResponseRendered.push(event),
    onMessageRound: event => telemetry.messageRound.push(event),
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

/**
 * @example
 * const runtime = createChatOrchestratorRuntime(deps)
 * await runtime.ingest('hello', { model, chatProvider })
 */
describe('createChatOrchestratorRuntime', () => {
  /**
   * @example
   * Hook order and prompt composition stay compatible with the stage-ui facade.
   */
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

  /**
   * @example
   * deps.getSystemPromptSupplement() returns tool guidance.
   * The runtime appends it to the existing provider system message.
   */
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

  /**
   * @example
   * A session has only user history.
   * The runtime creates a provider system message for supplemental guidance.
   */
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

  /**
   * @example
   * Runtime telemetry callbacks expose client-visible latency milestones.
   */
  it('emits telemetry milestones for a successful voice-backed message round', async () => {
    const harness = createHarness()
    harness.monotonicNow.set([100, 150, 250, 400, 460])

    await harness.runtime.ingest('hello from voice', {
      model: 'gpt-test',
      chatProvider: provider,
      input: {
        type: 'input:text',
        data: {
          text: 'hello from voice',
        },
      },
    })

    expect(harness.telemetry.messageSendStarted).toEqual([{
      source: 'voice',
      model: 'gpt-test',
    }])
    expect(harness.telemetry.llmRequestStarted).toEqual([{
      model: 'gpt-test',
      provider: 'mock-provider',
      hasVoice: true,
    }])
    expect(harness.telemetry.llmFirstToken).toEqual([{
      model: 'gpt-test',
      ttfbMs: 100,
    }])
    expect(harness.telemetry.assistantResponseRendered).toEqual([{
      model: 'gpt-test',
      latencyMs: 250,
    }])
    expect(harness.telemetry.messageRound).toEqual([{
      durationMs: 360,
      hasVoice: true,
      model: 'gpt-test',
    }])
  })

  /**
   * @example
   * Cancelling a queued send rejects only pending work that has not started.
   */
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

  /**
   * @example
   * A queued send rejects if its captured session generation becomes stale.
   */
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

  /**
   * @example
   * runtime.setSending(true)
   * expect(runtime.getSending()).toBe(true)
   */
  it('keeps sending externally writable for UI facades', () => {
    const harness = createHarness()

    harness.runtime.setSending(true)
    expect(harness.runtime.getSending()).toBe(true)
    expect(harness.stateChanges.at(-1)).toEqual({
      sending: true,
      pendingQueuedSendCount: 0,
    })

    harness.runtime.setSending(false)
    expect(harness.runtime.getSending()).toBe(false)
    expect(harness.stateChanges.at(-1)).toEqual({
      sending: false,
      pendingQueuedSendCount: 0,
    })
  })

  /**
   * @example
   * const snapshot = runtime.getPendingQueuedSendSnapshot()
   * expect(snapshot[0].inputType).toBe('input:text')
   */
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

  /**
   * @example
   * The user clicks Stop mid-stream after the assistant has emitted
   * some text. The orchestrator persists the partial turn with a
   * `stopped` marker and does NOT fire turn-complete hooks.
   */
  it('persists partial assistant turn with stopped marker when user aborts mid-stream', async () => {
    const harness = createHarness()
    const postStreamHooks: string[] = []
    const stopHookMessages: string[] = []
    let appendedCountAtStop = -1

    harness.runtime.hooks.onStreamEnd(async () => {
      postStreamHooks.push('stream-end')
    })
    harness.runtime.hooks.onAssistantResponseEnd(async () => {
      postStreamHooks.push('assistant-end')
    })
    harness.runtime.hooks.onAfterSend(async () => {
      postStreamHooks.push('after-send')
    })
    harness.runtime.hooks.onAssistantMessage(async () => {
      postStreamHooks.push('assistant-message')
    })
    harness.runtime.hooks.onChatTurnComplete(async () => {
      postStreamHooks.push('turn-complete')
    })
    harness.runtime.hooks.onAssistantStop(async (messageText) => {
      // Capture how many assistant persists happened by the time the stop
      // hook fires; the orchestrator persists the stopped turn FIRST and
      // only then emits onAssistantStop, so Stage.vue/captions/mods always
      // see the persisted partial before they reset their side effects.
      appendedCountAtStop = harness.assistantAppended.length
      stopHookMessages.push(messageText)
    })

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      // NOTICE:
      // Text length must exceed STREAMING_UI_FLUSH_CHUNK_SIZE (24) so the
      // marker parser flushes a slice synchronously before we hang on the
      // abort signal. Without that flush, buildingMessage.slices is empty
      // and the abort path correctly skips persistence, which would not
      // exercise the stopped-marker contract under test.
      await options?.onStreamEvent?.({
        type: 'text-delta',
        text: 'partial assistant reply before the user pressed stop',
      })
      await new Promise<void>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
        signal?.addEventListener('abort', () => {
          // xsai/fetch surfaces user-initiated cancellation as an AbortError.
          // The orchestrator's catch block branches on signal.aborted, not on
          // error.name, so any thrown value is fine; we use a realistic shape.
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })

    harness.runtime.stopSending('session-1')

    await send

    const lastMessage = harness.sessionMessages['session-1']?.at(-1)
    expect(lastMessage).toMatchObject({
      role: 'assistant',
      stopped: true,
    })
    expect((lastMessage as StreamingAssistantMessage).slices.length).toBeGreaterThan(0)
    expect(harness.assistantAppended).toHaveLength(1)
    expect(postStreamHooks).toEqual([])
    expect(harness.telemetry.assistantResponseRendered).toEqual([])
    expect(harness.foregroundResets.length).toBeGreaterThan(0)
    expect(stopHookMessages).toHaveLength(1)
    expect(stopHookMessages[0]).toBe('partial assistant reply before the user pressed stop')
    expect(appendedCountAtStop).toBe(1)
  })

  /**
   * @example
   * The user clicks Stop before any token has flushed (network slow, or
   * cancelling right after pressing Send). No partial assistant message is
   * persisted because the slice buffer is empty, but `onAssistantStop`
   * still fires so the TTS session opened in `onBeforeMessageComposed`
   * can tear down.
   */
  it('still fires onAssistantStop even when no slices have flushed', async () => {
    const harness = createHarness()

    let stopHookCount = 0
    let stopMessageText: string | undefined
    harness.runtime.hooks.onAssistantStop(async (messageText) => {
      stopHookCount += 1
      stopMessageText = messageText
    })

    // NOTICE:
    // Mock the stream to hang on the abort signal without ever emitting a
    // text-delta. The orchestrator's guard at the abort branch suppresses
    // persistence when buildingMessage.slices is empty, so this exercises
    // the path where onAssistantStop fires alone (no onAssistantMessageAppended).
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await new Promise<void>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })

    harness.runtime.stopSending('session-1')

    await send

    expect(harness.assistantAppended).toHaveLength(0)
    const lastMessage = harness.sessionMessages['session-1']?.at(-1)
    expect((lastMessage as ChatHistoryItem | undefined)?.role).not.toBe('assistant')
    expect(stopHookCount).toBe(1)
    expect(stopMessageText).toBe('')
  })

  /**
   * @example
   * A normally-completed assistant turn must NOT trigger `onAssistantStop`.
   * `onAssistantStop` is reserved for user-initiated cancellation; firing
   * it on success would make subscribers (TTS, captions, motion) reset
   * mid-finalize.
   */
  it('does not fire onAssistantStop on a normally-completed turn', async () => {
    const harness = createHarness()

    let stopHookCount = 0
    harness.runtime.hooks.onAssistantStop(async () => {
      stopHookCount += 1
    })

    await harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(stopHookCount).toBe(0)
    expect(harness.assistantAppended).toHaveLength(1)
  })

  /**
   * @example
   * `clearHooks()` must drop every bucket, including the newly-added
   * `onAssistantStop` bucket. If it leaked, subscribers from a previous
   * Stage.vue mount or a torn-down mods plugin would keep firing on the
   * next stop.
   */
  it('clearHooks drops the onAssistantStop subscriber', async () => {
    const harness = createHarness()

    let stopHookCount = 0
    harness.runtime.hooks.onAssistantStop(async () => {
      stopHookCount += 1
    })

    harness.runtime.hooks.clearHooks()

    await harness.runtime.hooks.emitAssistantStopHooks('any text', {
      message: { role: 'assistant', content: '', slices: [], tool_results: [] } as StreamingAssistantMessage,
      contexts: {},
      composedMessage: [],
    })

    expect(stopHookCount).toBe(0)
  })

  /**
   * @example
   * Attachments, reasoning deltas, and tool events update the assistant builder.
   */
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

  /**
   * @example
   * The user presses Stop after `onBeforeMessageComposed` has already opened
   * a TTS session but before `deps.llm.stream()` is invoked. The pre-stream
   * `shouldAbort()` checkpoint must still fire `onAssistantStop` so the
   * leaked TTS session, captions, and any other subscriber resources can
   * tear down.
   */
  // ROOT CAUSE:
  //
  // Pre-stream `shouldAbort()` returns at lines 397/452/614 of
  // chat-orchestrator-runtime.ts used to `return` without firing
  // `emitAssistantStopHooks`. The hook was only fired from inside the
  // catch block, which is only entered when `deps.llm.stream()` itself
  // throws AbortError. If the stop landed before that call, every
  // resource opened by `emitBeforeMessageComposedHooks` (TTS session,
  // captions, motion) was leaked.
  //
  // Fix: move `emitAssistantStopHooks` into the `finally` block, gated
  // by `sendController.signal.aborted`, so every abort path notifies.
  it('fires onAssistantStop even when stop is pressed before the LLM stream call', async () => {
    const harness = createHarness()

    let stopHookCount = 0
    harness.runtime.hooks.onAssistantStop(async () => {
      stopHookCount += 1
    })

    // NOTICE:
    // Trigger the stop from inside `onBeforeSend`, which fires after
    // composition but before `deps.llm.stream()`. The next `shouldAbort()`
    // checkpoint then returns early, never entering the stream.
    harness.runtime.hooks.onBeforeSend(async () => {
      harness.runtime.stopSending('session-1')
    })

    await harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(harness.stream).not.toHaveBeenCalled()
    expect(stopHookCount).toBe(1)
    expect(harness.assistantAppended).toHaveLength(0)
  })

  /**
   * @example
   * A previous assistant turn was cancelled and persisted with
   * `stopped: true`. When the next user message is sent, the runtime must
   * strip `stopped` from the provider-bound message so strict OpenAI-style
   * gateways do not reject the request on unknown properties.
   */
  // ROOT CAUSE:
  //
  // buildProviderMessages() in chat-orchestrator-runtime.ts only stripped
  // `slices`, `tool_results`, and `categorization` from assistant
  // messages. `stopped` is session-state (UI badge, retry, "this turn
  // was cancelled" context), not a wire-protocol field, so it must also
  // be stripped before the message goes to the provider.
  it('strips `stopped` from provider-bound assistant messages', async () => {
    const harness = createHarness()
    harness.sessionMessages['session-1'].push({
      role: 'assistant',
      content: 'partial reply',
      slices: [{ type: 'text', text: 'partial reply' }],
      tool_results: [],
      stopped: true,
      createdAt: new Date(2026, 3, 25, 18, 10).getTime(),
      id: 'prev-assistant',
    } as StreamingAssistantMessage)

    let composedMessages: Message[] = []
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'follow-up' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('continue please', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    const assistantInPrompt = composedMessages.find(message => message.role === 'assistant')
    expect(assistantInPrompt).toBeDefined()
    expect(assistantInPrompt).toMatchObject({
      role: 'assistant',
      content: 'partial reply',
    })
    expect(assistantInPrompt).not.toHaveProperty('stopped')
    expect(assistantInPrompt).not.toHaveProperty('slices')
    expect(assistantInPrompt).not.toHaveProperty('tool_results')
  })
})
