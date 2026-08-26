import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { AgentContextPort } from '../contracts/context-port'
import type { AgentForegroundStreamPort } from '../contracts/stream-port'
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlices, ChatStreamEventContext, ChatToolReference, ContextMessage, ErrorMessage, StreamingAssistantMessage } from '../types/chat'
import type { LlmUsage, StreamEvent, StreamOptions } from '../types/llm'

import { createQueue } from '@proj-airi/stream-kit'

import { formatContextPromptText } from '../messages/context-prompt'
import { formatTimePrefix } from '../messages/datetime-prefix'
import { createChatHooks } from './agent-hooks'
import { useLlmmarkerParser } from './llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from './response-categoriser'

const REASONING_UI_FLUSH_CHUNK_SIZE = 24

/**
 * Lifecycle record emitted around prompt composition.
 */
export interface ChatOrchestratorLifecycleRecord {
  /** Logical event channel for context observability. */
  channel: 'chat'
  /** Phase-specific payload for devtools and diagnostics. */
  details?: unknown
  /** Composition phase being observed. */
  phase: 'after-compose' | 'before-compose' | 'prompt-context-built'
  /** Session associated with this send. */
  sessionId: string
  /** Optional compact preview of the user text. */
  textPreview?: string
}

/**
 * LLM streaming boundary used by the core chat orchestrator runtime.
 */
export interface ChatOrchestratorLLMPort {
  /** Streams one composed chat request and emits normalized stream events. */
  stream: (model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) => Promise<void>
}

/**
 * Prompt projection emitted after the runtime has composed provider messages.
 */
export interface ChatOrchestratorPromptProjection {
  /** Provider-ready message array sent to the LLM port. */
  composedMessage?: Message[]
  /** Active context snapshot read during prompt composition. */
  contexts: Record<string, ContextMessage[]>
  /** Raw user message text that triggered the prompt. */
  message: string
  /** Historical standalone context prompt shape, kept for compatibility. */
  promptMessage?: Message | null
  /** Session associated with the projected prompt. */
  sessionId: string
}

/**
 * Platform-agnostic chat orchestrator runtime API.
 */
export interface ChatOrchestratorRuntime {
  /** Rejects queued sends that have not started yet. */
  cancelPendingSends: (sessionId?: string) => void
  /** Returns the current queued send count. */
  getPendingQueuedSendCount: () => number
  /** Returns serializable snapshots of currently queued sends. */
  getPendingQueuedSendSnapshot: () => QueuedSendSnapshot[]
  /** Reads the writable sending flag. */
  getSending: () => boolean
  /** Hook registry preserved from the previous stage-ui store API. */
  hooks: ReturnType<typeof createChatHooks>
  /** Enqueues a user send for the target session, preserving FIFO order. */
  ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<void>
  /** Updates the writable sending flag and notifies facade mirrors. */
  setSending: (next: boolean) => void
}

/**
 * Dependency surface used by the platform-agnostic chat orchestrator runtime.
 */
export interface ChatOrchestratorRuntimeDeps {
  /** Context registry facade used for runtime context ingest and prompt snapshots. */
  context: Pick<AgentContextPort, 'ingest' | 'snapshot'>
  /** ID factory used for persisted chat messages. @default crypto.randomUUID fallback */
  createId?: () => string
  /** Foreground assistant stream port controlled by the UI facade. */
  foregroundStream: AgentForegroundStreamPort
  /** Returns the currently active provider ID for categorization policy. */
  getActiveProvider: () => string | undefined
  /** Returns the currently visible session ID. */
  getActiveSessionId: () => string
  /** Returns optional prompt text appended to the provider system message for this send. */
  getSystemPromptSupplement?: () => string | undefined
  /** Provider-agnostic LLM streaming port. */
  llm: ChatOrchestratorLLMPort
  /** Monotonic clock used for elapsed telemetry in milliseconds. @default performance.now */
  monotonicNow?: () => number
  /** Clock used for persisted message timestamps. @default Date.now */
  now?: () => number
  /** Called after the assistant message has been finalized into session history. */
  onAssistantMessageAppended?: (event: {
    message: StreamingAssistantMessage
    messageText: string
    sessionId: string
  }) => void
  /** Called after the assistant stream is parsed and rendered into runtime state. */
  onAssistantResponseRendered?: (event: ChatRoundCorrelation & {
    latencyMs: number
    model: string
  }) => void
  /** Called after assistant streaming and hook finalization. */
  onAssistantTurnReady?: (event: {
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
  /** Called when a pre-activation attempt fails before assistant completion. */
  onChatActivationFailed?: (event: ChatRoundCorrelation & {
    errorCode: 'llm_response_failed'
    failureStage: 'llm_response'
    model: string
    provider: string
    source: 'text' | 'voice'
  }) => void
  /** Called for attempts made before the conversation has its first assistant response. */
  onChatActivationStarted?: (event: ChatRoundCorrelation & {
    model: string
    provider: string
    source: 'text' | 'voice'
  }) => void
  /** Called when the conversation reaches its first successful assistant response. */
  onChatActivationSucceeded?: (event: ChatRoundCorrelation & {
    durationMs: number
    model: string
    provider: string
    source: 'text' | 'voice'
  }) => void
  /** Called for context/prompt lifecycle observability. */
  onLifecycle?: (record: ChatOrchestratorLifecycleRecord) => void
  /** Called when the first text token arrives from the provider stream. */
  onLlmFirstToken?: (event: ChatRoundCorrelation & {
    model: string
    ttfbMs: number
  }) => void
  /** Called once per completed provider generation with content-free usage metadata. */
  onLlmGeneration?: (event: ChatRoundCorrelation & {
    inputTokens?: number
    model: string
    outputTokens?: number
    provider: string
    totalTokens?: number
    usageSource: LlmUsage['source']
  }) => void
  /** Called immediately before the provider LLM request starts. */
  onLlmRequestStarted?: (event: ChatRoundCorrelation & {
    hasVoice: boolean
    model: string
    provider: string
  }) => void
  /** Called after one user-to-assistant message round completes successfully. */
  onMessageRound?: (event: ChatRoundCorrelation & {
    durationMs: number
    hasVoice: boolean
    inputTokens?: number
    model: string
    outputTokens?: number
    totalTokens?: number
    usageSource: LlmUsage['source']
  }) => void
  /** Called whenever a user-to-assistant round fails before completion. */
  onMessageRoundFailed?: (event: ChatRoundCorrelation & {
    errorCode: 'llm_response_failed'
    failureStage: 'llm_response'
    model: string
    provider: string
    source: 'text' | 'voice'
  }) => void
  /** Called when a user message send begins. */
  onMessageSendStarted?: (event: ChatRoundCorrelation & {
    model: string
    source: 'text' | 'voice'
  }) => void
  /** Called with the final provider prompt projection. */
  onPromptProjection?: (payload: ChatOrchestratorPromptProjection) => void
  /** Called after a runtime-owned send completes or fails and `sending` has been cleared. */
  onSendSettled?: (event: { sessionId: string }) => void
  /** Called whenever writable runtime state changes. */
  onStateChange?: (state: ChatOrchestratorRuntimeState) => void
  /** Called when a send starts and the first assistant placeholder is created. */
  onTrackFirstMessage?: () => void
  /** Called after the user message has been appended to session history. */
  onUserMessageAppended?: (event: {
    message: Extract<ChatHistoryItem, { role: 'user' }> & { id: string }
    messageText: string
    model: string
    provider: string
    roundId: string
    sessionId: string
    source: 'text' | 'voice'
    turnIndex: number
  }) => void
  /** Called after user turn persistence, before provider prompt composition. */
  onUserTurnReady?: (event: {
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
  /** Runtime context providers ingested immediately before prompt composition. */
  runtimeContextProviders?: Array<() => ContextMessage | null | undefined>
  /** Session persistence and generation guard port. */
  session: ChatOrchestratorSessionPort
  /** Optional adapter for removing framework proxies before provider composition. */
  unwrapMessage?: <T>(message: T) => T
}

/**
 * Reactive state mirrored by UI facades.
 */
export interface ChatOrchestratorRuntimeState {
  /** Session that owns the active send; undefined while the queue is idle. */
  activeSendSessionId?: string
  /** Latest assistant stream snapshot owned by the active send session. */
  activeStreamingMessage?: StreamingAssistantMessage
  /** Number of sends waiting behind the active one. */
  pendingQueuedSendCount: number
  /** Whether the runtime currently owns an active send. */
  sending: boolean
}

/**
 * Options accepted by the chat orchestrator runtime for one user send.
 */
export interface ChatOrchestratorSendOptions {
  /** Image attachments appended to the user message content parts. */
  attachments?: { data: string, mimeType: string, type: 'image' }[]
  /** Concrete chat provider implementation selected by the caller. */
  chatProvider: ChatProvider
  /** Original transport input metadata used by bridge/devtools observers. */
  input?: ChatStreamEventContext['input']
  /** Provider model identifier used for the outbound LLM request. */
  model: string
  /** Provider-specific request options, currently used for headers. */
  providerConfig?: Record<string, unknown>
  /** Serializable tool names stored with the user message for later requests. */
  toolReferences?: ChatToolReference[]
  /** Tool definitions passed through to the LLM stream port. */
  tools?: StreamOptions['tools']
}

/**
 * Session operations required by the core chat orchestrator runtime.
 */
export interface ChatOrchestratorSessionPort {
  /** Appends a finalized user/assistant/tool history item. */
  appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void
  /** Ensures a session exists before messages are appended. */
  ensureSession: (sessionId: string) => void
  /** Returns a monotonic generation used to reject stale queued sends. */
  getSessionGeneration: (sessionId: string) => number
  /** Returns chronological chat history for a session. */
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
}

/**
 * Serializable view of a queued send waiting to be processed.
 */
export interface QueuedSendSnapshot {
  /** Whether the queued send has been rejected before execution. */
  cancelled: boolean
  /** Session generation captured when the send was enqueued. */
  generation: number
  /** Whether the queued send carries image attachments. */
  hasAttachments: boolean
  /** Optional input event type for transport-originated sends. */
  inputType?: NonNullable<ChatStreamEventContext['input']>['type']
  /** First 120 characters of the pending user message. */
  messagePreview: string
  /** Session that owns the queued send. */
  sessionId: string
}

/** Correlation keys shared by every analytics milestone from one user-to-assistant round. */
interface ChatRoundCorrelation {
  /** Application conversation that owns the round. */
  conversationId: string
  /** Stable round key; the runtime reuses the persisted user-message ID. */
  roundId: string
  /** One-based user turn position within the conversation. */
  turnIndex: number
}

interface QueuedSend {
  cancelled?: boolean
  deferred: {
    reject: (error: unknown) => void
    resolve: () => void
  }
  generation: number
  options: ChatOrchestratorSendOptions
  sendingMessage: string
  sessionId: string
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
  let activeSendSessionId: string | undefined
  let activeStreamingMessage: StreamingAssistantMessage | undefined
  let pendingQueuedSends: QueuedSend[] = []

  function emitStateChange() {
    deps.onStateChange?.({
      activeSendSessionId,
      activeStreamingMessage,
      pendingQueuedSendCount: pendingQueuedSends.length,
      sending,
    })
  }

  function setSending(next: boolean) {
    const nextActiveSendSessionId = next
      ? activeSendSessionId ?? deps.getActiveSessionId()
      : undefined
    if (sending === next && activeSendSessionId === nextActiveSendSessionId)
      return
    sending = next
    activeSendSessionId = nextActiveSendSessionId
    if (!next)
      activeStreamingMessage = undefined
    emitStateChange()
  }

  function isForegroundSession(sessionId: string) {
    return sessionId === deps.getActiveSessionId()
  }

  function beginStream(sessionId: string, message: StreamingAssistantMessage) {
    sending = true
    activeSendSessionId = sessionId
    activeStreamingMessage = cloneStreamingMessage(message)
    emitStateChange()

    if (isForegroundSession(sessionId))
      deps.foregroundStream.patch(cloneStreamingMessage(message))
  }

  function updateStream(sessionId: string, message: StreamingAssistantMessage) {
    if (sessionId === activeSendSessionId) {
      activeStreamingMessage = cloneStreamingMessage(message)
      emitStateChange()
    }

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

  function getStablePromptTimestamp(message: ChatHistoryItem, fallbackCreatedAt: number) {
    if (typeof message.createdAt === 'number')
      return message.createdAt

    message.createdAt = fallbackCreatedAt
    return fallbackCreatedAt
  }

  function buildProviderMessages(sessionMessagesForSend: ChatHistoryItem[]): Array<ErrorMessage | Message> {
    const nowTs = now()

    return sessionMessagesForSend.flatMap<ErrorMessage | Message>((msg) => {
      const { context: _context, createdAt: _createdAt, id: _id, tools: _tools, ...withoutContext } = msg
      const rawMessage = unwrapMessage(withoutContext)

      if (rawMessage.role === 'user') {
        return [prependTextToContent(rawMessage, formatTimePrefix(getStablePromptTimestamp(msg, nowTs)))]
      }

      if (rawMessage.role === 'assistant') {
        const {
          categorization: _categorization,
          providerTranscript,
          slices: _slices,
          tool_results: _toolResults,
          ...rest
        } = rawMessage as ChatAssistantMessage

        if (providerTranscript?.length)
          return providerTranscript.map(message => unwrapMessage(message))

        return [unwrapMessage(rest)]
      }

      return [rawMessage]
    })
  }

  async function performSend(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    generation: number,
    sessionId: string,
  ) {
    if (!sendingMessage && !options.attachments?.length)
      return

    deps.session.ensureSession(sessionId)

    const existingSessionMessages = deps.session.getSessionMessages(sessionId)
    const turnIndex = existingSessionMessages.filter(message => message.role === 'user').length + 1

    // Activation measures whether a conversation reaches its first assistant
    // response. Later turns still emit message and latency telemetry, but they
    // must not inflate the one-time activation milestones.
    const isActivationAttempt = !existingSessionMessages.some(message => message.role === 'assistant')

    // Datetime is no longer injected through the side-channel context store.
    // It is applied at message-assembly time (see below) as a system-prompt
    // date anchor + per-message [HH:MM] prefixes, which is more KV-cache
    // friendly and less prone to weak models echoing timestamps verbatim.
    ingestRuntimeContexts()

    const sendingCreatedAt = now()

    // TODO: Expire or prune stale runtime contexts from disconnected services before composing.
    // Allocate the three per-round ids in their historical order so callers
    // with deterministic id factories keep the same durable message ids.
    const streamContextMessageId = createId()
    const assistantMessageId = createId()
    const roundId = createId()
    const streamingMessageContext: ChatStreamEventContext = {
      composedMessage: [],
      contexts: deps.context.snapshot(),
      input: options.input,
      message: { content: sendingMessage, createdAt: sendingCreatedAt, id: streamContextMessageId, role: 'user' },
      turnId: roundId,
    }
    deps.onLifecycle?.({
      channel: 'chat',
      details: {
        contexts: streamingMessageContext.contexts,
      },
      phase: 'before-compose',
      sessionId,
      textPreview: sendingMessage,
    })

    const isStaleGeneration = () => deps.session.getSessionGeneration(sessionId) !== generation
    const shouldAbort = () => isStaleGeneration()
    if (shouldAbort())
      return

    const buildingMessage: StreamingAssistantMessage = {
      content: '',
      createdAt: now(),
      id: assistantMessageId,
      role: 'assistant',
      slices: [],
      tool_results: [],
    }
    beginStream(sessionId, buildingMessage)
    const hasVoice = options.input?.type === 'input:voice'
      || options.input?.type === 'input:text:voice'
    const sendSource = hasVoice ? 'voice' : 'text'
    const activeProvider = deps.getActiveProvider?.() ?? ''
    // The user message is the durable start of a round, so its ID also serves
    // as the correlation key for every telemetry milestone emitted by it.
    const correlation: ChatRoundCorrelation = {
      conversationId: sessionId,
      roundId,
      turnIndex,
    }
    deps.onTrackFirstMessage?.()
    if (isActivationAttempt) {
      deps.onChatActivationStarted?.({
        ...correlation,
        model: options.model,
        provider: activeProvider,
        source: sendSource,
      })
    }
    deps.onMessageSendStarted?.({
      ...correlation,
      model: options.model,
      source: sendSource,
    })
    const roundStartedAt = monotonicNow()

    try {
      await hooks.emitBeforeMessageComposedHooks(sendingMessage, streamingMessageContext)

      const contentParts: CommonContentPart[] = [{ text: sendingMessage, type: 'text' }]

      if (options.attachments) {
        for (const attachment of options.attachments) {
          if (attachment.type === 'image') {
            contentParts.push({
              image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.data}`,
              },
              type: 'image_url',
            })
          }
        }
      }

      const finalContent = contentParts.length > 1 ? contentParts : sendingMessage
      if (!streamingMessageContext.input) {
        streamingMessageContext.input = {
          data: {
            text: sendingMessage,
          },
          type: 'input:text',
        }
      }

      if (shouldAbort())
        return

      const userMessage = {
        content: finalContent,
        createdAt: sendingCreatedAt,
        id: roundId,
        role: 'user' as const,
        ...(options.toolReferences?.length ? { tools: options.toolReferences } : {}),
      }
      deps.session.appendSessionMessage(sessionId, userMessage)

      // Cloud sync v1: only the raw text part round-trips; image attachments
      // and other non-text parts stay local.
      deps.onUserMessageAppended?.({
        message: userMessage,
        messageText: sendingMessage,
        model: options.model,
        provider: activeProvider,
        roundId,
        sessionId,
        source: sendSource,
        turnIndex,
      })

      const sessionMessagesForSend = deps.session.getSessionMessages(sessionId)
      deps.onUserTurnReady?.({
        messageText: sendingMessage,
        sessionMessages: sessionMessagesForSend,
      })

      const categorizer = createStreamingCategorizer(deps.getActiveProvider())
      let streamPosition = 0

      const parser = useLlmmarkerParser({
        // The parser keeps its own marker-safety tail. Emit each safe literal
        // chunk so slow providers update the chat before they reach 24 characters.
        minLiteralEmitLength: 1,
        onEnd: async (fullText) => {
          if (isStaleGeneration())
            return

          const finalCategorization = categorizeResponse(fullText, deps.getActiveProvider())

          const reasoningContentField = buildingMessage.categorization?.reasoning?.trim()
          buildingMessage.categorization = {
            reasoning: reasoningContentField || finalCategorization.reasoning,
            speech: finalCategorization.speech,
          }
          updateStream(sessionId, buildingMessage)
        },
        onLiteral: async (literal) => {
          if (shouldAbort())
            return

          categorizer.consume(literal)

          const speechOnly = categorizer.filterToSpeech(literal, streamPosition)
          streamPosition += literal.length

          if (speechOnly.trim()) {
            buildingMessage.content += speechOnly

            await hooks.emitTokenLiteralHooks(speechOnly, streamingMessageContext)

            const lastSlice = buildingMessage.slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += speechOnly
            }
            else {
              buildingMessage.slices.push({
                text: speechOnly,
                type: 'text',
              })
            }
            updateStream(sessionId, buildingMessage)
          }
        },
        onSpecial: async (special) => {
          if (shouldAbort())
            return

          await hooks.emitTokenSpecialHooks(special, streamingMessageContext)
        },
      })

      const toolCallQueue = createQueue<ChatSlices>({
        handlers: [
          async (ctx) => {
            if (shouldAbort())
              return
            if (ctx.data.type === 'tool-call') {
              buildingMessage.slices.push(ctx.data)
              updateStream(sessionId, buildingMessage)
              return
            }

            if (ctx.data.type === 'tool-call-result') {
              buildingMessage.tool_results.push(ctx.data)
              updateStream(sessionId, buildingMessage)
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
            content: systemPromptSupplement,
            role: 'system',
          })
        }
      }

      const contextsSnapshot = deps.context.snapshot()
      const contextPromptText = formatContextPromptText(contextsSnapshot)
      if (contextPromptText) {
        const lastMessage = newMessages.at(-1)
        if (lastMessage && lastMessage.role === 'user') {
          const existingParts = typeof lastMessage.content === 'string'
            ? [{ text: lastMessage.content, type: 'text' as const }]
            : lastMessage.content

          lastMessage.content = [
            ...existingParts,
            { text: `\n${contextPromptText}`, type: 'text' as const },
          ]
        }

        deps.onLifecycle?.({
          channel: 'chat',
          details: {
            contexts: contextsSnapshot,
            promptText: contextPromptText,
          },
          phase: 'prompt-context-built',
          sessionId,
        })
      }

      streamingMessageContext.composedMessage = newMessages as Message[]
      deps.onPromptProjection?.({
        composedMessage: newMessages as Message[],
        contexts: contextsSnapshot,
        message: sendingMessage,
        promptMessage: undefined,
        sessionId,
      })
      deps.onLifecycle?.({
        channel: 'chat',
        details: {
          composedMessage: newMessages,
        },
        phase: 'after-compose',
        sessionId,
        textPreview: sendingMessage,
      })

      await hooks.emitAfterMessageComposedHooks(sendingMessage, streamingMessageContext)
      await hooks.emitBeforeSendHooks(sendingMessage, streamingMessageContext)

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      if (shouldAbort())
        return

      const llmRequestStartedAt = monotonicNow()
      let llmFirstTokenEmitted = false
      let generationUsage: LlmUsage = { source: 'unavailable' }
      let providerTranscript: Message[] | undefined
      const providerInputMessageCount = newMessages.length
      deps.onLlmRequestStarted?.({
        ...correlation,
        hasVoice,
        model: options.model,
        provider: deps.getActiveProvider() || 'unknown',
      })

      await deps.llm.stream(options.model, options.chatProvider, newMessages as Message[], {
        headers,
        onMessages: (messages) => {
          const currentTurnMessages = messages.slice(providerInputMessageCount)
          const hasToolRound = currentTurnMessages.some(message =>
            message.role === 'tool'
            || (message.role === 'assistant' && Boolean(message.tool_calls?.length)),
          )

          if (hasToolRound)
            providerTranscript = structuredClone(currentTurnMessages)
        },
        onStreamEvent: async (event: StreamEvent) => {
          if (shouldAbort())
            return

          switch (event.type) {
            case 'finish':
              break
            case 'reasoning-delta': {
              if (shouldAbort())
                return

              const { reasoning = '' } = buildingMessage.categorization ?? {}
              const nextReasoning = reasoning + event.text
              buildingMessage.categorization = {
                reasoning: nextReasoning,
                speech: typeof buildingMessage.content === 'string' ? buildingMessage.content : '',
              }
              const crossesBoundary
                = Math.floor(nextReasoning.length / REASONING_UI_FLUSH_CHUNK_SIZE)
                  > Math.floor(reasoning.length / REASONING_UI_FLUSH_CHUNK_SIZE)
              if (!reasoning || crossesBoundary)
                updateStream(sessionId, buildingMessage)
              break
            }
            case 'text-delta':
              if (!llmFirstTokenEmitted) {
                llmFirstTokenEmitted = true
                deps.onLlmFirstToken?.({
                  ...correlation,
                  model: options.model,
                  ttfbMs: Math.round(monotonicNow() - llmRequestStartedAt),
                })
              }
              fullText += event.text
              await parser.consume(event.text)
              break
            case 'tool-call':
              toolCallQueue.enqueue({
                toolCall: event,
                type: 'tool-call',
              })

              break
            case 'tool-error':
              toolCallQueue.enqueue({
                id: event.toolCallId,
                isError: true,
                result: event.result,
                type: 'tool-call-result',
              })

              break
            case 'tool-result':
              toolCallQueue.enqueue({
                id: event.toolCallId,
                result: event.result,
                type: 'tool-call-result',
              })

              break
            case 'error':
              throw event.error ?? new Error('Stream error')
          }
        },
        onUsage: (usage) => {
          if (shouldAbort())
            return

          generationUsage = usage
          deps.onLlmGeneration?.({
            ...correlation,
            inputTokens: usage.inputTokens,
            model: options.model,
            outputTokens: usage.outputTokens,
            provider: activeProvider,
            totalTokens: usage.totalTokens,
            usageSource: usage.source,
          })
        },
        requestCorrelation: {
          conversationId: correlation.conversationId,
          roundId: correlation.roundId,
        },
        tools: options.tools,
        waitForTools: true,
      })

      // Session generation is the lifecycle correlation key. Re-check it
      // after every awaited completion boundary so deleting a session while a
      // plugin hook runs cannot leak later hooks or success analytics.
      if (shouldAbort())
        return

      await parser.end()
      if (shouldAbort())
        return

      buildingMessage.providerTranscript = providerTranscript
      deps.onAssistantResponseRendered?.({
        ...correlation,
        latencyMs: Math.round(monotonicNow() - llmRequestStartedAt),
        model: options.model,
      })

      if (!isStaleGeneration() && buildingMessage.slices.length > 0) {
        const finalAssistant = buildingMessage
        deps.session.appendSessionMessage(sessionId, finalAssistant)
        deps.onAssistantMessageAppended?.({
          message: finalAssistant,
          messageText: fullText,
          sessionId,
        })
      }

      if (shouldAbort())
        return
      await hooks.emitStreamEndHooks(streamingMessageContext)
      if (shouldAbort())
        return
      await hooks.emitAssistantResponseEndHooks(fullText, streamingMessageContext)

      if (shouldAbort())
        return
      await hooks.emitAfterSendHooks(sendingMessage, streamingMessageContext)
      if (shouldAbort())
        return
      await hooks.emitAssistantMessageHooks({ ...buildingMessage }, fullText, streamingMessageContext)
      if (shouldAbort())
        return
      await hooks.emitChatTurnCompleteHooks({
        output: { ...buildingMessage },
        outputText: fullText,
        toolCalls: sessionMessagesForSend.filter(msg => msg.role === 'tool') as ToolMessage[],
      }, streamingMessageContext)

      if (shouldAbort())
        return
      deps.onAssistantTurnReady?.({
        messageText: fullText,
        sessionMessages: sessionMessagesForSend,
      })

      resetForegroundStream(sessionId)
      const durationMs = Math.round(monotonicNow() - roundStartedAt)
      deps.onMessageRound?.({
        ...correlation,
        durationMs,
        hasVoice,
        inputTokens: generationUsage.inputTokens,
        model: options.model,
        outputTokens: generationUsage.outputTokens,
        totalTokens: generationUsage.totalTokens,
        usageSource: generationUsage.source,
      })
      if (isActivationAttempt) {
        deps.onChatActivationSucceeded?.({
          ...correlation,
          durationMs,
          model: options.model,
          provider: activeProvider,
          source: sendSource,
        })
      }
    }
    catch (error) {
      if (isStaleGeneration())
        return

      console.error('Error sending message:', error)
      deps.onMessageRoundFailed?.({
        ...correlation,
        errorCode: 'llm_response_failed',
        failureStage: 'llm_response',
        model: options.model,
        provider: activeProvider,
        source: sendSource,
      })
      if (isActivationAttempt) {
        deps.onChatActivationFailed?.({
          ...correlation,
          errorCode: 'llm_response_failed',
          failureStage: 'llm_response',
          model: options.model,
          provider: activeProvider,
          source: sendSource,
        })
      }
      throw error
    }
    finally {
      setSending(false)
      deps.onSendSettled?.({ sessionId })
    }
  }

  const sendQueue = createQueue<QueuedSend>({
    handlers: [
      async ({ data }) => {
        const { cancelled, deferred, generation, options, sendingMessage, sessionId } = data

        if (cancelled)
          return

        if (deps.session.getSessionGeneration(sessionId) !== generation) {
          deferred.reject(new Error('Chat session was reset before send could start'))
          return
        }

        try {
          await performSend(sendingMessage, options, generation, sessionId)
          deferred.resolve()
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
  ) {
    const sessionId = targetSessionId || deps.getActiveSessionId()
    const generation = deps.session.getSessionGeneration(sessionId)

    return new Promise<void>((resolve, reject) => {
      sendQueue.enqueue({
        deferred: { reject, resolve },
        generation,
        options,
        sendingMessage,
        sessionId,
      })
    })
  }

  function cancelPendingSends(sessionId?: string) {
    for (const queued of pendingQueuedSends) {
      if (sessionId && queued.sessionId !== sessionId)
        continue

      queued.cancelled = true
      queued.deferred.reject(new Error('Chat session was reset before send could start'))
    }

    pendingQueuedSends = sessionId
      ? pendingQueuedSends.filter(item => item.sessionId !== sessionId)
      : []
    emitStateChange()
  }

  function getPendingQueuedSendSnapshot() {
    return pendingQueuedSends.map(queued => ({
      cancelled: !!queued.cancelled,
      generation: queued.generation,
      hasAttachments: !!queued.options.attachments?.length,
      inputType: queued.options.input?.type,
      messagePreview: queued.sendingMessage.slice(0, 120),
      sessionId: queued.sessionId,
    } satisfies QueuedSendSnapshot))
  }

  return {
    cancelPendingSends,
    getPendingQueuedSendCount: () => pendingQueuedSends.length,
    getPendingQueuedSendSnapshot,
    getSending: () => sending,
    hooks,
    ingest,
    setSending,
  }
}

function cloneStreamingMessage(message: StreamingAssistantMessage): StreamingAssistantMessage {
  try {
    return structuredClone(message)
  }
  catch {
    return JSON.parse(JSON.stringify(message)) as StreamingAssistantMessage
  }
}

function defaultCreateId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function prependTextToContent<T extends { content?: unknown }>(msg: T, text: string): T {
  const content = msg.content
  if (content === undefined)
    return { ...msg, content: text }
  if (typeof content === 'string')
    return { ...msg, content: `${text}${content}` }

  if (Array.isArray(content)) {
    const first = content[0] as undefined | { text?: string, type?: string }
    if (first && first.type === 'text' && typeof first.text === 'string') {
      const next = [{ ...first, text: `${text}${first.text}` }, ...content.slice(1)]
      return { ...msg, content: next }
    }
    return { ...msg, content: [{ text, type: 'text' }, ...content] }
  }

  return msg
}
