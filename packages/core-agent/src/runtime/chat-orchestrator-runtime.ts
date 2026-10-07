import type { BilingualTurnEvent, BilingualTurnSnapshot } from '@proj-airi/pipelines-audio'
import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { AgentContextPort } from '../contracts/context-port'
import type { AgentLLMPort } from '../contracts/llm-port'
import type { AgentForegroundStreamPort } from '../contracts/stream-port'
import type { AssistantTurn, Conversation, Turn } from '../messages/types'
import type { ChatHistoryItem, ChatSlices, ChatStreamEventContext, ChatToolReference, ContextMessage, StreamingAssistantMessage } from '../types/chat'
import type { LlmUsage, StreamEvent, StreamOptions } from '../types/llm'

import { createBilingualTurnSplitter, projectSpokenText, TTS_FLUSH_INSTRUCTION } from '@proj-airi/pipelines-audio'
import { createQueue } from '@proj-airi/stream-kit'

import { chatMessagesToTurns } from '../messages/chat-completions'
import { formatTimePrefix } from '../messages/datetime-prefix'
import { renderConversationPreview } from '../messages/preview'
import { createChatHooks } from './agent-hooks'
import { useLlmmarkerParser } from './llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from './response-categoriser'

const REASONING_UI_FLUSH_CHUNK_SIZE = 24

/**
 * Caps repeated reply text in the model prompt. The referenced message remains
 * in history, so the prefix only needs enough text to identify it.
 */
const REPLY_PROMPT_REFERENCE_CHARACTER_LIMIT = 480

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

function getMessageText(message: ChatHistoryItem): string {
  if (typeof message.content === 'string')
    return message.content

  if (!Array.isArray(message.content))
    return ''

  return message.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
}

/**
 * Formats a model-only reference to the message selected by the user.
 *
 * @example
 * formatReplyPromptPrefix('message-1', new Map([
 *   ['message-1', { id: 'message-1', role: 'user', content: 'Earlier turn' }],
 * ]))
 * // => '[Replying to: Earlier turn]\n'
 */
function formatReplyPromptPrefix(replyToMessageId: string | undefined, messagesById: Map<string, ChatHistoryItem>): string {
  if (!replyToMessageId)
    return ''

  const target = messagesById.get(replyToMessageId)
  if (!target)
    return ''

  const targetText = getMessageText(target).replace(/\s+/g, ' ').trim()
  const preview = targetText.length > REPLY_PROMPT_REFERENCE_CHARACTER_LIMIT
    ? `${targetText.slice(0, REPLY_PROMPT_REFERENCE_CHARACTER_LIMIT - 1).trimEnd()}…`
    : targetText
  return preview
    ? `[Replying to: ${preview}]\n`
    : `[Replying to message: ${replyToMessageId}]\n`
}

function resolveReplyTargetId(replyToMessageId: string | undefined, messages: ChatHistoryItem[]): string | undefined {
  if (!replyToMessageId)
    return undefined

  return messages.some(message => message.id === replyToMessageId)
    ? replyToMessageId
    : undefined
}

function cloneStreamingMessage(message: StreamingAssistantMessage): StreamingAssistantMessage {
  try {
    return structuredClone(message)
  }
  catch {
    return JSON.parse(JSON.stringify(message)) as StreamingAssistantMessage
  }
}

function hasAssistantOutput(message: StreamingAssistantMessage) {
  return message.slices.length > 0
    || message.tool_results.length > 0
    || (message.citations?.length ?? 0) > 0
    || !!message.categorization?.reasoning.trim()
}

/** Encoded attachments belong to one user message. Media capture and storage stay outside chat orchestration. */
export type ChatAttachment
  = { type: 'image', data: string, mimeType: string }
    | { type: 'audio', data: string, mimeType: 'audio/wav' | 'audio/mpeg' }

/** Options accepted by the chat orchestrator runtime for one user send. */
export interface ChatOrchestratorSendOptions {
  /** Identity captured with chatProvider. Omission selects the active provider when the request is enqueued. */
  providerId?: string
  /** Model capabilities captured before the request enters its session queue. */
  supportsAudioInput?: boolean
  supportsVisionInput?: boolean
  /** Request-owned character instructions, captured before waiting in the session queue. */
  systemPromptSupplement?: string
  /** Eligible catalog for this request. Omission disables stickers. The queue copies entries before waiting. */
  stickers?: readonly { id: string, description: string }[]
  /** Stable user-message identity. Retries acknowledge the existing message without generating another reply. */
  messageId?: string
  /** Cancellation belongs to this request, including queued work and provider generation. */
  signal?: AbortSignal
  /** Provider model identifier used for the outbound LLM request. */
  model: string
  /** Concrete chat provider implementation selected by the caller. */
  chatProvider: GenerationProvider
  /** Provider-specific request options, currently used for headers. */
  providerConfig?: Record<string, unknown>
  /** Attachments appended to the user message content parts. */
  attachments?: ChatAttachment[]
  /** Tool definitions passed through to the LLM stream port. */
  tools?: StreamOptions['tools']
  /** Serializable tool names stored with the user message for later requests. */
  toolReferences?: ChatToolReference[]
  /** Original transport input metadata used by bridge/devtools observers. */
  input?: ChatStreamEventContext['input']
  /** Message that the new user turn replies to in the target session. */
  replyToMessageId?: string
  /** Temperature for the LLM request. */
  temperature?: number
  /** Top_p for the LLM request. */
  topP?: number
}

interface QueuedSend {
  accepted: ReturnType<typeof Promise.withResolvers<{ sessionId: string, messageId: string }>>
  /** Keep provider identity paired with the client captured at enqueue time. */
  providerId: string
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
  /** Resolves after durable storage. A repeated identity does not append or change an existing user message. */
  commitUserMessage: (sessionId: string, message: Extract<ChatHistoryItem, { role: 'user' }> & { id: string }) => Promise<{ status: 'inserted' | 'existing', messageId: string }>
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
export type ChatOrchestratorLLMPort = AgentLLMPort

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
  /** Display projection for hooks and diagnostics. This is not an API payload. */
  composedMessage?: Message[]
}

/**
 * Reactive state mirrored by UI facades.
 */
export interface ChatOrchestratorRuntimeState {
  /** Active replies keyed by their owning sessions, including background generation. */
  activeTurns: readonly { sessionId: string, turnId: string, message: StreamingAssistantMessage }[]
  /** Whether the runtime currently owns an active send. */
  sending: boolean
  /** Session that owns the active send; undefined while the queue is idle. */
  activeSendSessionId?: string
  /** Latest assistant stream snapshot owned by the active send session. */
  activeStreamingMessage?: StreamingAssistantMessage
  /** Number of sends waiting behind the active one. */
  pendingQueuedSendCount: number
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

/**
 * Dependency surface used by the platform-agnostic chat orchestrator runtime.
 */
export interface ChatOrchestratorRuntimeDeps {
  /** Session persistence and generation guard port. */
  session: ChatOrchestratorSessionPort
  /** Context registry facade used for runtime context ingest, removal, and prompt snapshots. */
  context: Pick<AgentContextPort, 'ingest' | 'remove' | 'snapshot'>
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
  /**
   * Returns the bilingual snapshot for this send. Read once per send so that
   * settings changes do not affect an in-flight response. Undefined disables
   * splitting and leaves the text path unchanged.
   */
  getBilingualSnapshot?: () => BilingualTurnSnapshot | undefined
  /**
   * Builds the bilingual runtime prompt context for the snapshot captured at
   * the start of this send. The orchestrator reads the snapshot before any
   * async hook runs, so the injected prompt and the output splitter always
   * use the same mode. Undefined result adds no context.
   */
  getBilingualInstructionContext?: (snapshot: BilingualTurnSnapshot | undefined) => ContextMessage | undefined
  /**
   * Stable context bucket key of the bilingual instruction. When the
   * feature is disabled for a send, that bucket is removed from the
   * registry so a prompt injected by an earlier turn cannot survive the
   * setting change and keep making the model emit bracketed translations.
   */
  bilingualContextKey?: string
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
  onSendSettled?: (event: { sessionId: string, turnId: string, status: 'finished' | 'cancelled' | 'failed' }) => void
  /** Called when a send starts and the first assistant placeholder is created. */
  onTrackFirstMessage?: () => void
  /** Called for attempts made before the conversation has its first assistant response. */
  onChatActivationStarted?: (event: ChatRoundCorrelation & {
    source: 'text' | 'voice'
    model: string
    provider: string
  }) => void
  /** Called when the conversation reaches its first successful assistant response. */
  onChatActivationSucceeded?: (event: ChatRoundCorrelation & {
    source: 'text' | 'voice'
    model: string
    provider: string
    durationMs: number
  }) => void
  /** Called when a pre-activation attempt fails before assistant completion. */
  onChatActivationFailed?: (event: ChatRoundCorrelation & {
    source: 'text' | 'voice'
    model: string
    provider: string
    failureStage: 'llm_response'
    errorCode: 'llm_response_failed'
  }) => void
  /** Called when a user message send begins. */
  onMessageSendStarted?: (event: ChatRoundCorrelation & {
    source: 'text' | 'voice'
    model: string
  }) => void
  /** Called immediately before the provider LLM request starts. */
  onLlmRequestStarted?: (event: ChatRoundCorrelation & {
    model: string
    provider: string
    hasVoice: boolean
  }) => void
  /** Called when the first text token arrives from the provider stream. */
  onLlmFirstToken?: (event: ChatRoundCorrelation & {
    model: string
    ttfbMs: number
  }) => void
  /** Called after the assistant stream is parsed and rendered into runtime state. */
  onAssistantResponseRendered?: (event: ChatRoundCorrelation & {
    model: string
    latencyMs: number
  }) => void
  /** Called once per completed provider generation with content-free usage metadata. */
  onLlmGeneration?: (event: ChatRoundCorrelation & {
    model: string
    provider: string
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    usageSource: LlmUsage['source']
  }) => void
  /** Called after one user-to-assistant message round completes successfully. */
  onMessageRound?: (event: ChatRoundCorrelation & {
    durationMs: number
    hasVoice: boolean
    model: string
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    usageSource: LlmUsage['source']
  }) => void
  /** Called whenever a user-to-assistant round fails before completion. */
  onMessageRoundFailed?: (event: ChatRoundCorrelation & {
    source: 'text' | 'voice'
    model: string
    provider: string
    failureStage: 'llm_response'
    errorCode: 'llm_response_failed'
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
    roundId: string
    turnIndex: number
  }) => void
  /** Called after the assistant message has been finalized into session history. */
  onAssistantMessageAppended?: (event: {
    sessionId: string
    roundId: string
    message: StreamingAssistantMessage
    messageText: string
  }) => void
  /** Called after user turn persistence, before provider prompt composition. */
  onUserTurnReady?: (event: {
    sessionId: string
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
  /** Called after assistant streaming and hook finalization. */
  onAssistantTurnReady?: (event: {
    sessionId: string
    messageText: string
    sessionMessages: ChatHistoryItem[]
  }) => void
}

/**
 * Platform-agnostic chat orchestrator runtime API.
 */
export interface ChatOrchestratorRuntime {
  /** Cancels only the named turn. A different active turn in the same session remains open. */
  cancelTurn: (turn: { sessionId: string, turnId: string }) => void
  /** Exposes persistence acknowledgment separately from assistant generation completion. */
  submit: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => {
    accepted: Promise<{ sessionId: string, messageId: string }>
    done: Promise<void>
  }
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

/** Releases the request owner on abort even when an external provider does not settle. Late provider output remains signal-guarded. */
async function waitForProvider(work: Promise<unknown>, signal: AbortSignal) {
  const cancelled = Promise.withResolvers<never>()
  const abort = () => cancelled.reject(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted)
    abort()
  try {
    await Promise.race([work, cancelled.promise])
  }
  finally {
    signal.removeEventListener('abort', abort)
  }
}

/**
 * Projects a completed generated turn to spoken-only text for persisted
 * history. buildContext replays generationTranscript verbatim on the next
 * request, so an unprojected bilingual turn leaks every bracket translation
 * back to the provider and keeps feeding the model UST examples after the
 * feature is turned off. Only text segments are projected. Refusals, tool
 * segments, tool invocations, model calls, and provider continuation stay
 * intact for protocol replay.
 */
function projectTurnToSpoken(turn: AssistantTurn): AssistantTurn {
  return {
    ...turn,
    rounds: turn.rounds.map(round => ({
      ...round,
      content: round.content.map((segment) => {
        if (segment.type !== 'text')
          return segment
        const spoken = projectSpokenText(segment.text)
        if (spoken === segment.text)
          return segment
        // Projection shifts every character offset, so the old citation spans
        // no longer point at the cited range. Rebuild without them instead of
        // replaying misaligned citations.
        return { type: 'text', text: spoken }
      }),
    })),
  }
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
  // A queued send owns one controller until performSend settles. Session reset
  // aborts that transport as well as rejecting queued work for the same session.
  const activeSends = new Map<string, {
    controller: AbortController
    turnId?: string
    message?: StreamingAssistantMessage
  }>()
  const sendQueues = new Map<string, ReturnType<typeof createQueue<QueuedSend>>>()
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
      activeTurns: [...activeSends].flatMap(([sessionId, active]) => active.turnId && active.message
        ? [{ sessionId, turnId: active.turnId, message: active.message }]
        : []),
      sending,
      activeSendSessionId,
      activeStreamingMessage,
      pendingQueuedSendCount: pendingQueuedSends.length,
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
    const active = activeSends.get(sessionId)
    if (!active)
      return
    active.message = cloneStreamingMessage(message)
    sending = true
    activeSendSessionId = sessionId
    activeStreamingMessage = cloneStreamingMessage(message)
    emitStateChange()

    if (isForegroundSession(sessionId))
      deps.foregroundStream.patch(cloneStreamingMessage(message))
  }

  function updateStream(sessionId: string, message: StreamingAssistantMessage) {
    const active = activeSends.get(sessionId)
    if (!active)
      return
    active.message = cloneStreamingMessage(message)
    if (sessionId === activeSendSessionId) {
      activeStreamingMessage = active.message
    }
    emitStateChange()

    if (isForegroundSession(sessionId))
      deps.foregroundStream.patch(cloneStreamingMessage(message))
  }

  function resetForegroundStream(sessionId: string) {
    if (isForegroundSession(sessionId))
      deps.foregroundStream.reset()
  }

  function ingestRuntimeContexts(bilingualSnapshot?: BilingualTurnSnapshot) {
    for (const provider of deps.runtimeContextProviders ?? []) {
      const contextMessage = provider()
      if (contextMessage)
        deps.context.ingest(contextMessage)
    }
    const bilingualContext = deps.getBilingualInstructionContext?.(bilingualSnapshot)
    if (bilingualContext) {
      deps.context.ingest(bilingualContext)
    }
    else if (bilingualSnapshot === undefined && deps.bilingualContextKey) {
      // Disabled for this send: drop the dedicated bucket so the model
      // stops receiving the bracket-format instruction from earlier turns.
      deps.context.remove(deps.bilingualContextKey)
    }
  }

  function getStablePromptTimestamp(message: ChatHistoryItem, fallbackCreatedAt: number) {
    if (typeof message.createdAt === 'number')
      return message.createdAt

    message.createdAt = fallbackCreatedAt
    return fallbackCreatedAt
  }

  function buildContext(history: ChatHistoryItem[]): Conversation {
    const nowTs = now()
    const messagesById = new Map(history.flatMap(message => message.id ? [[message.id, message] as const] : []))
    const turns = history.flatMap((message, historyIndex): Turn[] => {
      if (message.role === 'assistant' && message.generationTranscript)
        return [structuredClone(unwrapMessage(message.generationTranscript))]
      const source = message.role === 'user'
        ? prependTextToContent(unwrapMessage(message), `${formatTimePrefix(getStablePromptTimestamp(message, nowTs))}${formatReplyPromptPrefix(message.replyToMessageId, messagesById)}`)
        : unwrapMessage(message)
      return chatMessagesToTurns(source.role === 'assistant' && source.providerTranscript?.length ? source.providerTranscript : [source], message.id ?? `history-${historyIndex}`)
    })
    return { turns }
  }

  async function performSend(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    generation: number,
    sessionId: string,
    abortSignal: AbortSignal,
    activeProvider: string,
    accepted: QueuedSend['accepted'],
  ) {
    if (!sendingMessage && !options.attachments?.length)
      return

    deps.session.ensureSession(sessionId)

    const existingSessionMessages = deps.session.getSessionMessages(sessionId)
    let replyToMessageId = resolveReplyTargetId(options.replyToMessageId, existingSessionMessages)
    const turnIndex = existingSessionMessages.filter(message => message.role === 'user').length + 1

    // Activation measures whether a conversation reaches its first assistant
    // response. Later turns still emit message and latency telemetry, but they
    // must not inflate the one-time activation milestones.
    const isActivationAttempt = !existingSessionMessages.some(message => message.role === 'assistant' && !message.interrupted)

    // Capture the bilingual snapshot before any async hook and before the
    // runtime contexts (which carry the bilingual prompt) are ingested. The
    // prompt mode and the output splitter must share this one value: reading
    // the settings again after `emitBeforeMessageComposedHooks` could pair a
    // bilingual prompt with no splitter (brackets spoken aloud) or a splitter
    // with no bilingual prompt (flush-only chunking on plain text).
    const bilingualSnapshot = deps.getBilingualSnapshot?.()

    // Datetime is no longer injected through the side-channel context store.
    // It is applied at message-assembly time (see below) as a system-prompt
    // date anchor + per-message [HH:MM] prefixes, which is more KV-cache
    // friendly and less prone to weak models echoing timestamps verbatim.
    ingestRuntimeContexts(bilingualSnapshot)

    const sendingCreatedAt = now()

    // TODO: Expire or prune stale runtime contexts from disconnected services before composing.
    // Allocate the three per-round ids in their historical order so callers
    // with deterministic id factories keep the same durable message ids.
    const streamContextMessageId = createId()
    const assistantMessageId = createId()
    const roundId = options.messageId ?? createId()
    const streamingMessageContext: ChatStreamEventContext = {
      sessionId,
      turnId: roundId,
      message: {
        role: 'user',
        content: sendingMessage,
        createdAt: sendingCreatedAt,
        id: streamContextMessageId,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      },
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
    const shouldAbort = () => isStaleGeneration() || abortSignal.aborted
    if (shouldAbort())
      return

    const buildingMessage: StreamingAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [],
      tool_results: [],
      createdAt: now(),
      id: assistantMessageId,
    }
    activeSends.get(sessionId)!.turnId = roundId
    beginStream(sessionId, buildingMessage)
    const hasVoice = options.input?.type === 'input:voice'
      || options.input?.type === 'input:text:voice'
    const sendSource = hasVoice ? 'voice' : 'text'
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
        source: sendSource,
        model: options.model,
        provider: activeProvider,
      })
    }
    deps.onMessageSendStarted?.({
      ...correlation,
      source: sendSource,
      model: options.model,
    })
    const roundStartedAt = monotonicNow()
    let assistantStored = false
    let generationCompleted = false
    let failed = false

    try {
      await hooks.emitBeforeMessageComposedHooks(sendingMessage, streamingMessageContext)

      const contentParts: CommonContentPart[] = [{ type: 'text', text: sendingMessage }]

      if (options.attachments) {
        for (const attachment of options.attachments) {
          if (attachment.type === 'audio') {
            contentParts.push({ type: 'input_audio', input_audio: { data: attachment.data, format: attachment.mimeType === 'audio/wav' ? 'wav' : 'mp3' } })
          }
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

      replyToMessageId = resolveReplyTargetId(
        options.replyToMessageId,
        deps.session.getSessionMessages(sessionId),
      )
      if (replyToMessageId)
        streamingMessageContext.message.replyToMessageId = replyToMessageId
      else
        delete streamingMessageContext.message.replyToMessageId

      const userMessage = {
        role: 'user' as const,
        content: finalContent,
        createdAt: sendingCreatedAt,
        id: roundId,
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(options.toolReferences?.length ? { tools: options.toolReferences } : {}),
      }
      const receipt = await deps.session.commitUserMessage(sessionId, userMessage)
      accepted.resolve({ sessionId, messageId: receipt.messageId })
      if (receipt.status === 'existing' || shouldAbort()) {
        resetForegroundStream(sessionId)
        return
      }

      // Cloud sync v1: only the raw text part round-trips; image attachments
      // and other non-text parts stay local.
      deps.onUserMessageAppended?.({
        sessionId,
        message: userMessage,
        messageText: sendingMessage,
        source: sendSource,
        model: options.model,
        provider: activeProvider,
        roundId,
        turnIndex,
      })

      const sessionMessagesForSend = deps.session.getSessionMessages(sessionId)
      deps.onUserTurnReady?.({
        sessionId,
        messageText: sendingMessage,
        sessionMessages: sessionMessagesForSend,
      })

      const categorizer = createStreamingCategorizer(activeProvider)
      let streamPosition = 0
      const stickers = options.stickers
      let stickerEmitted = false

      // Splitter state is owned by this send. The snapshot itself was
      // captured before the async before-compose hook above.
      const bilingual = bilingualSnapshot
        ? createBilingualTurnSplitter()
        : undefined

      function appendTextToBuildingMessage(text: string) {
        buildingMessage.content += text
        const lastSlice = buildingMessage.slices.at(-1)
        if (lastSlice?.type === 'text') {
          lastSlice.text += text
        }
        else {
          buildingMessage.slices.push({
            type: 'text',
            text,
          })
        }
      }

      // Spoken text stays on the chat surface: bubble, slices, stored history,
      // and the TTS literal hook. Translation text is subtitle-only and never
      // reaches the chat message, so history keeps just the spoken reply.
      async function applyBilingualEvent(event: BilingualTurnEvent): Promise<boolean> {
        if (event.kind === 'translation') {
          // Flush the spoken sentence in the TTS segmenter at the pair
          // boundary. The chunker cuts on sentence punctuation already;
          // the zero-width flush instruction is the deterministic fallback
          // when the model omitted punctuation. It never reaches the bubble
          // and the chunker strips it before synthesis.
          await hooks.emitTokenLiteralHooks(TTS_FLUSH_INSTRUCTION, streamingMessageContext)
          await hooks.emitTokenTranslationHooks({
            language: bilingualSnapshot!.translationLanguage,
            pairId: event.pairId,
            text: event.text,
          }, streamingMessageContext)
          return false
        }

        appendTextToBuildingMessage(event.text)
        if (event.text.trim())
          await hooks.emitTokenLiteralHooks(event.text, streamingMessageContext)
        return true
      }

      async function routeSpeechEvents(text: string) {
        if (!bilingual) {
          if (text.trim()) {
            buildingMessage.content += text

            await hooks.emitTokenLiteralHooks(text, streamingMessageContext)
            if (shouldAbort())
              return

            const lastSlice = buildingMessage.slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += text
            }
            else {
              buildingMessage.slices.push({
                type: 'text',
                text,
              })
            }
            updateStream(sessionId, buildingMessage)
          }
          return
        }

        let bubbleChanged = false
        for (const event of bilingual.consume(text))
          bubbleChanged = (await applyBilingualEvent(event)) || bubbleChanged

        if (bubbleChanged)
          updateStream(sessionId, buildingMessage)
      }

      const parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          if (shouldAbort())
            return

          categorizer.consume(literal)

          const speechOnly = categorizer.filterToSpeech(literal, streamPosition)
          streamPosition += literal.length

          await routeSpeechEvents(speechOnly)
        },
        onSpecial: async (special) => {
          if (shouldAbort())
            return

          if (/^<\|STICKER\b/.test(special)) {
            // Text-based reasoning can contain markers too. Only visible speech can select an image.
            if (!categorizer.filterToSpeech(special, streamPosition))
              return
            const id = /^<\|STICKER ([a-z0-9-]+)\|>$/.exec(special)?.[1]
            if (!stickerEmitted && id && stickers?.some(sticker => sticker.id === id)) {
              buildingMessage.slices.push({ type: 'sticker', stickerId: id })
              stickerEmitted = true
              updateStream(sessionId, buildingMessage)
            }
            // Sticker markers are UI data, including invalid IDs. Speech and plugins must not execute them.
            return
          }

          await hooks.emitTokenSpecialHooks(special, streamingMessageContext)
        },
        onEnd: async (fullText) => {
          if (shouldAbort())
            return

          // Strip only sticker markers, including the escaped form accepted by the parser.
          const speechText = fullText.replace(/<(?:\||\{'\|'\})STICKER\b[\s\S]*?(?:(?:\||\{'\|'\})>|$)/g, '')
          const finalCategorization = categorizeResponse(speechText, activeProvider)

          const reasoningContentField = buildingMessage.categorization?.reasoning?.trim()
          buildingMessage.categorization = {
            speech: finalCategorization.speech,
            reasoning: reasoningContentField || finalCategorization.reasoning,
          }
          updateStream(sessionId, buildingMessage)
        },
        // The parser keeps its own marker-safety tail. Emit each safe literal
        // chunk so slow providers update the chat before they reach 24 characters.
        minLiteralEmitLength: 1,
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

      const context = buildContext(sessionMessagesForSend)
      const stickerPrompt = stickers?.length
        ? [
            'You can send one optional sticker per reply with a marker from this catalog.',
            'Use stickers when the user requests one or when a lighthearted response fits. Avoid them in serious conversations.',
            'Keep your text complete. Never invent sticker IDs or image URLs.',
            'Choose the ID whose name and emotion tags best fit the conversation.',
            ...stickers.map(sticker => `<|STICKER ${sticker.id}|>: ${sticker.description}`),
          ].join('\n')
        : ''
      const systemPromptSupplement = [options.systemPromptSupplement?.trim(), stickerPrompt].filter(Boolean).join('\n\n')
      if (systemPromptSupplement) {
        const systemMessage = context.turns.find(turn => turn.type === 'system' && turn.authority === 'system')
        if (systemMessage?.type === 'system')
          systemMessage.content.push({ type: 'text', text: `\n\n${systemPromptSupplement}` })
        else
          context.turns.unshift({ id: 'system-supplement', type: 'system', authority: 'system', content: [{ type: 'text', text: systemPromptSupplement }] })
      }

      const contextsSnapshot = deps.context.snapshot()
      const entries = Object.entries(contextsSnapshot).flatMap(([source, messages]) => messages.map(message => ({ source, text: message.text })))
      if (entries.length) {
        const lastMessage = context.turns.at(-1)
        if (lastMessage?.type === 'user')
          lastMessage.content.push({ type: 'runtime-context', entries })
        deps.onLifecycle?.({ phase: 'prompt-context-built', channel: 'chat', sessionId, details: { contexts: contextsSnapshot } })
      }

      // Hooks, diagnostics, and the plugin bridge consume a display projection. It contains
      // no native continuation state and never becomes a provider request.
      streamingMessageContext.composedMessage = renderConversationPreview(context)
      deps.onPromptProjection?.({
        sessionId,
        message: sendingMessage,
        contexts: contextsSnapshot,
        composedMessage: streamingMessageContext.composedMessage,
      })
      deps.onLifecycle?.({
        phase: 'after-compose',
        channel: 'chat',
        sessionId,
        textPreview: sendingMessage,
        details: { composedMessage: streamingMessageContext.composedMessage },
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
      let generatedTurn: AssistantTurn | undefined
      deps.onLlmRequestStarted?.({
        ...correlation,
        model: options.model,
        provider: activeProvider || 'unknown',
        hasVoice,
      })

      await waitForProvider(deps.llm.stream(options.model, options.chatProvider, context, {
        headers,
        providerId: activeProvider,
        supportsAudioInput: options.supportsAudioInput,
        supportsVisionInput: options.supportsVisionInput,
        abortSignal,
        onGeneratedTurn: (turn) => { generatedTurn = structuredClone(turn) },
        requestCorrelation: {
          conversationId: correlation.conversationId,
          turnId: correlation.roundId,
        },
        tools: options.tools,
        temperature: options.temperature,
        topP: options.topP,
        waitForTools: true,
        onUsage: (usage) => {
          if (shouldAbort())
            return

          generationUsage = usage
          deps.onLlmGeneration?.({
            ...correlation,
            model: options.model,
            provider: activeProvider,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            usageSource: usage.source,
          })
        },
        onStreamEvent: async (event: StreamEvent) => {
          if (shouldAbort())
            return

          switch (event.type) {
            case 'search':
              buildingMessage.search = { id: event.id, status: event.status }
              updateStream(sessionId, buildingMessage)
              break
            case 'citations':
              buildingMessage.citations = [...(buildingMessage.citations ?? []), ...event.citations]
              updateStream(sessionId, buildingMessage)
              break
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
                  ...correlation,
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
                = Math.floor(nextReasoning.length / REASONING_UI_FLUSH_CHUNK_SIZE)
                  > Math.floor(reasoning.length / REASONING_UI_FLUSH_CHUNK_SIZE)
              if (!reasoning || crossesBoundary)
                updateStream(sessionId, buildingMessage)
              break
            }
            case 'finish':
              break
            case 'error':
              throw event.error ?? new Error('Stream error')
          }
        },
      }), abortSignal)

      // Session generation is the lifecycle correlation key. Re-check it
      // after every awaited completion boundary so deleting a session while a
      // plugin hook runs cannot leak later hooks or success analytics.
      if (shouldAbort())
        return

      await parser.end()
      if (shouldAbort())
        return

      // Flush splitter state at stream end. A final translation block
      // without a closing bracket still reaches the subtitle track; an
      // unclosed bracket candidate stays in the message but never reaches
      // TTS.
      if (bilingual) {
        let spokenTail = ''
        for (const event of bilingual.end()) {
          if (event.kind === 'spoken') {
            spokenTail += event.text
          }
          else {
            await hooks.emitTokenTranslationHooks({
              language: bilingualSnapshot!.translationLanguage,
              pairId: event.pairId,
              text: event.text,
            }, streamingMessageContext)
          }
        }
        if (spokenTail) {
          appendTextToBuildingMessage(spokenTail)
          updateStream(sessionId, buildingMessage)
        }
      }

      generationCompleted = true
      // Bilingual turns keep bracket translations inside the portable
      // transcript; strip them before the message reaches stored history so
      // the next provider request replays spoken text only.
      buildingMessage.generationTranscript = bilingualSnapshot && generatedTurn
        ? projectTurnToSpoken(generatedTurn)
        : generatedTurn
      try {
        deps.onAssistantResponseRendered?.({
          ...correlation,
          model: options.model,
          latencyMs: Math.round(monotonicNow() - llmRequestStartedAt),
        })
      }
      catch (error) {
        console.error('Assistant response observer failed:', error)
      }

      if (!shouldAbort() && (buildingMessage.slices.length > 0 || generatedTurn?.rounds.length)) {
        const finalAssistant = buildingMessage
        deps.session.appendSessionMessage(sessionId, finalAssistant)
        assistantStored = true
        deps.onAssistantMessageAppended?.({
          sessionId,
          roundId,
          message: finalAssistant,
          messageText: fullText,
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
        sessionId,
        messageText: fullText,
        sessionMessages: sessionMessagesForSend,
      })

      resetForegroundStream(sessionId)
      const durationMs = Math.round(monotonicNow() - roundStartedAt)
      deps.onMessageRound?.({
        ...correlation,
        durationMs,
        hasVoice,
        model: options.model,
        inputTokens: generationUsage.inputTokens,
        outputTokens: generationUsage.outputTokens,
        totalTokens: generationUsage.totalTokens,
        usageSource: generationUsage.source,
      })
      if (isActivationAttempt) {
        deps.onChatActivationSucceeded?.({
          ...correlation,
          durationMs,
          source: sendSource,
          model: options.model,
          provider: activeProvider,
        })
      }
    }
    catch (error) {
      if (shouldAbort())
        return
      failed = true

      if (!assistantStored && !generationCompleted && hasAssistantOutput(buildingMessage)) {
        // Keep received output local, but do not run completion hooks or cloud
        // sync for an assistant turn that never reached a terminal event.
        deps.session.appendSessionMessage(sessionId, { ...cloneStreamingMessage(buildingMessage), interrupted: true })
      }
      resetForegroundStream(sessionId)

      console.error('Error sending message:', error)
      deps.onMessageRoundFailed?.({
        ...correlation,
        source: sendSource,
        model: options.model,
        provider: activeProvider,
        failureStage: 'llm_response',
        errorCode: 'llm_response_failed',
      })
      if (isActivationAttempt) {
        deps.onChatActivationFailed?.({
          ...correlation,
          source: sendSource,
          model: options.model,
          provider: activeProvider,
          failureStage: 'llm_response',
          errorCode: 'llm_response_failed',
        })
      }
      throw error
    }
    finally {
      if (!assistantStored
        && !generationCompleted
        && abortSignal.aborted
        && !isStaleGeneration()
        && hasAssistantOutput(buildingMessage)) {
        deps.session.appendSessionMessage(sessionId, { ...cloneStreamingMessage(buildingMessage), interrupted: true })
        resetForegroundStream(sessionId)
      }
      activeSends.delete(sessionId)
      sending = activeSends.size > 0
      if (activeSendSessionId === sessionId) {
        activeSendSessionId = activeSends.keys().next().value
        activeStreamingMessage = activeSendSessionId ? activeSends.get(activeSendSessionId)?.message : undefined
      }
      emitStateChange()
      deps.onSendSettled?.({ sessionId, turnId: roundId, status: shouldAbort() ? 'cancelled' : failed ? 'failed' : 'finished' })
    }
  }

  /** Each session owns its FIFO. A blocked provider cannot prevent another session from starting. */
  function queueFor(sessionId: string) {
    const existing = sendQueues.get(sessionId)
    if (existing)
      return existing
    const sendQueue = createQueue<QueuedSend>({
      handlers: [
        async ({ data }) => {
          const { sendingMessage, options, generation, deferred, sessionId, cancelled, providerId } = data

          if (cancelled)
            return

          if (deps.session.getSessionGeneration(sessionId) !== generation) {
            const error = new Error('Chat session was reset before send could start')
            data.accepted.reject(error)
            deferred.reject(error)
            return
          }

          const controller = new AbortController()
          activeSends.set(sessionId, { controller })
          try {
            await performSend(sendingMessage, options, generation, sessionId, options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal, providerId, data.accepted)
            deferred.resolve()
          }
          catch (error) {
            data.accepted.reject(error)
            deferred.reject(error)
          }
          finally {
            data.accepted.reject(new Error('Chat request ended before persistence'))
            activeSends.delete(sessionId)
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

    sendQueue.on('drain', () => {
      if (sendQueues.get(sessionId) === sendQueue)
        sendQueues.delete(sessionId)
    })
    sendQueues.set(sessionId, sendQueue)
    return sendQueue
  }

  function submit(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    targetSessionId?: string,
  ) {
    const sessionId = targetSessionId ?? deps.getActiveSessionId()
    const generation = deps.session.getSessionGeneration(sessionId)
    const accepted = Promise.withResolvers<{ sessionId: string, messageId: string }>()
    const deferred = Promise.withResolvers<void>()
    // Callers can await either boundary first. Failures remain visible on both original promises.
    void accepted.promise.catch(() => {})
    void deferred.promise.catch(() => {})
    queueFor(sessionId).enqueue({
      providerId: options.providerId ?? deps.getActiveProvider?.() ?? '',
      sendingMessage,
      options: {
        ...options,
        systemPromptSupplement: options.systemPromptSupplement ?? deps.getSystemPromptSupplement?.(),
        stickers: options.stickers?.map(({ id, description }) => ({ id, description })),
      },
      generation,
      sessionId,
      accepted,
      deferred,
    })
    return { accepted: accepted.promise, done: deferred.promise }
  }

  function ingest(sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) {
    return submit(sendingMessage, options, targetSessionId).done
  }

  function cancelPendingSends(sessionId?: string) {
    for (const [activeSessionId, active] of activeSends) {
      if (!sessionId || sessionId === activeSessionId)
        active.controller.abort(new Error('Chat session send was cancelled'))
    }

    for (const queued of pendingQueuedSends) {
      if (sessionId && queued.sessionId !== sessionId)
        continue

      queued.cancelled = true
      const error = new Error('Chat session was reset before send could start')
      queued.accepted.reject(error)
      queued.deferred.reject(error)
    }

    pendingQueuedSends = sessionId
      ? pendingQueuedSends.filter(item => item.sessionId !== sessionId)
      : []
    emitStateChange()
  }

  function cancelTurn(turn: { sessionId: string, turnId: string }) {
    if (activeSends.get(turn.sessionId)?.turnId === turn.turnId)
      activeSends.get(turn.sessionId)?.controller.abort(new Error('Chat turn was cancelled'))
    for (const queued of pendingQueuedSends) {
      if (queued.sessionId !== turn.sessionId || queued.options.messageId !== turn.turnId)
        continue
      queued.cancelled = true
      const error = new Error('Chat turn was cancelled before it started')
      queued.accepted.reject(error)
      queued.deferred.reject(error)
    }
    pendingQueuedSends = pendingQueuedSends.filter(queued => !queued.cancelled)
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
    cancelTurn,
    submit,
    ingest,
    cancelPendingSends,
    getPendingQueuedSendSnapshot,
    getPendingQueuedSendCount: () => pendingQueuedSends.length,
    getSending: () => sending,
    setSending,
    hooks,
  }
}
