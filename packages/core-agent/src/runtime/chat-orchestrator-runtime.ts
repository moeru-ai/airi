import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { AgentContextPort } from '../contracts/context-port'
import type { AgentForegroundStreamPort } from '../contracts/stream-port'
import type { ChatHistoryItem, ChatSlices, ChatStreamEventContext, ContextMessage, StreamingAssistantMessage } from '../types/chat'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { createQueue } from '@proj-airi/stream-kit'

import { formatContextPromptText } from '../messages/context-prompt'
import { formatTimePrefix } from '../messages/datetime-prefix'
import { createChatHooks } from './agent-hooks'
import { useLlmmarkerParser } from './llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from './response-categoriser'

const STREAMING_UI_FLUSH_CHUNK_SIZE = 24

function prependTextToContent<T extends { content?: unknown }>(msg: T, text: string): T {
  const content = msg.content
  if (content === undefined)
    return { ...msg, content: text }
  if (typeof content === 'string')
    return { ...msg, content: `${text}${content}` }

  if (Array.isArray(content)) {
    const first = content[0] as { type?: string, text?: string } | undefined
    if (first && first.type === 'text' && typeof first.text === 'string') {
      const next = [{ ...first, text: `${text}${first.text}` }, ...content.slice(1)]
      return { ...msg, content: next }
    }
    return { ...msg, content: [{ type: 'text', text }, ...content] }
  }

  return msg
}

function cloneStreamingMessage(message: StreamingAssistantMessage): StreamingAssistantMessage {
  try {
    return structuredClone(message)
  }
  catch {
    return JSON.parse(JSON.stringify(message)) as StreamingAssistantMessage
  }
}

/**
 * Options accepted by the chat orchestrator runtime for one user send.
 */
export interface ChatOrchestratorSendOptions {
  /** Provider model identifier used for the outbound LLM request. */
  model: string
  /** Concrete chat provider implementation selected by the caller. */
  chatProvider: ChatProvider
  /** Provider-specific request options, currently used for headers. */
  providerConfig?: Record<string, unknown>
  /** Image attachments appended to the user message content parts. */
  attachments?: { type: 'image', data: string, mimeType: string }[]
  /** Tool definitions passed through to the LLM stream port. */
  tools?: StreamOptions['tools']
  /** Original transport input metadata used by bridge/devtools observers. */
  input?: ChatStreamEventContext['input']
  /**
   * Set only by the composer, which restores the typed text on `rolledBack`.
   * When unset, a stop before any output keeps the user turn rather than
   * deleting text no caller would catch (retry, voice, transport).
   * @default false
   */
  rescuable?: boolean
}

/**
 * Result of one send, letting the caller react to a turn that never landed
 * (e.g. rescue the typed text back into the composer instead of losing it).
 */
export interface SendOutcome {
  /**
   * True when the send left nothing in history: the user turn was retracted
   * (a rescuable send stopped before any output) or the queued send was
   * cancelled / discarded as stale before it ever ran. The caller can put the
   * typed text back without duplicating a committed turn.
   */
  rolledBack: boolean
}

interface QueuedSend {
  sendingMessage: string
  options: ChatOrchestratorSendOptions
  generation: number
  sessionId: string
  cancelled?: boolean
  deferred: {
    resolve: (outcome: SendOutcome) => void
    reject: (error: unknown) => void
  }
}

/**
 * Serializable view of a queued send waiting to be processed.
 */
export interface QueuedSendSnapshot {
  /** Session that owns the queued send. */
  sessionId: string
  /** Session generation captured when the send was enqueued. */
  generation: number
  /** Whether the queued send was cancelled (resolved without running) before execution. */
  cancelled: boolean
  /** First 120 characters of the pending user message. */
  messagePreview: string
  /** Whether the queued send carries image attachments. */
  hasAttachments: boolean
  /** Optional input event type for transport-originated sends. */
  inputType?: NonNullable<ChatStreamEventContext['input']>['type']
}

/**
 * Session operations required by the core chat orchestrator runtime.
 */
export interface ChatOrchestratorSessionPort {
  /** Ensures a session exists before messages are appended. */
  ensureSession: (sessionId: string) => void
  /** Returns chronological chat history for a session. */
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
  /** Appends a finalized user/assistant/tool history item. */
  appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void
  /** Removes a history item by id (persisted + broadcast) to retract a stopped user turn. */
  removeSessionMessage: (sessionId: string, messageId: string) => void
  /** Clears the `provisional` marker from a user turn once it commits, so sync layers may upload it. */
  commitSessionMessage: (sessionId: string, messageId: string) => void
  /** Returns a monotonic generation used to reject stale queued sends. */
  getSessionGeneration: (sessionId: string) => number
}

/**
 * LLM streaming boundary used by the core chat orchestrator runtime.
 */
export interface ChatOrchestratorLLMPort {
  /** Streams one composed chat request and emits normalized stream events. */
  stream: (model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) => Promise<void>
}

/**
 * Lifecycle record emitted around prompt composition.
 */
export interface ChatOrchestratorLifecycleRecord {
  /** Composition phase being observed. */
  phase: 'before-compose' | 'prompt-context-built' | 'after-compose'
  /** Logical event channel for context observability. */
  channel: 'chat'
  /** Session associated with this send. */
  sessionId: string
  /** Optional compact preview of the user text. */
  textPreview?: string
  /** Phase-specific payload for devtools and diagnostics. */
  details?: unknown
}

/**
 * Prompt projection emitted after the runtime has composed provider messages.
 */
export interface ChatOrchestratorPromptProjection {
  /** Session associated with the projected prompt. */
  sessionId: string
  /** Raw user message text that triggered the prompt. */
  message: string
  /** Active context snapshot read during prompt composition. */
  contexts: Record<string, ContextMessage[]>
  /** Historical standalone context prompt shape, kept for compatibility. */
  promptMessage?: Message | null
  /** Provider-ready message array sent to the LLM port. */
  composedMessage?: Message[]
}

/**
 * Reactive state mirrored by UI facades.
 */
export interface ChatOrchestratorRuntimeState {
  /** Whether the runtime currently owns an active send. */
  sending: boolean
  /** Number of sends waiting behind the active one. */
  pendingQueuedSendCount: number
}

/**
 * Dependency surface used by the platform-agnostic chat orchestrator runtime.
 */
export interface ChatOrchestratorRuntimeDeps {
  /** Session persistence and generation guard port. */
  session: ChatOrchestratorSessionPort
  /** Context registry facade used for runtime context ingest and prompt snapshots. */
  context: Pick<AgentContextPort, 'ingest' | 'snapshot'>
  /** Foreground assistant stream port controlled by the UI facade. */
  foregroundStream: AgentForegroundStreamPort
  /** Provider-agnostic LLM streaming port. */
  llm: ChatOrchestratorLLMPort
  /** Returns the currently visible session ID. */
  getActiveSessionId: () => string
  /** Returns the currently active provider ID for categorization policy. */
  getActiveProvider: () => string | undefined
  /** Returns optional prompt text appended to the provider system message for this send. */
  getSystemPromptSupplement?: () => string | undefined
  /** Runtime context providers ingested immediately before prompt composition. */
  runtimeContextProviders?: Array<() => ContextMessage | null | undefined>
  /** Clock used for persisted message timestamps. @default Date.now */
  now?: () => number
  /** Monotonic clock used for elapsed telemetry in milliseconds. @default performance.now */
  monotonicNow?: () => number
  /** ID factory used for persisted chat messages. @default crypto.randomUUID fallback */
  createId?: () => string
  /** Optional adapter for removing framework proxies before provider composition. */
  unwrapMessage?: <T>(message: T) => T
  /** Called whenever writable runtime state changes. */
  onStateChange?: (state: ChatOrchestratorRuntimeState) => void
  /** Called after a runtime-owned send completes or fails and `sending` has been cleared. */
  onSendSettled?: (event: { sessionId: string }) => void
  /** Called when a send starts and the first assistant placeholder is created. */
  onTrackFirstMessage?: () => void
  /** Called when a user message send begins. */
  onMessageSendStarted?: (event: {
    source: 'text' | 'voice'
    model: string
  }) => void
  /** Called immediately before the provider LLM request starts. */
  onLlmRequestStarted?: (event: {
    model: string
    provider: string
    hasVoice: boolean
  }) => void
  /** Called when the first text token arrives from the provider stream. */
  onLlmFirstToken?: (event: {
    model: string
    ttfbMs: number
  }) => void
  /** Called after the assistant stream is parsed and rendered into runtime state. */
  onAssistantResponseRendered?: (event: {
    model: string
    latencyMs: number
  }) => void
  /** Called after one user-to-assistant message round completes successfully. */
  onMessageRound?: (event: {
    durationMs: number
    hasVoice: boolean
    model: string
  }) => void
  /** Called for context/prompt lifecycle observability. */
  onLifecycle?: (record: ChatOrchestratorLifecycleRecord) => void
  /** Called with the final provider prompt projection. */
  onPromptProjection?: (payload: ChatOrchestratorPromptProjection) => void
  /** Called after the assistant message has been finalized into session history. */
  onAssistantMessageAppended?: (event: {
    sessionId: string
    message: StreamingAssistantMessage
    messageText: string
  }) => void
  /** Called after assistant streaming and hook finalization. */
  onAssistantTurnReady?: (event: {
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
  /**
   * Called once per send when the user turn commits: at the first assistant
   * output (the moment the turn can no longer be retracted), or at settle for
   * turns that never produced output. Side effects that must not run on a
   * cancelled turn, cloud upload and autonomous tasks, belong here rather
   * than at append time.
   */
  onUserTurnCommitted?: (event: {
    sessionId: string
    message: Extract<ChatHistoryItem, { role: 'user' }> & { id: string }
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
}

/**
 * Platform-agnostic chat orchestrator runtime API.
 */
export interface ChatOrchestratorRuntime {
  /**
   * Enqueues a user send for the target session, preserving FIFO order.
   * Resolves once the send settles with its {@link SendOutcome}, so callers can
   * rescue the typed text when a turn was retracted (stopped before any output).
   */
  ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<SendOutcome>
  /** Resolves queued sends that have not started yet as cancelled (`rolledBack`: nothing entered history). */
  cancelPendingSends: (sessionId?: string) => void
  /** Aborts the in-flight stream and resolves every queued send as cancelled. */
  stopSending: (sessionId?: string) => void
  /** Returns serializable snapshots of currently queued sends. */
  getPendingQueuedSendSnapshot: () => QueuedSendSnapshot[]
  /** Returns the current queued send count. */
  getPendingQueuedSendCount: () => number
  /** Reads the writable sending flag. */
  getSending: () => boolean
  /** Updates the writable sending flag and notifies facade mirrors. */
  setSending: (next: boolean) => void
  /** Hook registry preserved from the previous stage-ui store API. */
  hooks: ReturnType<typeof createChatHooks>
}

function defaultCreateId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Creates the core chat orchestrator runtime used behind UI facades.
 *
 * Use when:
 * - A platform wants AIRI chat send orchestration without Vue/Pinia coupling.
 * - Session, context, foreground stream, and LLM integrations are provided as adapters.
 *
 * Expects:
 * - Session messages are returned in chronological order.
 * - `foregroundStream.patch` replaces the visible streaming assistant message.
 *
 * Returns:
 * - A runtime with send queue APIs, hook registry, writable sending state, and queue snapshots.
 */
export function createChatOrchestratorRuntime(deps: ChatOrchestratorRuntimeDeps): ChatOrchestratorRuntime {
  const hooks = createChatHooks()
  const now = deps.now ?? (() => Date.now())
  const monotonicNow = deps.monotonicNow ?? (() => globalThis.performance?.now?.() ?? Date.now())
  const createId = deps.createId ?? defaultCreateId
  const unwrapMessage = deps.unwrapMessage ?? (<T>(message: T) => message)

  let sending = false
  let pendingQueuedSends: QueuedSend[] = []
  // Pairs the abort controller with the session that owns it, so a session-scoped
  // stop aborts only the matching run.
  let activeSend: { controller: AbortController, sessionId: string } | undefined

  function emitStateChange() {
    deps.onStateChange?.({
      sending,
      pendingQueuedSendCount: pendingQueuedSends.length,
    })
  }

  function setSending(next: boolean) {
    if (sending === next)
      return
    sending = next
    emitStateChange()
  }

  function isForegroundSession(sessionId: string) {
    return sessionId === deps.getActiveSessionId()
  }

  function patchForegroundStream(sessionId: string, message: StreamingAssistantMessage) {
    if (isForegroundSession(sessionId))
      deps.foregroundStream.patch(cloneStreamingMessage(message))
  }

  function resetForegroundStream(sessionId: string) {
    if (isForegroundSession(sessionId))
      deps.foregroundStream.reset()
  }

  function ingestRuntimeContexts() {
    for (const provider of deps.runtimeContextProviders ?? []) {
      const contextMessage = provider()
      if (contextMessage)
        deps.context.ingest(contextMessage)
    }
  }

  function buildProviderMessages(sessionMessagesForSend: ChatHistoryItem[]) {
    const nowTs = now()

    return sessionMessagesForSend.map((msg) => {
      const { context: _context, id: _id, createdAt, provisional: _provisional, ...withoutContext } = msg
      const rawMessage = unwrapMessage(withoutContext)

      if (rawMessage.role === 'user') {
        return prependTextToContent(rawMessage, formatTimePrefix(createdAt ?? nowTs))
      }

      if (rawMessage.role === 'assistant') {
        // NOTICE: `stopped` lives on `StreamingAssistantMessage` (UI/next-turn
        // session state), not on the wire-shaped `ChatAssistantMessage`.
        // It only appears here when the session contains an interrupted turn;
        // strip it alongside the other runtime fields so strict
        // OpenAI-compatible gateways accept the request.
        const { slices: _slices, tool_results: _toolResults, categorization: _categorization, stopped: _stopped, ...rest } = rawMessage as StreamingAssistantMessage
        return unwrapMessage(rest)
      }

      return rawMessage
    })
  }

  async function performSend(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    generation: number,
    sessionId: string,
  ): Promise<SendOutcome> {
    const outcome: SendOutcome = { rolledBack: false }
    if (!sendingMessage && !options.attachments?.length)
      return outcome

    deps.session.ensureSession(sessionId)

    // Datetime is no longer injected through the side-channel context store.
    // It is applied at message-assembly time (see below) as a system-prompt
    // date anchor + per-message [HH:MM] prefixes, which is more KV-cache
    // friendly and less prone to weak models echoing timestamps verbatim.
    ingestRuntimeContexts()

    const sendingCreatedAt = now()

    // TODO: Expire or prune stale runtime contexts from disconnected services before composing.
    const streamingMessageContext: ChatStreamEventContext = {
      message: { role: 'user', content: sendingMessage, createdAt: sendingCreatedAt, id: createId() },
      contexts: deps.context.snapshot(),
      composedMessage: [],
      input: options.input,
    }
    deps.onLifecycle?.({
      phase: 'before-compose',
      channel: 'chat',
      sessionId,
      textPreview: sendingMessage,
      details: {
        contexts: streamingMessageContext.contexts,
      },
    })

    const sendController = new AbortController()
    const isStaleGeneration = () => deps.session.getSessionGeneration(sessionId) !== generation
    const shouldAbort = () => isStaleGeneration() || sendController.signal.aborted
    // Only staleness can be true here: the controller is not yet published to
    // `activeSend`, so no stop can have aborted it.
    if (isStaleGeneration()) {
      // Discarded before anything entered history, so the caller may rescue.
      outcome.rolledBack = true
      return outcome
    }

    activeSend = { controller: sendController, sessionId }
    setSending(true)

    const buildingMessage: StreamingAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [],
      tool_results: [],
      createdAt: now(),
      id: createId(),
    }
    patchForegroundStream(sessionId, buildingMessage)
    deps.onTrackFirstMessage?.()
    deps.onMessageSendStarted?.({
      source: options.input ? 'voice' : 'text',
      model: options.model,
    })
    const roundStartedAt = monotonicNow()

    // Declared outside the try block so the catch (abort) path can persist the
    // partial transcript captured up to the stop point.
    let fullText = ''
    let finalFlushInProgress = false
    let parser: ReturnType<typeof useLlmmarkerParser> | undefined
    // True once the success path has appended the turn, so a post-stream hook
    // that throws during a late Stop cannot make the catch path append it again.
    let landed = false
    // The user message is appended before the stream (marked `provisional` so
    // sync layers skip it) so it shows immediately, but only commits (cloud
    // upload, autonomous tasks) once it can no longer be retracted. A set
    // `appendedUserMessage` marks that a provisional turn exists.
    let appendedUserMessage: (Extract<ChatHistoryItem, { role: 'user' }> & { id: string }) | undefined
    let userTurnSessionMessages: ChatHistoryItem[] = []

    // Idempotent: fires at most once, from first output, the success path, or
    // the `finally`.
    let committed = false
    const commitUserTurn = () => {
      if (!appendedUserMessage || committed)
        return
      committed = true
      deps.session.commitSessionMessage(sessionId, appendedUserMessage.id)
      deps.onUserTurnCommitted?.({
        sessionId,
        message: appendedUserMessage,
        messageText: sendingMessage,
        sessionMessages: userTurnSessionMessages,
      })
    }

    // True once the turn produced something worth persisting: a content slice or
    // a reasoning-only partial. Gates both the stopped-partial persist (catch)
    // and the commit-vs-retract decision (finally).
    const hasProducedOutput = () => buildingMessage.slices.length > 0
      || !!buildingMessage.categorization?.reasoning?.trim()

    // The retract window closes at first output, so the turn commits right
    // then: the deferred side effects (cloud upload, autonomous tasks) run
    // concurrently with the rest of the stream instead of waiting for it to
    // drain. Stale generations never commit; session reset/fork owns them.
    const commitUserTurnOnFirstOutput = () => {
      if (committed || !hasProducedOutput())
        return
      if (!isStaleGeneration())
        commitUserTurn()
    }

    // Flush the marker parser's residual lookahead so onEnd computes final
    // categorization. Holds finalFlushInProgress across it so a Stop in the gap
    // does not let the onLiteral abort check drop the buffered tail. No-op when
    // stop fired before the parser was built. The success path lets a flush error
    // propagate (a real failure); the abort path swallows it (already unwinding).
    const drainParserResidual = async (swallowErrors: boolean) => {
      if (!parser)
        return
      finalFlushInProgress = true
      try {
        await parser.end()
      }
      catch (flushError) {
        if (!swallowErrors)
          throw flushError
        console.error('parser.end() on stop failed:', flushError)
      }
      finally {
        finalFlushInProgress = false
      }
    }

    try {
      await hooks.emitBeforeMessageComposedHooks(sendingMessage, streamingMessageContext)

      const contentParts: CommonContentPart[] = [{ type: 'text', text: sendingMessage }]

      if (options.attachments) {
        for (const attachment of options.attachments) {
          if (attachment.type === 'image') {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.data}`,
              },
            })
          }
        }
      }

      const finalContent = contentParts.length > 1 ? contentParts : sendingMessage
      if (!streamingMessageContext.input) {
        streamingMessageContext.input = {
          type: 'input:text',
          data: {
            text: sendingMessage,
          },
        }
      }

      if (shouldAbort())
        return outcome

      const userMessageId = createId()
      const userMessage = {
        role: 'user' as const,
        content: finalContent,
        createdAt: sendingCreatedAt,
        id: userMessageId,
      }
      deps.session.appendSessionMessage(sessionId, { ...userMessage, provisional: true })
      appendedUserMessage = userMessage

      const sessionMessagesForSend = deps.session.getSessionMessages(sessionId)
      userTurnSessionMessages = sessionMessagesForSend

      const categorizer = createStreamingCategorizer(deps.getActiveProvider())
      let streamPosition = 0

      parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          // Stale generations always reject; the abort-aborted check yields only
          // during a final flush so the residual buffer can land.
          if (isStaleGeneration())
            return
          if (sendController.signal.aborted && !finalFlushInProgress)
            return

          categorizer.consume(literal)

          const speechOnly = categorizer.filterToSpeech(literal, streamPosition)
          streamPosition += literal.length

          if (speechOnly.trim()) {
            buildingMessage.content += speechOnly

            // Don't re-feed token hooks for content flushed after a Stop: Stop
            // halts downstream tokens (TTS/captions). On a clean finish the abort
            // signal is not set, so the residual tail still feeds hooks normally.
            if (!sendController.signal.aborted)
              await hooks.emitTokenLiteralHooks(speechOnly, streamingMessageContext)

            const lastSlice = buildingMessage.slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += speechOnly
            }
            else {
              buildingMessage.slices.push({
                type: 'text',
                text: speechOnly,
              })
            }
            commitUserTurnOnFirstOutput()
            patchForegroundStream(sessionId, buildingMessage)
          }
        },
        onSpecial: async (special) => {
          if (shouldAbort())
            return

          await hooks.emitTokenSpecialHooks(special, streamingMessageContext)
        },
        onEnd: async (fullText) => {
          if (isStaleGeneration())
            return

          const finalCategorization = categorizeResponse(fullText, deps.getActiveProvider())

          const reasoningContentField = buildingMessage.categorization?.reasoning?.trim()
          buildingMessage.categorization = {
            speech: finalCategorization.speech,
            reasoning: reasoningContentField || finalCategorization.reasoning,
          }
          patchForegroundStream(sessionId, buildingMessage)
        },
        minLiteralEmitLength: STREAMING_UI_FLUSH_CHUNK_SIZE,
      })

      const toolCallQueue = createQueue<ChatSlices>({
        handlers: [
          async (ctx) => {
            const aborting = shouldAbort()
            if (ctx.data.type === 'tool-call') {
              // Record the slice even when a Stop is racing the drain, so an
              // interrupted call persists and renders as cancelled instead of
              // vanishing. Only paint the live bubble while the send is active.
              buildingMessage.slices.push(ctx.data)
              commitUserTurnOnFirstOutput()
              if (!aborting)
                patchForegroundStream(sessionId, buildingMessage)
              return
            }

            // A result arriving after Stop must not flip a cancelled call to
            // done/error, so drop it once the send is aborting or stale.
            if (aborting)
              return

            if (ctx.data.type === 'tool-call-result') {
              buildingMessage.tool_results.push(ctx.data)
              patchForegroundStream(sessionId, buildingMessage)
            }
          },
        ],
      })

      const newMessages = buildProviderMessages(sessionMessagesForSend)
      const systemPromptSupplement = deps.getSystemPromptSupplement?.()?.trim()
      if (systemPromptSupplement) {
        const systemMessage = newMessages.find(message => message.role === 'system')
        if (systemMessage) {
          systemMessage.content = `${systemMessage.content}\n\n${systemPromptSupplement}`
        }
        else {
          newMessages.unshift({
            role: 'system',
            content: systemPromptSupplement,
          })
        }
      }

      const contextsSnapshot = deps.context.snapshot()
      const contextPromptText = formatContextPromptText(contextsSnapshot)
      if (contextPromptText) {
        const lastMessage = newMessages.at(-1)
        if (lastMessage && lastMessage.role === 'user') {
          const existingParts = typeof lastMessage.content === 'string'
            ? [{ type: 'text' as const, text: lastMessage.content }]
            : lastMessage.content

          lastMessage.content = [
            ...existingParts,
            { type: 'text' as const, text: `\n${contextPromptText}` },
          ]
        }

        deps.onLifecycle?.({
          phase: 'prompt-context-built',
          channel: 'chat',
          sessionId,
          details: {
            contexts: contextsSnapshot,
            promptText: contextPromptText,
          },
        })
      }

      streamingMessageContext.composedMessage = newMessages as Message[]
      deps.onPromptProjection?.({
        sessionId,
        message: sendingMessage,
        contexts: contextsSnapshot,
        promptMessage: undefined,
        composedMessage: newMessages as Message[],
      })
      deps.onLifecycle?.({
        phase: 'after-compose',
        channel: 'chat',
        sessionId,
        textPreview: sendingMessage,
        details: {
          composedMessage: newMessages,
        },
      })

      await hooks.emitAfterMessageComposedHooks(sendingMessage, streamingMessageContext)
      await hooks.emitBeforeSendHooks(sendingMessage, streamingMessageContext)

      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      if (shouldAbort())
        return outcome

      const llmRequestStartedAt = monotonicNow()
      let llmFirstTokenEmitted = false
      deps.onLlmRequestStarted?.({
        model: options.model,
        provider: deps.getActiveProvider() || 'unknown',
        hasVoice: !!options.input,
      })

      await deps.llm.stream(options.model, options.chatProvider, newMessages as Message[], {
        headers,
        tools: options.tools,
        waitForTools: true,
        captureToolErrors: true,
        abortSignal: sendController.signal,
        onStreamEvent: async (event: StreamEvent) => {
          switch (event.type) {
            case 'tool-call':
              toolCallQueue.enqueue({
                type: 'tool-call',
                toolCall: event,
              })

              break
            case 'tool-result':
              toolCallQueue.enqueue({
                type: 'tool-call-result',
                id: event.toolCallId,
                result: event.result,
              })

              break
            case 'tool-error':
              toolCallQueue.enqueue({
                type: 'tool-call-result',
                id: event.toolCallId,
                isError: true,
                result: event.result,
              })

              break
            case 'text-delta':
              // After Stop, an SSE/fetch adapter can still surface deltas it
              // read off the socket before the abort propagated. Dropping them
              // here keeps post-Stop tokens out of fullText and the parser
              // buffer, so the catch-path flush persists a partial that ends
              // exactly where the user cancelled. This per-token path checks the
              // raw abort signal only; stale-generation filtering lives in the
              // parser callbacks and persistence gates.
              if (sendController.signal.aborted)
                return

              if (!llmFirstTokenEmitted) {
                llmFirstTokenEmitted = true
                deps.onLlmFirstToken?.({
                  model: options.model,
                  ttfbMs: Math.round(monotonicNow() - llmRequestStartedAt),
                })
              }
              fullText += event.text
              await parser!.consume(event.text)
              break
            case 'reasoning-delta': {
              if (shouldAbort())
                return

              const { reasoning = '' } = buildingMessage.categorization ?? {}
              const nextReasoning = reasoning + event.text
              buildingMessage.categorization = {
                speech: typeof buildingMessage.content === 'string' ? buildingMessage.content : '',
                reasoning: nextReasoning,
              }
              commitUserTurnOnFirstOutput()
              const crossesBoundary
                = Math.floor(nextReasoning.length / STREAMING_UI_FLUSH_CHUNK_SIZE)
                  > Math.floor(reasoning.length / STREAMING_UI_FLUSH_CHUNK_SIZE)
              if (!reasoning || crossesBoundary)
                patchForegroundStream(sessionId, buildingMessage)
              break
            }
            case 'finish':
              break
            case 'error':
              throw event.error ?? new Error('Stream error')
          }
        },
      })

      // Drain the residual tail of an already-complete reply before finalizing.
      await drainParserResidual(false)
      deps.onAssistantResponseRendered?.({
        model: options.model,
        latencyMs: Math.round(monotonicNow() - llmRequestStartedAt),
      })

      // NOTICE: a Stop in this gap counts as a completed turn (no `stopped`
      // marker, turn-complete hooks fire); the catch block owns mid-stream
      // cancellation.
      if (!isStaleGeneration() && buildingMessage.slices.length > 0) {
        // Normally a no-op: the turn already committed at first output, which
        // also keeps the user's cloud upload enqueued before the assistant's
        // (the server orders by arrival; the wire carries no timestamp).
        // TODO: move that ordering into the sync layer so commit timing stops
        // being load-bearing.
        commitUserTurn()
        const finalAssistant = buildingMessage
        deps.session.appendSessionMessage(sessionId, finalAssistant)
        landed = true
        deps.onAssistantMessageAppended?.({
          sessionId,
          message: finalAssistant,
          messageText: fullText,
        })
      }

      await hooks.emitStreamEndHooks(streamingMessageContext)
      await hooks.emitAssistantResponseEndHooks(fullText, streamingMessageContext)

      await hooks.emitAfterSendHooks(sendingMessage, streamingMessageContext)
      await hooks.emitAssistantMessageHooks({ ...buildingMessage }, fullText, streamingMessageContext)
      await hooks.emitChatTurnCompleteHooks({
        output: { ...buildingMessage },
        outputText: fullText,
        toolCalls: sessionMessagesForSend.filter(msg => msg.role === 'tool') as ToolMessage[],
      }, streamingMessageContext)

      deps.onAssistantTurnReady?.({
        messageText: fullText,
        sessionMessages: sessionMessagesForSend,
      })

      resetForegroundStream(sessionId)
      deps.onMessageRound?.({
        durationMs: Math.round(monotonicNow() - roundStartedAt),
        hasVoice: !!options.input,
        model: options.model,
      })
    }
    catch (error) {
      // Swallow xsai/fetch AbortError so the caller doesn't see a synthetic
      // error, and persist the partial draft with `stopped: true` for the
      // UI badge/retry and next-turn context. Turn-complete hooks
      // deliberately do NOT fire on stop: subscribers (cloud sync,
      // analytics) treat those as a landed turn, which this isn't. The
      // stopped marker is the contract for "user cancelled this turn".
      if (sendController.signal.aborted) {
        // Drain residual + compute final categorization before the persistence
        // gate, swallowing a flush error since we are already unwinding on Stop.
        await drainParserResidual(true)

        // Reasoning-only turns (reasoning models that stop before any speech or
        // tool slice) carry their partial in categorization.reasoning, which
        // hasProducedOutput() counts, so they persist rather than being dropped.
        if (!landed && !isStaleGeneration() && hasProducedOutput()) {
          const stoppedAssistant: StreamingAssistantMessage = {
            ...buildingMessage,
            // Snapshot the arrays: the tool-call queue keeps recording
            // cancelled tool calls into buildingMessage after abort, and the
            // session port stores the appended message by reference, so
            // sharing the live arrays would let a late drain mutate
            // already-persisted (and already-broadcast) state.
            slices: [...buildingMessage.slices],
            tool_results: [...buildingMessage.tool_results],
            stopped: true,
          }
          deps.session.appendSessionMessage(sessionId, stoppedAssistant)
          deps.onAssistantMessageAppended?.({
            sessionId,
            message: stoppedAssistant,
            messageText: fullText,
          })
        }
        return outcome
      }

      console.error('Error sending message:', error)
      throw error
    }
    finally {
      // Decide commit vs retract for every exit path (stale generations are left
      // to session reset/fork). A rescuable send stopped before any output
      // retracts the turn and reports `rolledBack` so the composer can rescue the
      // text; this also covers a stop before the user row was even appended.
      // Everything else commits (idempotent), so a non-rescuable stop keeps its
      // turn rather than deleting text no caller would catch.
      if (!isStaleGeneration()) {
        if (options.rescuable && sendController.signal.aborted && !hasProducedOutput()) {
          if (appendedUserMessage)
            deps.session.removeSessionMessage(sessionId, appendedUserMessage.id)
          outcome.rolledBack = true
        }
        else {
          commitUserTurn()
        }
      }

      // NOTICE: reset the bubble on every abort path. Pre-stream
      // `shouldAbort()` checkpoints can early-return without entering
      // catch, leaving an empty assistant bubble painted.
      if (sendController.signal.aborted)
        resetForegroundStream(sessionId)
      if (activeSend?.controller === sendController)
        activeSend = undefined
      setSending(false)
      deps.onSendSettled?.({ sessionId })
    }
    return outcome
  }

  const sendQueue = createQueue<QueuedSend>({
    handlers: [
      async ({ data }) => {
        const { sendingMessage, options, generation, deferred, sessionId, cancelled } = data

        if (cancelled)
          return

        // A queued send made stale by a generation bump (session reset/fork
        // while it waited) was discarded deliberately, not failed. Resolve so
        // the awaiting caller's failure UI never runs; `rolledBack` tells it
        // nothing entered history. See cancelPendingSends.
        if (deps.session.getSessionGeneration(sessionId) !== generation) {
          deferred.resolve({ rolledBack: true })
          return
        }

        try {
          deferred.resolve(await performSend(sendingMessage, options, generation, sessionId))
        }
        catch (error) {
          deferred.reject(error)
        }
      },
    ],
  })

  sendQueue.on('enqueue', (queuedSend) => {
    pendingQueuedSends.push(queuedSend)
    emitStateChange()
  })

  sendQueue.on('dequeue', (queuedSend) => {
    pendingQueuedSends = pendingQueuedSends.filter(item => item !== queuedSend)
    emitStateChange()
  })

  function ingest(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    targetSessionId?: string,
  ): Promise<SendOutcome> {
    const sessionId = targetSessionId || deps.getActiveSessionId()
    const generation = deps.session.getSessionGeneration(sessionId)

    return new Promise<SendOutcome>((resolve, reject) => {
      sendQueue.enqueue({
        sendingMessage,
        options,
        generation,
        sessionId,
        deferred: { resolve, reject },
      })
    })
  }

  function cancelPendingSends(sessionId?: string) {
    for (const queued of pendingQueuedSends) {
      if (sessionId && queued.sessionId !== sessionId)
        continue

      // Cancellation is a deliberate user/system action (Stop button, session
      // delete, clear-data), not a failure. Resolve rather than reject so the
      // awaiting ingest() caller's send-failure UI never runs for it: that catch
      // is shared with genuine send errors and mutates chat history. A plain
      // resolve is also the only signal that survives the tamagotchi
      // BroadcastChannel relay, which cannot carry a typed cancellation error.
      queued.cancelled = true
      // A queued send never appended its user turn, so it rolls back.
      queued.deferred.resolve({ rolledBack: true })
    }

    pendingQueuedSends = sessionId
      ? pendingQueuedSends.filter(item => item.sessionId !== sessionId)
      : []
    emitStateChange()
  }

  /**
   * Aborts the in-flight stream (if any) and resolves every queued send as
   * cancelled.
   *
   * Use when:
   * - The user clicks the stop button to cancel the current assistant response.
   * - A session-scoped stop is needed; passing `sessionId` will only abort when
   *   the running send belongs to that session, while queued sends for that
   *   session are dropped (their awaiting `ingest()` promises resolve without
   *   running `performSend`).
   *
   * Expects:
   * - The active send loop will see the AbortSignal via `deps.llm.stream`, land
   *   in the catch block, and persist the partial draft with `stopped: true`.
   * - Queued, not-yet-started sends resolve with `rolledBack` so the consumer's
   *   send-failure UI never fires for a deliberate cancellation while a composer
   *   can still rescue the text.
   *
   * Returns:
   * - Nothing. State updates are emitted via `onStateChange` once the send settles.
   */
  function stopSending(sessionId?: string) {
    if (activeSend && (!sessionId || activeSend.sessionId === sessionId))
      activeSend.controller.abort()
    cancelPendingSends(sessionId)
  }

  function getPendingQueuedSendSnapshot() {
    return pendingQueuedSends.map(queued => ({
      sessionId: queued.sessionId,
      generation: queued.generation,
      cancelled: !!queued.cancelled,
      messagePreview: queued.sendingMessage.slice(0, 120),
      hasAttachments: !!queued.options.attachments?.length,
      inputType: queued.options.input?.type,
    } satisfies QueuedSendSnapshot))
  }

  return {
    ingest,
    cancelPendingSends,
    stopSending,
    getPendingQueuedSendSnapshot,
    getPendingQueuedSendCount: () => pendingQueuedSends.length,
    getSending: () => sending,
    setSending,
    hooks,
  }
}
