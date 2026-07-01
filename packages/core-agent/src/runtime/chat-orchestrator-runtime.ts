import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { AgentContextPort } from '../contracts/context-port'
import type { AgentForegroundStreamPort } from '../contracts/stream-port'
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlices, ChatStreamEventContext, ContextMessage, StreamingAssistantMessage } from '../types/chat'
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
}

interface QueuedSend {
  sendingMessage: string
  options: ChatOrchestratorSendOptions
  generation: number
  sessionId: string
  cancelled?: boolean
  deferred: {
    resolve: () => void
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
  /** Whether the queued send has been rejected before execution. */
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
  /** Called when a user starts a chat activation attempt. */
  onChatActivationStarted?: (event: {
    sessionId: string
    source: 'text' | 'voice'
    model: string
    provider: string
  }) => void
  /** Called after one user-to-assistant message round completes successfully. */
  onChatActivationSucceeded?: (event: {
    source: 'text' | 'voice'
    model: string
    provider: string
    durationMs: number
  }) => void
  /** Called after a chat activation attempt fails before assistant completion. */
  onChatActivationFailed?: (event: {
    source: 'text' | 'voice'
    model: string
    provider: string
    failureStage: 'llm_response'
    errorCode: 'llm_response_failed'
  }) => void
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
  /** Called after the user message has been appended to session history. */
  onUserMessageAppended?: (event: {
    sessionId: string
    message: Extract<ChatHistoryItem, { role: 'user' }> & { id: string }
    messageText: string
    source: 'text' | 'voice'
    model: string
    provider: string
    turnIndex: number
  }) => void
  /** Called after the assistant message has been finalized into session history. */
  onAssistantMessageAppended?: (event: {
    sessionId: string
    message: StreamingAssistantMessage
    messageText: string
  }) => void
  /** Called after user turn persistence, before provider prompt composition. */
  onUserTurnReady?: (event: {
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
  /** Called after assistant streaming and hook finalization. */
  onAssistantTurnReady?: (event: {
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
}

/**
 * Platform-agnostic chat orchestrator runtime API.
 */
export interface ChatOrchestratorRuntime {
  /** Enqueues a user send for the target session, preserving FIFO order. */
  ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<void>
  /** Rejects queued sends that have not started yet. */
  cancelPendingSends: (sessionId?: string) => void
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
      const { context: _context, id: _id, createdAt, ...withoutContext } = msg
      const rawMessage = unwrapMessage(withoutContext)

      if (rawMessage.role === 'user') {
        return prependTextToContent(rawMessage, formatTimePrefix(createdAt ?? nowTs))
      }

      if (rawMessage.role === 'assistant') {
        const { slices: _slices, tool_results: _toolResults, categorization: _categorization, ...rest } = rawMessage as ChatAssistantMessage
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
  ) {
    if (!sendingMessage && !options.attachments?.length)
      return

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

    const isStaleGeneration = () => deps.session.getSessionGeneration(sessionId) !== generation
    const shouldAbort = () => isStaleGeneration()
    if (shouldAbort())
      return

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
    const sendSource = options.input ? 'voice' : 'text'
    const activeProvider = deps.getActiveProvider?.() ?? ''
    deps.onTrackFirstMessage?.()
    deps.onChatActivationStarted?.({
      sessionId,
      source: sendSource,
      model: options.model,
      provider: activeProvider,
    })
    deps.onMessageSendStarted?.({
      source: sendSource,
      model: options.model,
    })
    const roundStartedAt = monotonicNow()

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
        return

      const userMessageId = createId()
      const userMessage = {
        role: 'user' as const,
        content: finalContent,
        createdAt: sendingCreatedAt,
        id: userMessageId,
      }
      deps.session.appendSessionMessage(sessionId, userMessage)
      const userTurnIndex = deps.session.getSessionMessages(sessionId).filter(message => message.role === 'user').length

      // Cloud sync v1: only the raw text part round-trips; image attachments
      // and other non-text parts stay local.
      deps.onUserMessageAppended?.({
        sessionId,
        message: userMessage,
        messageText: sendingMessage,
        source: sendSource,
        model: options.model,
        provider: activeProvider,
        turnIndex: userTurnIndex,
      })

      const sessionMessagesForSend = deps.session.getSessionMessages(sessionId)
      deps.onUserTurnReady?.({
        messageText: sendingMessage,
        sessionMessages: sessionMessagesForSend,
      })

      const categorizer = createStreamingCategorizer(deps.getActiveProvider())
      let streamPosition = 0

      const parser = useLlmmarkerParser({
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
                type: 'text',
                text: speechOnly,
              })
            }
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
            if (shouldAbort())
              return
            if (ctx.data.type === 'tool-call') {
              buildingMessage.slices.push(ctx.data)
              patchForegroundStream(sessionId, buildingMessage)
              return
            }

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

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      if (shouldAbort())
        return

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
              if (!llmFirstTokenEmitted) {
                llmFirstTokenEmitted = true
                deps.onLlmFirstToken?.({
                  model: options.model,
                  ttfbMs: Math.round(monotonicNow() - llmRequestStartedAt),
                })
              }
              fullText += event.text
              await parser.consume(event.text)
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

      await parser.end()
      deps.onAssistantResponseRendered?.({
        model: options.model,
        latencyMs: Math.round(monotonicNow() - llmRequestStartedAt),
      })

      if (!isStaleGeneration() && buildingMessage.slices.length > 0) {
        const finalAssistant = buildingMessage
        deps.session.appendSessionMessage(sessionId, finalAssistant)
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
      const durationMs = Math.round(monotonicNow() - roundStartedAt)
      deps.onMessageRound?.({
        durationMs,
        hasVoice: !!options.input,
        model: options.model,
      })
      deps.onChatActivationSucceeded?.({
        durationMs,
        source: sendSource,
        model: options.model,
        provider: activeProvider,
      })
    }
    catch (error) {
      console.error('Error sending message:', error)
      deps.onChatActivationFailed?.({
        source: sendSource,
        model: options.model,
        provider: activeProvider,
        failureStage: 'llm_response',
        errorCode: 'llm_response_failed',
      })
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
        const { sendingMessage, options, generation, deferred, sessionId, cancelled } = data

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
    getPendingQueuedSendSnapshot,
    getPendingQueuedSendCount: () => pendingQueuedSends.length,
    getSending: () => sending,
    setSending,
    hooks,
  }
}
