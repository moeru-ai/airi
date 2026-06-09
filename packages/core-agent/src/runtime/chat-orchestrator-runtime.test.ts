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
  const assistantAppended: unknown[] = []
  const userCommits: unknown[] = []
  const assistantTurns: unknown[] = []
  // Relative fire order of the user commit vs the assistant append, used to
  // assert the user's cloud upload is enqueued before the assistant's.
  const commitOrder: string[] = []
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
      removeSessionMessage: (sessionId, messageId) => {
        const list = sessionMessages[sessionId]
        if (!list)
          return
        sessionMessages[sessionId] = list.filter(message => message.id !== messageId)
      },
      commitSessionMessage: (sessionId, messageId) => {
        const list = sessionMessages[sessionId]
        if (!list)
          return
        sessionMessages[sessionId] = list.map((message) => {
          if (message.id !== messageId || !message.provisional)
            return message
          const { provisional: _provisional, ...committed } = message
          return committed as ChatHistoryItem
        })
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
    onAssistantMessageAppended: (event) => {
      assistantAppended.push(event)
      commitOrder.push('assistant')
    },
    onUserTurnCommitted: (event) => {
      userCommits.push(event)
      commitOrder.push('user-commit')
    },
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
    userCommits,
    commitOrder,
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
   * Cancelling a queued send resolves it as a no-op (not a rejection) so the
   * UI send-failure path never fires for a deliberate cancellation.
   *
   * A cancelled queued send must resolve, never reject: the awaiting ingest()
   * caller (handleSend in the chat surfaces) shares one catch with genuine send
   * failures, and that catch mutates chat history. The send must also never
   * reach the provider.
   */
  it('resolves cancelled queued sends as a no-op before they start', async () => {
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

    // The cancelled send never ran, so nothing entered history and the caller
    // is told it may rescue the text.
    await expect(secondSend).resolves.toEqual({ rolledBack: true })
    // The cancelled send never invoked the provider.
    expect(harness.stream).toHaveBeenCalledTimes(1)
    await firstSend
  })

  /**
   * @example
   * A queued send made stale by a generation bump (session reset/fork while it
   * waited) is discarded deliberately: it resolves and never streams.
   */
  it('resolves stale generation sends as a no-op before they start', async () => {
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
    // Discarded before it ran: nothing entered history, the caller may rescue.
    await expect(secondSend).resolves.toEqual({ rolledBack: true })
    expect(harness.stream).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * Pressing Stop with a backlog: the active send aborts (persisting a stopped
   * partial) AND the queued send resolves as cancelled, in one stopSending()
   * call. History keeps only the stopped partial: no error turn, nothing dropped.
   */
  it('aborts the active send and resolves a queued send without corrupting history when stop fires with a backlog', async () => {
    const harness = createHarness()

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({
        type: 'text-delta',
        text: 'partial reply before stop',
      })
      await new Promise<void>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const firstSend = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    // A composer send (rescuable) queued behind the active one.
    const queuedSend = harness.runtime.ingest('queued during stream', {
      model: 'gpt-test',
      chatProvider: provider,
      rescuable: true,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })

    harness.runtime.stopSending('session-1')

    // A Stop-cancelled rescuable queued send reports rolledBack so the composer
    // rescues the typed text rather than losing it.
    await expect(queuedSend).resolves.toEqual({ rolledBack: true })
    await firstSend

    // The queued send never streamed; only the active send reached the provider.
    expect(harness.stream).toHaveBeenCalledTimes(1)
    expect(harness.runtime.getPendingQueuedSendCount()).toBe(0)

    // The only assistant turn appended is the stopped partial; no error turn.
    const lastMessage = harness.sessionMessages['session-1']?.at(-1)
    expect(lastMessage).toMatchObject({ role: 'assistant', stopped: true })
    expect(harness.assistantAppended).toHaveLength(1)
    expect(harness.sessionMessages['session-1']?.some(message => message.role === 'error')).toBe(false)
  })

  /**
   * @example
   * Multiple queued sends behind the active one all resolve as cancelled on a
   * single Stop, with none reaching the provider. Guards the N-queued cascade.
   */
  it('resolves every queued send as cancelled when stop fires with multiple queued', async () => {
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
    // Both queued sends are composer sends (rescuable), so each reports rolledBack.
    const secondSend = harness.runtime.ingest('queued b', {
      model: 'gpt-test',
      chatProvider: provider,
      rescuable: true,
    })
    const thirdSend = harness.runtime.ingest('queued c', {
      model: 'gpt-test',
      chatProvider: provider,
      rescuable: true,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(2)
    })

    harness.runtime.stopSending('session-1')
    releaseFirstSend?.()

    // Stop-cancelled queued sends report rolledBack so each composer rescues.
    await expect(secondSend).resolves.toEqual({ rolledBack: true })
    await expect(thirdSend).resolves.toEqual({ rolledBack: true })
    await firstSend
    expect(harness.runtime.getPendingQueuedSendCount()).toBe(0)
    expect(harness.stream).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * A non-rescuable queued send (retry / voice / transport: callers that ignore
   * the outcome) cancelled by Stop also reports rolledBack: unlike a stopped
   * ACTIVE send (where `rescuable` gates retracting an already-appended turn),
   * a queued send never appended anything, so "nothing entered history" is
   * truthful for every caller and ignorable by those that do not consume it.
   */
  it('settles a non-rescuable queued send as rolled back when stop fires with a backlog', async () => {
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
    // No `rescuable`: mirrors retry/voice/transport, which ignore the outcome.
    const queuedSend = harness.runtime.ingest('queued non-rescuable', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })

    harness.runtime.stopSending('session-1')
    releaseFirstSend?.()

    await expect(queuedSend).resolves.toEqual({ rolledBack: true })
    await firstSend
    expect(harness.runtime.getPendingQueuedSendCount()).toBe(0)
    expect(harness.stream).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * A session-scoped stop targeting a different session must NOT abort the
   * in-flight send. Guards the `activeSendSessionId === sessionId` filter.
   */
  it('does not abort the in-flight send when stop targets a different session', async () => {
    const harness = createHarness()
    let releaseSend: (() => void) | undefined
    let aborted = false

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
      signal?.addEventListener('abort', () => {
        aborted = true
      })
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'reply' })
      await new Promise<void>((resolve) => {
        releaseSend = resolve
      })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })

    // Stop a different session: the in-flight send belongs to session-1, so the
    // session-scoped guard must leave it running.
    harness.runtime.stopSending('session-2')
    expect(aborted).toBe(false)

    releaseSend?.()
    await send

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage).toMatchObject({ role: 'assistant' })
    expect(lastMessage.stopped).toBeUndefined()
  })

  /**
   * @example
   * Stop lands in the gap after the stream drains but before the success guard.
   * The turn is treated as completed (no `stopped` marker, turn-complete hooks
   * fire) and the parser's residual lookahead tail is preserved: a late abort
   * during the final flush must not truncate an already-complete reply.
   */
  it('persists a completed turn with the full text when stop lands in the post-stream gap', async () => {
    const harness = createHarness()
    const turnCompleteHooks: string[] = []
    harness.runtime.hooks.onChatTurnComplete(async () => {
      turnCompleteHooks.push('turn-complete')
    })
    const tokenLiteralHooks: string[] = []
    harness.runtime.hooks.onTokenLiteral(async (literal) => {
      tokenLiteralHooks.push(literal)
    })

    const fullReply = 'this reply is long enough to cross the streaming flush threshold and leave a tail'

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: fullReply })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
      // Stop fires in the gap after the stream drains but before parser.end().
      harness.runtime.stopSending('session-1')
    })

    await harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.role).toBe('assistant')
    // Treated as a completed turn: no stopped marker, turn-complete hooks fired,
    // rendered telemetry recorded.
    expect(lastMessage.stopped).toBeUndefined()
    expect(turnCompleteHooks).toEqual(['turn-complete'])
    expect(harness.telemetry.assistantResponseRendered).toHaveLength(1)
    // The buffered lookahead tail is preserved.
    expect(lastMessage.content).toBe(fullReply)
    const concatenated = lastMessage.slices
      .filter((slice): slice is { type: 'text', text: string } => slice.type === 'text')
      .map(slice => slice.text)
      .join('')
    expect(concatenated).toBe(fullReply)

    // The tail flushed after the abort lands in the persisted message but is NOT
    // re-fed to token hooks (TTS/captions): the streamed prefix reached the
    // hooks, the post-abort tail did not.
    const streamedToHooks = tokenLiteralHooks.join('')
    expect(streamedToHooks.length).toBeGreaterThan(0)
    expect(streamedToHooks).not.toBe(fullReply)
    expect(fullReply.startsWith(streamedToHooks)).toBe(true)
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

    await expect(secondSend).resolves.toEqual({ rolledBack: true })
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

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
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
  })

  /**
   * @example
   * Stop aborts the request, but an SSE/fetch adapter can still dispatch text
   * deltas it had already read off the socket before the stream promise
   * rejects. Those post-Stop tokens must stay out of `fullText` and the parser,
   * so the persisted partial ends exactly where the user cancelled instead of
   * absorbing tokens that landed after the click.
   */
  it('drops text deltas that arrive after stop so the persisted partial ends at the cancel point', async () => {
    const harness = createHarness()

    const beforeStop = 'reply tokens that arrived before the user pressed stop'
    const afterStop = ' EXTRA TOKENS AFTER STOP'

    // Resolves once the pre-Stop token has been fed to the parser and the
    // stream is parked, so the test aborts strictly after that point.
    let reachedStopPoint: () => void
    const atStopPoint = new Promise<void>((resolve) => {
      reachedStopPoint = resolve
    })

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
      await options?.onStreamEvent?.({ type: 'text-delta', text: beforeStop })
      reachedStopPoint()

      // Park until Stop aborts the request.
      await new Promise<void>((resolve) => {
        if (signal?.aborted)
          resolve()
        else
          signal?.addEventListener('abort', () => resolve())
      })

      // The adapter surfaces a delta that was buffered before the abort
      // propagated, after the signal is already aborted.
      await options?.onStreamEvent?.({ type: 'text-delta', text: afterStop })

      // The stream finally tears down and surfaces the cancellation.
      throw new DOMException('aborted', 'AbortError')
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await atStopPoint
    harness.runtime.stopSending('session-1')

    await send

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.role).toBe('assistant')
    expect(lastMessage.stopped).toBe(true)
    // The persisted partial carries the pre-Stop content only.
    expect(lastMessage.content).toBe(beforeStop)
    expect(lastMessage.content).not.toContain('AFTER STOP')
    const concatenated = lastMessage.slices
      .filter((slice): slice is { type: 'text', text: string } => slice.type === 'text')
      .map(slice => slice.text)
      .join('')
    expect(concatenated).toBe(beforeStop)
    // The text reported to subscribers (cloud sync, analytics) also stops at
    // the cancel point.
    const appended = harness.assistantAppended.at(-1) as { messageText: string }
    expect(appended.messageText).toBe(beforeStop)
  })

  /**
   * @example
   * The user clicks Stop before any token has flushed (network slow, or
   * cancelling right after pressing Send). No partial assistant message is
   * persisted because the slice buffer is empty, and the foreground bubble is
   * cleared when the send settles.
   */
  it('clears foreground stream without persisting assistant turn when no slices have flushed', async () => {
    const harness = createHarness()

    // NOTICE:
    // Mock the stream to hang on the abort signal without ever emitting a
    // text-delta. The orchestrator's guard at the abort branch suppresses
    // persistence when buildingMessage.slices is empty.
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
    expect(harness.foregroundResets.length).toBeGreaterThan(0)
  })

  /**
   * @example
   * A reasoning model streams only reasoning tokens, then the user stops before
   * any speech or tool slice flushes. The partial persists with stopped: true
   * and the reasoning preserved, rather than vanishing.
   */
  it('persists a reasoning-only partial with stopped marker when stop fires before any slice', async () => {
    const harness = createHarness()

    let reachedStopPoint: () => void
    const atStopPoint = new Promise<void>((resolve) => {
      reachedStopPoint = resolve
    })

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
      await options?.onStreamEvent?.({ type: 'reasoning-delta', text: 'weighing the options before answering' })
      reachedStopPoint()
      await new Promise<void>((resolve) => {
        if (signal?.aborted)
          resolve()
        else
          signal?.addEventListener('abort', () => resolve())
      })
      throw new DOMException('aborted', 'AbortError')
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await atStopPoint
    harness.runtime.stopSending('session-1')
    await send

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.role).toBe('assistant')
    expect(lastMessage.stopped).toBe(true)
    expect(lastMessage.slices).toEqual([])
    expect(lastMessage.categorization?.reasoning).toContain('weighing the options')
  })

  /**
   * @example
   * The user stops mid tool call, after the tool-call slice rendered but before
   * its result. The partial persists with stopped: true and the tool-call slice
   * intact (no result), so the UI can render it as cancelled.
   */
  it('persists a tool-call-only partial with stopped marker when stop fires mid tool call', async () => {
    const harness = createHarness()

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
      await options?.onStreamEvent?.({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolCallType: 'function',
        toolName: 'search',
        args: JSON.stringify({ query: 'weather' }),
      })
      await new Promise<void>((resolve) => {
        if (signal?.aborted)
          resolve()
        else
          signal?.addEventListener('abort', () => resolve())
      })
      throw new DOMException('aborted', 'AbortError')
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    // The tool-call slice drains through the async queue; wait until it lands in
    // the foreground bubble before stopping.
    await vi.waitFor(() => {
      const patched = harness.foregroundPatches.some(message => message.slices?.some(slice => slice.type === 'tool-call'))
      expect(patched).toBe(true)
    })

    harness.runtime.stopSending('session-1')
    await send

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.role).toBe('assistant')
    expect(lastMessage.stopped).toBe(true)
    const toolCallSlices = lastMessage.slices.filter(slice => slice.type === 'tool-call')
    expect(toolCallSlices).toHaveLength(1)
    expect(lastMessage.tool_results).toEqual([])
  })

  /**
   * @example
   * The assistant emits a short text-delta that stays under the parser's
   * streaming flush threshold. On Stop, the catch-path flush drains the
   * parser buffer so the full short reply persists with stopped: true.
   */
  it('persists short stopped reply by flushing parser buffer on abort', async () => {
    const harness = createHarness()

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'short reply' })
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

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage).toMatchObject({
      role: 'assistant',
      stopped: true,
      content: 'short reply',
    })
    expect(lastMessage.slices).toEqual([
      { type: 'text', text: 'short reply' },
    ])
  })

  /**
   * @example
   * A reply exceeding the streaming flush threshold leaves a short tail in the
   * parser's lookahead buffer (retained for partial-marker detection). The
   * catch-path flush emits that tail so the persisted message is byte-complete.
   */
  it('persists the buffered tail of a stopped reply that exceeds the flush threshold', async () => {
    const harness = createHarness()

    const fullReply = 'this reply is long enough to cross the streaming flush threshold and leave a tail'

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: fullReply })
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

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.content).toBe(fullReply)
    const concatenated = lastMessage.slices
      .filter((slice): slice is { type: 'text', text: string } => slice.type === 'text')
      .map(slice => slice.text)
      .join('')
    expect(concatenated).toBe(fullReply)
  })

  /**
   * @example
   * onEnd computes the categorization (speech vs reasoning split). The flush
   * runs end() inside the abort branch so stopped messages carry the same
   * categorization shape as completed ones.
   */
  it('populates categorization on stopped messages', async () => {
    const harness = createHarness()

    const reply = 'short reply'

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: reply })
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

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.categorization).toBeDefined()
    expect(lastMessage.categorization?.speech).toBe(reply)
  })

  /**
   * @example
   * Stop arrives while the parser is mid-marker (inside `<|...`). The marker
   * parser's end() only flushes when not in a tag, so the partial-tag bytes
   * stay out of the persisted slice list while the speech prefix before the
   * opening marker is preserved.
   */
  it('drops in-progress tag fragment when stopped mid-marker', async () => {
    const harness = createHarness()

    const prefix = 'speech before the marker '
    const partialMarker = '<|incomplete'

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: prefix + partialMarker })
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

    const lastMessage = harness.sessionMessages['session-1']?.at(-1) as StreamingAssistantMessage
    expect(lastMessage.content).not.toContain(partialMarker)
    const concatenated = lastMessage.slices
      .filter((slice): slice is { type: 'text', text: string } => slice.type === 'text')
      .map(slice => slice.text)
      .join('')
    expect(concatenated).not.toContain(partialMarker)
    expect(concatenated).toBe(prefix)
  })

  /**
   * @example
   * Stop fires before any text-delta lands. The flush has no buffered content,
   * the slice gate skips persistence, and assistantResponseRendered (success-
   * path-only) does not fire.
   */
  it('leaves no message persisted and no rendered-telemetry when stop fires before any text-delta', async () => {
    const harness = createHarness()

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
    expect(harness.telemetry.assistantResponseRendered).toEqual([])
  })

  /**
   * @example
   * Stop fires before any slice or reasoning lands. The user turn is provisional
   * until output arrives, so it is retracted rather than left as a reply-less
   * orphan, `ingest` resolves with `rolledBack: true`, and the deferred commit
   * side effects never fire.
   */
  it('retracts the provisional user turn and reports rolledBack when a rescuable send is stopped before any output', async () => {
    const harness = createHarness()

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await new Promise<void>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })

    // `rescuable` mirrors a composer send: the caller restores the text, so the
    // turn may be retracted on a stop-before-output.
    const send = harness.runtime.ingest('a stopped prompt', {
      model: 'gpt-test',
      chatProvider: provider,
      rescuable: true,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })

    harness.runtime.stopSending('session-1')
    const outcome = await send

    expect(outcome.rolledBack).toBe(true)
    // The user message is gone; only the seeded system message remains.
    expect(harness.sessionMessages['session-1']?.map(message => message.role)).toEqual(['system'])
    expect(harness.assistantAppended).toHaveLength(0)
    // A retracted turn must not run the deferred cloud/autonomous side effects.
    expect(harness.userCommits).toHaveLength(0)
  })

  /**
   * @example
   * A non-rescuable send (retry / voice / transport: callers that ignore the
   * outcome) stopped before any output KEEPS its user turn instead of deleting
   * text no caller would rescue.
   */
  it('keeps the user turn (no retract) when a non-rescuable send is stopped before any output', async () => {
    const harness = createHarness()

    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await new Promise<void>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })

    // No `rescuable`: mirrors retry/voice, which do not consume the outcome.
    const send = harness.runtime.ingest('a stopped prompt', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })

    harness.runtime.stopSending('session-1')
    const outcome = await send

    expect(outcome.rolledBack).toBe(false)
    // The user turn survives the stop rather than being silently deleted.
    expect(harness.sessionMessages['session-1']?.some(message => message.role === 'user')).toBe(true)
    expect(harness.userCommits).toHaveLength(1)
  })

  /**
   * @example
   * A normal completion keeps the user turn and reports `rolledBack: false`, and
   * the commit hook fires exactly once so cloud upload / autonomous tasks run.
   */
  it('commits the user turn on a clean finish', async () => {
    const harness = createHarness()

    const outcome = await harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(outcome.rolledBack).toBe(false)
    expect(harness.sessionMessages['session-1']?.some(message => message.role === 'user')).toBe(true)
    expect(harness.userCommits).toHaveLength(1)
    // The user turn commits BEFORE the assistant is appended, so the user's
    // cloud upload is enqueued ahead of the assistant's (preserving order).
    expect(harness.commitOrder).toEqual(['user-commit', 'assistant'])
  })

  /**
   * @example
   * A reasoning-only stop still produces output (the stopped partial), so the
   * user turn commits rather than retracting.
   */
  it('commits the user turn when a stop still produced a reasoning-only partial', async () => {
    const harness = createHarness()

    let reachedStopPoint: () => void
    const atStopPoint = new Promise<void>((resolve) => {
      reachedStopPoint = resolve
    })
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'reasoning-delta', text: 'thinking' })
      reachedStopPoint()
      await new Promise<void>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal })?.abortSignal
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await atStopPoint
    harness.runtime.stopSending('session-1')
    const outcome = await send

    expect(outcome.rolledBack).toBe(false)
    expect(harness.sessionMessages['session-1']?.some(message => message.role === 'user')).toBe(true)
    expect(harness.userCommits).toHaveLength(1)
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
   * The user presses Stop before `deps.llm.stream()` is invoked. The
   * pre-stream `shouldAbort()` checkpoint should skip the provider call and
   * clear the foreground assistant bubble.
   */
  it('skips the LLM stream call when stop is pressed before the provider request', async () => {
    const harness = createHarness()

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
    expect(harness.assistantAppended).toHaveLength(0)
    expect(harness.foregroundResets.length).toBeGreaterThan(0)
    expect(harness.runtime.getSending()).toBe(false)
  })

  /**
   * @example
   * A previous assistant turn was cancelled and persisted with
   * `stopped: true`. When the next user message is sent, the runtime must
   * strip `stopped` (along with the other runtime-only fields) from the
   * provider-bound message so strict OpenAI-style gateways do not reject
   * the request on unknown properties.
   */
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

  /**
   * @example
   * The user turn is appended with `provisional: true` so sync layers (cloud
   * outbox, reconcile sweep) skip it while the send can still be retracted;
   * the marker is cleared once the turn commits. Without the marker, a
   * reconcile sweep running mid-send uploads the turn, a stop-before-output
   * then retracts it locally only, and the next catch-up pull resurrects the
   * retracted text.
   */
  it('marks the in-flight user turn provisional and clears the marker at commit', async () => {
    const harness = createHarness()

    let releaseOutput: (() => Promise<void>) | undefined
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await new Promise<void>((resolve) => {
        releaseOutput = async () => {
          await options?.onStreamEvent?.({ type: 'text-delta', text: 'a reply long enough to cross the streaming flush threshold' })
          await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
          resolve()
        }
      })
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.sessionMessages['session-1']?.some(message => message.role === 'user')).toBe(true)
    })
    const inFlightTurn = harness.sessionMessages['session-1']?.find(message => message.role === 'user')
    expect(inFlightTurn?.provisional).toBe(true)
    expect(harness.userCommits).toHaveLength(0)

    await releaseOutput!()
    await send

    const committedTurn = harness.sessionMessages['session-1']?.find(message => message.role === 'user')
    expect(committedTurn?.provisional).toBeUndefined()
    expect(harness.userCommits).toHaveLength(1)
  })

  /**
   * @example
   * The retract window closes at first output, so the commit (cloud upload,
   * autonomous tasks) fires right then, concurrently with the rest of the
   * stream, instead of waiting for it to drain. It still fires exactly once
   * and ahead of the assistant append.
   */
  it('commits the user turn at first output while the stream is still in flight', async () => {
    const harness = createHarness()

    let finishStream: (() => Promise<void>) | undefined
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'a reply long enough to cross the streaming flush threshold' })
      await new Promise<void>((resolve) => {
        finishStream = async () => {
          await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
          resolve()
        }
      })
    })

    const send = harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    // The commit lands while the provider stream is still parked.
    await vi.waitFor(() => {
      expect(harness.userCommits).toHaveLength(1)
    })
    const userTurn = harness.sessionMessages['session-1']?.find(message => message.role === 'user')
    expect(userTurn?.provisional).toBeUndefined()

    await finishStream!()
    await send

    expect(harness.userCommits).toHaveLength(1)
    expect(harness.commitOrder).toEqual(['user-commit', 'assistant'])
  })
})
