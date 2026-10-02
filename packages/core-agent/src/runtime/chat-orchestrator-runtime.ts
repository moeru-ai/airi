import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { AgentContextPort } from '../contracts/context-port'
import type { AgentLLMPort } from '../contracts/llm-port'
import type { AgentForegroundStreamPort } from '../contracts/stream-port'
import type { AssistantTurn, Conversation, Turn } from '../messages/types'
import type { ChatHistoryItem, ChatSlices, ChatStreamEventContext, ChatToolReference, ContextMessage, StreamingAssistantMessage } from '../types/chat'
import type { LlmUsage, StreamEvent, StreamOptions } from '../types/llm'
import type { Audience } from './audience'
import type { IntakeDecision, IntakeRecord, Stimulus } from './intake'
import type { AgentRun, ExecutionEnvelope } from './run-table'

import { errorMessageFrom } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { chatMessagesToTurns } from '../messages/chat-completions'
import { formatTimePrefix } from '../messages/datetime-prefix'
import { deliveredSpeechText, deliveredSpeechTurn } from '../messages/delivered-speech'
import { renderConversationPreview } from '../messages/preview'
import { createChatHooks } from './agent-hooks'
import { audienceIncludes, intersectAudiences, OWNER_AUDIENCE } from './audience'
import { loadContextTokenCounter } from './context-budget'
import { estimateTurnsTokens, fitHistoryToBudget, projectedTurnsSizeBound } from './history-budget'
import { IntakeLog, salienceFromUrgency } from './intake'
import { LeaseTable } from './lease-table'
import { useLlmmarkerParser } from './llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from './response-categoriser'
import { superviseRun } from './run-supervision'
import { RunTable } from './run-table'
import { STAY_QUIET_TOOL_NAME, stayQuietReason } from './stay-quiet'

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

/**
 * Options accepted by the chat orchestrator runtime for one user send.
 */
export interface ChatOrchestratorSendOptions {
  /** Provider model identifier used for the outbound LLM request. */
  model: string
  /** Concrete chat provider implementation selected by the caller. */
  chatProvider: GenerationProvider
  /** Provider-specific request options, currently used for headers. */
  providerConfig?: Record<string, unknown>
  /** Image attachments appended to the user message content parts. */
  attachments?: { type: 'image', data: string, mimeType: string }[]
  /** Tool definitions passed through to the LLM stream port. */
  tools?: StreamOptions['tools']
  /** Serializable tool names stored with the user message for later requests. */
  toolReferences?: ChatToolReference[]
  /** Original transport input metadata used by bridge/devtools observers. */
  input?: ChatStreamEventContext['input']
  /** Host-selected return connection. This transport address does not grant access to context. */
  outputTarget?: ChatStreamEventContext['outputTarget']
  /** Message that the new user turn replies to in the target session. */
  replyToMessageId?: string
  /** Temperature for the LLM request. */
  temperature?: number
  /** Top_p for the LLM request. */
  topP?: number
}

interface QueuedSend {
  /** Run admitted for this send. */
  runId: string
  envelope: ExecutionEnvelope
  /** Salience from intake. It ranks the send among candidates for the voice. */
  salience: number
  /** Admission time. Within one salience tier, a longer wait goes first. */
  queuedAt: number
  /** Direct owner input. It cuts into speech that keeps playing after its run. */
  direct: boolean
  /** Message ids that this run wrote. A rollback removes them. */
  writtenMessageIds: string[]
  /** Set while the send runs. */
  controller?: AbortController
  /** Set when the host cancels the run. */
  cancellation?: { rollback: boolean }
  /** Set when supervision ends the run. */
  supervision?: { state: 'expired' | 'blocked', reason: string }
  /** Set when the run chose silence. */
  silent?: { reason?: string }
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
  /** Ensures a session exists before messages are appended. */
  ensureSession: (sessionId: string) => void
  /** Returns chronological chat history for a session. */
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
  /** Appends a finalized user/assistant/tool history item. */
  appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void
  /** Returns a monotonic generation used to reject stale queued sends. */
  getSessionGeneration: (sessionId: string) => number
  /** Returns the audience that the session history may reach. A run must stay inside it. @default the owner */
  getSessionAudience?: (sessionId: string) => Audience | undefined
  /** Narrows the session audience after a run writes output derived from labeled reads. */
  narrowSessionAudience?: (sessionId: string, audience: Audience) => void
  /** Removes messages that a cancelled run wrote. Required for rollback. */
  removeSessionMessages?: (sessionId: string, messageIds: readonly string[]) => void
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
  /** Sessions that have a running send. Each session runs at most one send at a time. */
  runningSessionIds: string[]
  /** Session of the running send that holds the voice. At most one send holds it. */
  voiceSessionId?: string
  /** Latest assistant stream snapshot of each running session. */
  streamingMessages: Record<string, StreamingAssistantMessage>
  /** Number of sends waiting for their session or for a free run slot. */
  pendingQueuedSendCount: number
}

/** Capacity limits that admission and scheduling read on each decision. */
export interface ChatOrchestratorRuntimeLimits {
  /** Working runs at the same time, counted across every owner that shares the run table. `1` serializes all active work. @default 4 */
  maxConcurrentRuns: number
  /** Sends that can wait in one session. A full session rejects new work before a run exists. @default 8 */
  maxQueuedPerSession: number
  /** A running send without a stream event for this long expires. @default 60000 */
  stallTimeoutMs: number
  /** A running send expires after this total time. @default 600000 */
  runDeadlineMs: number
  /** Tokens of session history in one request. Older exchanges give way to a short note. @default 32000 */
  historyTokenBudget: number
}

/** Failure reason of a run whose session narrowed below its audience after admission. */
const SESSION_NARROWED = 'The session audience narrowed below the run audience'

/** Identical consecutive tool calls that end a run. Supervision stops a loop instead of waiting for the deadline. */
const REPEATED_TOOL_CALL_LIMIT = 3

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
  /**
   * Returns the identity and format rules for the run's persona, read when the run starts.
   * With it, history carries no identity. Stored system messages are skipped, so a persona edit or switch reaches the next run of its own sessions only.
   */
  getSystemPrompt?: (envelope: ExecutionEnvelope) => string | undefined
  /** Returns the session digest, which can stand in for history that no longer fits the budget. */
  getHistoryDigest?: (sessionId: string) => { text: string, upToMessageId: string } | undefined
  /**
   * Builds the limits for one send. The runtime records them in the run table.
   * @default the session alone, with the owner chat and the voice as its outputs
   */
  createEnvelope?: (sessionId: string, options: ChatOrchestratorSendOptions) => Omit<ExecutionEnvelope, 'sessionId'>
  /** Run table shared with other run owners in the host. @default a table owned by this runtime */
  runs?: RunTable
  /** Intake trace shared with other stimulus sources in the host. @default a trace owned by this runtime */
  intake?: IntakeLog
  /** Exclusive resources shared with other run owners in the host. A send with the `voice` output holds `voice`. @default leases owned by this runtime */
  leases?: LeaseTable
  /** Called whenever a run is admitted or changes state. */
  onRunChange?: (run: AgentRun) => void
  /**
   * Decides whether direct owner input becomes a run. It is synchronous and local, so the owner never waits for a remote classifier.
   * A throwing policy admits the input as the fallback.
   * @default {@link decideDirectInput}
   */
  decideDirectIntake?: (stimulus: Stimulus) => ChatIntakeDecision
  /**
   * Decides whether input from a connection becomes a run. It can ask a remote classifier.
   * A failure admits the input as the fallback, so a broken policy cannot lose input.
   * @default admit every input
   */
  decideIntake?: (stimulus: Stimulus) => ChatIntakeDecision | Promise<ChatIntakeDecision>
  /**
   * Returns a rejection message while the optional user spending limit is reached.
   * The limit stops new runs and shows why. It never selects a cheaper model.
   */
  checkSpendingLimit?: () => string | undefined
  /** Called for every intake decision, including ignored and rejected input. */
  onIntakeRecord?: (record: IntakeRecord) => void
  /** Reads the current capacity limits. Invalid values use the defaults. */
  getLimits?: () => Partial<ChatOrchestratorRuntimeLimits>
  /** Request-owned context providers evaluated once per send for its session and message, outside the shared pool. */
  runtimeContextProviders?: Array<(sessionId: string, message: string) => ContextMessage | null | undefined>
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
  /** Called after a runtime-owned send completes or fails and its stream has ended. */
  onSendSettled?: (event: { sessionId: string }) => void
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

/** Chat input either becomes a run or is ignored. It never waits for a later turn. */
export type ChatIntakeDecision = IntakeDecision & { outcome: 'admitted' | 'ignored' }

/**
 * Default local intake rule for direct owner input.
 *
 * Returns:
 * - `ignored` for input with no text and no attachments. Otherwise `admitted`. An admitted run can still choose silence.
 */
export function decideDirectInput(stimulus: Stimulus): ChatIntakeDecision {
  if (!stimulus.text?.trim() && !stimulus.hasAttachments)
    return { outcome: 'ignored', reason: 'empty-input', decidedBy: 'rule' }
  return { outcome: 'admitted', reason: 'direct-input', decidedBy: 'rule' }
}

/** Result of one chat input. An ignored input has no run. */
export interface ChatIngestResult {
  stimulusId: string
  outcome: 'admitted' | 'ignored'
  runId?: string
}

/**
 * Platform-agnostic chat orchestrator runtime API.
 */
export interface ChatOrchestratorRuntime {
  /**
   * Offers one input to intake. An admitted send runs in its session queue, and the promise settles when the run ends.
   * An audience or capacity failure rejects before a run exists.
   */
  ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<ChatIngestResult>
  /** Rejects queued sends that have not started yet. */
  cancelPendingSends: (sessionId?: string) => void
  /** Returns serializable snapshots of currently queued sends. */
  getPendingQueuedSendSnapshot: () => QueuedSendSnapshot[]
  /** Returns the current queued send count. */
  getPendingQueuedSendCount: () => number
  /** Returns the sessions that have a running send. */
  getRunningSessionIds: () => string[]
  /** Cancels one waiting or running run. With rollback, its writes leave the session. */
  cancelRun: (runId: string, options?: { rollback?: boolean }) => boolean
  /** Hook registry preserved from the previous stage-ui store API. */
  hooks: ReturnType<typeof createChatHooks>
  /** Returns one run with its envelope. */
  getRun: (runId: string) => AgentRun | undefined
  /** Returns admitted, active, and recently finished runs. */
  getRuns: () => AgentRun[]
  /** Returns recent intake decisions, oldest first. */
  getIntakeRecords: () => IntakeRecord[]
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
 * - A runtime with per-session send queues, hook registry, running state, and queue snapshots.
 */
export function createChatOrchestratorRuntime(deps: ChatOrchestratorRuntimeDeps): ChatOrchestratorRuntime {
  // A queued send owns one controller until performSend settles. Session reset
  // aborts that transport as well as rejecting queued work for the same session.
  const activeSends = new Map<string, AbortController>()
  const hooks = createChatHooks()
  const now = deps.now ?? (() => Date.now())
  const monotonicNow = deps.monotonicNow ?? (() => globalThis.performance?.now?.() ?? Date.now())
  const createId = deps.createId ?? defaultCreateId
  const unwrapMessage = deps.unwrapMessage ?? (<T>(message: T) => message)

  const streamingMessages = new Map<string, StreamingAssistantMessage>()
  // Waiting sends in admission order, and the running send of each session.
  let pendingQueuedSends: QueuedSend[] = []
  const runningSends = new Map<string, QueuedSend>()
  const runs = deps.runs ?? new RunTable({ now })
  const intake = deps.intake ?? new IntakeLog({ now })
  const leases = deps.leases ?? new LeaseTable({ now })
  if (deps.onRunChange)
    runs.subscribe(deps.onRunChange)
  if (deps.onIntakeRecord)
    intake.subscribe(deps.onIntakeRecord)
  // Another owner can release the voice or end a run, so waiting sends get another chance.
  leases.subscribe(() => queueMicrotask(pump))
  runs.subscribe(() => queueMicrotask(pump))

  function emitStateChange() {
    deps.onStateChange?.({
      runningSessionIds: Array.from(runningSends.keys()),
      voiceSessionId: Array.from(runningSends.values()).find(send => send.envelope.outputs.includes('voice'))?.sessionId,
      streamingMessages: Object.fromEntries(Array.from(streamingMessages, ([sessionId, message]) => [sessionId, cloneStreamingMessage(message)])),
      pendingQueuedSendCount: pendingQueuedSends.length,
    })
  }

  /** Whether the session's current audience still covers a run's audience. */
  function sessionAudienceCovers(sessionId: string, audience: Audience) {
    return audienceIncludes(deps.session.getSessionAudience?.(sessionId) ?? OWNER_AUDIENCE, audience)
  }

  function getLimits(): ChatOrchestratorRuntimeLimits {
    const limits = deps.getLimits?.() ?? {}
    const positiveInteger = (value: number | undefined, fallback: number) => Number.isInteger(value) && value! > 0 ? value! : fallback
    return {
      maxConcurrentRuns: positiveInteger(limits.maxConcurrentRuns, 4),
      maxQueuedPerSession: positiveInteger(limits.maxQueuedPerSession, 8),
      stallTimeoutMs: positiveInteger(limits.stallTimeoutMs, 60_000),
      runDeadlineMs: positiveInteger(limits.runDeadlineMs, 600_000),
      historyTokenBudget: positiveInteger(limits.historyTokenBudget, 32_000),
    }
  }

  function endStream(sessionId: string) {
    if (streamingMessages.delete(sessionId))
      emitStateChange()
  }

  function isForegroundSession(sessionId: string) {
    return sessionId === deps.getActiveSessionId()
  }

  function beginStream(sessionId: string, message: StreamingAssistantMessage) {
    streamingMessages.set(sessionId, cloneStreamingMessage(message))
    emitStateChange()

    if (isForegroundSession(sessionId))
      deps.foregroundStream.patch(cloneStreamingMessage(message))
  }

  function updateStream(sessionId: string, message: StreamingAssistantMessage) {
    if (streamingMessages.has(sessionId)) {
      streamingMessages.set(sessionId, cloneStreamingMessage(message))
      emitStateChange()
    }

    if (isForegroundSession(sessionId))
      deps.foregroundStream.patch(cloneStreamingMessage(message))
  }

  function resetForegroundStream(sessionId: string) {
    if (isForegroundSession(sessionId))
      deps.foregroundStream.reset()
  }

  /**
   * Projects pool observations for the run's audience, then adds request-owned providers.
   * The read label covers pool entries only. Request-owned providers carry host instructions, not shared records.
   */
  function getRequestContexts(sessionId: string, audience: Audience, message: string) {
    const snapshot = deps.context.snapshot(sessionId, audience)
    const readAudience = intersectAudiences(...Object.values(snapshot).flat().map(message => message.audience ?? OWNER_AUDIENCE))
    for (const provider of deps.runtimeContextProviders ?? []) {
      const context = provider(sessionId, message)
      if (context)
        snapshot[context.contextId] = [context]
    }
    return { contexts: snapshot, readAudience }
  }

  function getStablePromptTimestamp(message: ChatHistoryItem, fallbackCreatedAt: number) {
    if (typeof message.createdAt === 'number')
      return message.createdAt

    message.createdAt = fallbackCreatedAt
    return fallbackCreatedAt
  }

  /**
   * Projects session history and fits it into the token budget. Older exchanges give way to the session digest when it covers them, or to a count.
   * Each message costs what its projection sends, including tool results and turn transcripts.
   * Text length bounds the token count, so the tokenizer loads only for history that can exceed the budget.
   */
  async function fitSessionHistory(sessionId: string, history: ChatHistoryItem[]): Promise<{ turns: Turn[], note?: string }> {
    const budget = getLimits().historyTokenBudget
    const projected = projectHistory(history)
    if (projected.reduce((sum, turns) => sum + projectedTurnsSizeBound(turns), 0) <= budget)
      return { turns: projected.flat() }

    const countTokens = await loadContextTokenCounter()
    const firstKept = fitHistoryToBudget(history, projected.map(turns => estimateTurnsTokens(turns, countTokens)), budget)
    const turns = projected.slice(firstKept).flat()
    if (firstKept === 0)
      return { turns }
    const digest = deps.getHistoryDigest?.(sessionId)
    const digestIndex = digest ? history.findIndex(item => item.id === digest.upToMessageId) : -1
    return {
      turns,
      note: digest && digestIndex >= firstKept - 1
        ? `Summary of the earlier conversation in this session: ${digest.text}`
        : `${firstKept} earlier messages of this session are not shown.`,
    }
  }

  /** Projects each stored message into the turns that a request sends for it. */
  function projectHistory(history: ChatHistoryItem[]): Turn[][] {
    const nowTs = now()
    const messagesById = new Map(history.flatMap(message => message.id ? [[message.id, message] as const] : []))
    return history.map((message, historyIndex): Turn[] => {
      // An interrupted voice reply reaches the next prompt as the speech that was heard.
      const delivered = message.role === 'assistant' ? message.deliveredSpeech : undefined
      if (message.role === 'assistant' && message.generationTranscript) {
        const turn = structuredClone(unwrapMessage(message.generationTranscript))
        return [delivered === undefined ? turn : deliveredSpeechTurn(turn, delivered)]
      }
      if (message.role === 'assistant' && delivered !== undefined)
        return chatMessagesToTurns([{ role: 'assistant', content: deliveredSpeechText(delivered) }], message.id ?? `history-${historyIndex}`)
      const source = message.role === 'user'
        ? prependTextToContent(unwrapMessage(message), `${formatTimePrefix(getStablePromptTimestamp(message, nowTs))}${formatReplyPromptPrefix(message.replyToMessageId, messagesById)}`)
        : unwrapMessage(message)
      return chatMessagesToTurns(source.role === 'assistant' && source.providerTranscript?.length ? source.providerTranscript : [source], message.id ?? `history-${historyIndex}`)
    })
  }

  async function performSend(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    generation: number,
    sessionId: string,
    abortSignal: AbortSignal,
    activeProvider: string,
    run: {
      runId: string
      envelope: ExecutionEnvelope
      /** Resets stall supervision. */
      onActivity: () => void
      /** Reports one tool call for loop supervision. */
      onToolCall: (key: string) => void
      /** Records a message that a rollback can remove. */
      onWrite: (messageId: string) => void
      /** Records that the run chose silence. */
      onSilent: (reason?: string) => void
    },
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

    // Datetime is no longer injected through the side-channel context store.
    // It is applied at message-assembly time (see below) as a system-prompt
    // date anchor + per-message [HH:MM] prefixes, which is more KV-cache
    // friendly and less prone to weak models echoing timestamps verbatim.
    const { contexts: requestContexts, readAudience } = getRequestContexts(sessionId, run.envelope.audience, sendingMessage)
    // Output derives from everything the run read, so the history label narrows before each write.
    const appendAssistantMessage = (message: ChatHistoryItem) => {
      deps.session.narrowSessionAudience?.(sessionId, readAudience)
      deps.session.appendSessionMessage(sessionId, message)
      if (message.id)
        run.onWrite(message.id)
    }

    const sendingCreatedAt = now()

    // Allocate the three per-round ids in their historical order so callers
    // with deterministic id factories keep the same durable message ids.
    const streamContextMessageId = createId()
    const assistantMessageId = createId()
    const roundId = createId()
    const streamingMessageContext: ChatStreamEventContext = {
      turnId: roundId,
      message: {
        role: 'user',
        content: sendingMessage,
        createdAt: sendingCreatedAt,
        id: streamContextMessageId,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      },
      contexts: requestContexts,
      composedMessage: [],
      input: options.input,
      outputTarget: options.outputTarget,
      sessionId,
      runId: run.runId,
      outputs: run.envelope.outputs,
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
      deps.session.appendSessionMessage(sessionId, userMessage)
      run.onWrite(userMessage.id)

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

      // Hooks above can wait. The audience check repeats at the moment the history is read.
      if (!sessionAudienceCovers(sessionId, run.envelope.audience))
        throw new Error(SESSION_NARROWED)
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
            updateStream(sessionId, buildingMessage)
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

      // Identity comes from the run's persona at request time. Without a host identity, the stored history keeps its own system message.
      const systemPrompt = deps.getSystemPrompt?.(run.envelope)
      const projected = deps.getSystemPrompt ? sessionMessagesForSend.filter(message => message.role !== 'system') : sessionMessagesForSend
      const { turns, note } = await fitSessionHistory(sessionId, projected)
      const context: Conversation = { turns }
      if (note)
        context.turns.unshift({ id: 'history-omitted', type: 'system', authority: 'context', content: [{ type: 'text', text: note }] })
      if (systemPrompt?.trim())
        context.turns.unshift({ id: 'system-identity', type: 'system', authority: 'system', content: [{ type: 'text', text: systemPrompt }] })
      const systemPromptSupplement = deps.getSystemPromptSupplement?.()?.trim()
      if (systemPromptSupplement) {
        const systemMessage = context.turns.find(turn => turn.type === 'system' && turn.authority === 'system')
        if (systemMessage?.type === 'system')
          systemMessage.content.push({ type: 'text', text: `\n\n${systemPromptSupplement}` })
        else
          context.turns.unshift({ id: 'system-supplement', type: 'system', authority: 'system', content: [{ type: 'text', text: systemPromptSupplement }] })
      }

      const contextsSnapshot = requestContexts
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
      // Set when the model calls the silence tool. Silence needs this explicit choice, so an empty reply alone stays a normal result.
      let quiet: { reason?: string } | undefined
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
        provider: deps.getActiveProvider() || 'unknown',
        hasVoice,
      })

      await deps.llm.stream(options.model, options.chatProvider, context, {
        headers,
        providerId: activeProvider,
        abortSignal,
        onGeneratedTurn: (turn) => { generatedTurn = { ...structuredClone(turn), runId: run.runId } },
        requestCorrelation: {
          conversationId: correlation.conversationId,
          turnId: correlation.roundId,
          runId: run.runId,
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
          run.onActivity()

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
              run.onToolCall(`${event.toolName}\u0000${event.args}`)
              if (event.toolName === STAY_QUIET_TOOL_NAME)
                quiet = { reason: stayQuietReason(event.args) }
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
      })

      // Session generation is the lifecycle correlation key. Re-check it
      // after every awaited completion boundary so deleting a session while a
      // plugin hook runs cannot leak later hooks or success analytics.
      if (shouldAbort())
        return

      await parser.end()
      if (shouldAbort())
        return

      generationCompleted = true
      buildingMessage.generationTranscript = generatedTurn
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

      // A chosen silence with no spoken text leaves no assistant message and no reply hooks.
      const silent = quiet !== undefined && !fullText.trim()
      if (silent)
        run.onSilent(quiet?.reason)
      if (!silent && !shouldAbort() && (buildingMessage.slices.length > 0 || generatedTurn?.rounds.length)) {
        const finalAssistant = buildingMessage
        appendAssistantMessage(finalAssistant)
        assistantStored = true
        deps.onAssistantMessageAppended?.({
          sessionId,
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
      if (!silent)
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

      if (!assistantStored && !generationCompleted && hasAssistantOutput(buildingMessage)) {
        // Keep received output local, but do not run completion hooks or cloud
        // sync for an assistant turn that never reached a terminal event.
        appendAssistantMessage({ ...cloneStreamingMessage(buildingMessage), interrupted: true })
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
        appendAssistantMessage({ ...cloneStreamingMessage(buildingMessage), interrupted: true })
        resetForegroundStream(sessionId)
      }
      endStream(sessionId)
      deps.onSendSettled?.({ sessionId })
    }
  }

  /**
   * Runs one send and records its run state. The caller settles the send after the session slot is free.
   * Supervision ends a stalled, overdue, or looping run. Its caller receives a failure, never a quiet success.
   */
  async function execute(queuedSend: QueuedSend): Promise<{ ok: true } | { ok: false, error: unknown }> {
    const { sendingMessage, options, generation, sessionId, providerId, runId, envelope } = queuedSend

    if (deps.session.getSessionGeneration(sessionId) !== generation) {
      runs.transition(runId, 'dropped')
      return { ok: false, error: new Error('Chat session was reset before send could start') }
    }
    // The session can narrow while the send waits. A run never reads history that its audience can no longer see.
    if (!sessionAudienceCovers(sessionId, envelope.audience)) {
      runs.transition(runId, 'blocked', SESSION_NARROWED)
      return { ok: false, error: new Error(SESSION_NARROWED) }
    }

    const controller = new AbortController()
    queuedSend.controller = controller
    activeSends.set(sessionId, controller)
    const { stallTimeoutMs, runDeadlineMs } = getLimits()
    const supervise = (state: 'expired' | 'blocked', reason: string) => {
      if (controller.signal.aborted)
        return
      queuedSend.supervision = { state, reason }
      controller.abort(new Error(reason))
    }
    const supervisor = superviseRun({ stallTimeoutMs, deadlineMs: runDeadlineMs }, reason => supervise('expired', reason))
    let lastToolCall: string | undefined
    let repeatedToolCalls = 0

    runs.transition(runId, 'working')
    try {
      await performSend(sendingMessage, options, generation, sessionId, controller.signal, providerId, {
        runId,
        envelope,
        onActivity: () => supervisor.touch(),
        onToolCall: (key) => {
          repeatedToolCalls = key === lastToolCall ? repeatedToolCalls + 1 : 1
          lastToolCall = key
          if (repeatedToolCalls >= REPEATED_TOOL_CALL_LIMIT)
            supervise('blocked', 'Run repeated an identical tool call')
        },
        onWrite: messageId => queuedSend.writtenMessageIds.push(messageId),
        onSilent: (reason) => {
          queuedSend.silent = { reason }
        },
      })
      if (queuedSend.supervision) {
        runs.transition(runId, queuedSend.supervision.state, queuedSend.supervision.reason)
        return { ok: false, error: new Error(queuedSend.supervision.reason) }
      }
      runs.transition(runId, controller.signal.aborted || deps.session.getSessionGeneration(sessionId) !== generation ? 'dropped' : 'done', undefined, { silent: queuedSend.silent })
      return { ok: true }
    }
    catch (error) {
      const supervision = queuedSend.supervision
      runs.transition(runId, supervision?.state ?? (controller.signal.aborted ? 'dropped' : 'blocked'), supervision?.reason ?? errorMessageFrom(error) ?? 'Unknown run failure')
      return { ok: false, error: supervision ? new Error(supervision.reason) : error }
    }
    finally {
      supervisor.stop()
      activeSends.delete(sessionId)
    }
  }

  /**
   * Starts waiting sends in admission order. A session runs one send at a time, and the run count stays within the limit.
   * The voice is an exclusive lease. A send with the voice output waits until it ranks first among the voice candidates of every run owner.
   * A slow session therefore holds only its own slot.
   */
  function pump() {
    const { maxConcurrentRuns } = getLimits()
    for (const queuedSend of [...pendingQueuedSends]) {
      // Capacity counts the working runs of every owner that shares the run table. A limit of one serializes all active work.
      if (runs.countWorking() >= maxConcurrentRuns)
        break
      if (runningSends.has(queuedSend.sessionId))
        continue
      // Only candidates for the voice compare. The lease line ranks them by salience tier and waiting time.
      // The owner's own input interrupts playback that outlived its run. A generating run keeps the voice.
      if (queuedSend.envelope.outputs.includes('voice') && !leases.acquire('voice', queuedSend.runId, { salience: queuedSend.salience, waitingSince: queuedSend.queuedAt, interrupt: queuedSend.direct }).granted)
        continue
      pendingQueuedSends = pendingQueuedSends.filter(item => item !== queuedSend)
      runningSends.set(queuedSend.sessionId, queuedSend)
      void execute(queuedSend).then((result) => {
        // Free the slot and leases before the caller resumes, so a settled send never appears to run.
        runningSends.delete(queuedSend.sessionId)
        leases.releaseAll(queuedSend.runId)
        if (queuedSend.cancellation?.rollback && queuedSend.writtenMessageIds.length)
          deps.session.removeSessionMessages?.(queuedSend.sessionId, queuedSend.writtenMessageIds)
        pump()
        if (result.ok)
          queuedSend.deferred.resolve()
        else
          queuedSend.deferred.reject(result.error)
      })
    }
    emitStateChange()
  }

  function decideDirect(stimulus: Stimulus): ChatIntakeDecision {
    try {
      return (deps.decideDirectIntake ?? decideDirectInput)(stimulus)
    }
    catch (error) {
      console.error('Direct intake policy failed:', error)
      return { outcome: 'admitted', reason: 'policy-failed', decidedBy: 'fallback' }
    }
  }

  async function decideByPolicy(stimulus: Stimulus, decideIntake: NonNullable<ChatOrchestratorRuntimeDeps['decideIntake']>): Promise<ChatIntakeDecision> {
    try {
      return await decideIntake(stimulus)
    }
    catch (error) {
      console.error('Intake policy failed:', error)
      return { outcome: 'admitted', reason: 'policy-failed', decidedBy: 'fallback' }
    }
  }

  async function ingest(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    targetSessionId?: string,
  ): Promise<ChatIngestResult> {
    const sessionId = targetSessionId || deps.getActiveSessionId()
    const generation = deps.session.getSessionGeneration(sessionId)
    const envelope: ExecutionEnvelope = {
      bindings: [],
      outputs: ['chat:owner', 'voice'],
      audience: OWNER_AUDIENCE,
      ...deps.createEnvelope?.(sessionId, options),
      sessionId,
    }
    const stimulus: Stimulus = {
      id: defaultCreateId(),
      kind: options.input?.type ?? 'input:text',
      origin: 'external',
      source: options.outputTarget ? `connection:${options.outputTarget}` : 'owner',
      event: options.input?.type ?? 'input:text',
      bindings: envelope.bindings,
      salience: salienceFromUrgency(),
      direct: !options.outputTarget,
      // A bound session with a return connection speaks with other people.
      fromScene: Boolean(options.outputTarget) && envelope.bindings.length > 0,
      text: sendingMessage,
      hasAttachments: Boolean(options.attachments?.length),
      receivedAt: now(),
    }
    const rejectStimulus = (reason: string, message: string): never => {
      intake.record(stimulus, { outcome: 'rejected', reason, decidedBy: 'rule' })
      throw new Error(message)
    }

    // Recovery stays inside the history's audience. A wider run would show the history to subjects it never reached.
    // The rejection happens before a run exists, so the run table never records unauthorized work.
    const sessionAudience = deps.session.getSessionAudience?.(sessionId) ?? OWNER_AUDIENCE
    if (!audienceIncludes(sessionAudience, envelope.audience))
      rejectStimulus('audience', 'Run audience exceeds the session audience')

    // Direct owner input gets a synchronous local decision, so queue order follows call order.
    // Connection input can wait for a remote classifier.
    const decision: ChatIntakeDecision = stimulus.direct
      ? decideDirect(stimulus)
      : deps.decideIntake
        ? await decideByPolicy(stimulus, deps.decideIntake)
        : { outcome: 'admitted', reason: 'connection-input', decidedBy: 'rule' }
    if (decision.outcome === 'ignored') {
      intake.record(stimulus, decision)
      return { stimulusId: stimulus.id, outcome: 'ignored' }
    }

    const spendingRejection = deps.checkSpendingLimit?.()
    if (spendingRejection)
      rejectStimulus('spending-limit', spendingRejection)

    // A full session queue rejects before a run exists, so waiting work stays bounded.
    if (pendingQueuedSends.filter(item => item.sessionId === sessionId).length >= getLimits().maxQueuedPerSession)
      rejectStimulus('capacity', 'The chat session queue is full')

    // Run identity uses its own factory, so deterministic message id sequences stay unchanged.
    const runId = defaultCreateId()
    const salience = decision.salience ?? stimulus.salience
    runs.admit({ runId, envelope, salience })
    intake.record(stimulus, { ...decision, runId })

    await new Promise<void>((resolve, reject) => {
      pendingQueuedSends.push({
        runId,
        envelope,
        salience,
        queuedAt: now(),
        direct: Boolean(stimulus.direct),
        writtenMessageIds: [],
        providerId: deps.getActiveProvider?.() ?? '',
        sendingMessage,
        options,
        generation,
        sessionId,
        deferred: { resolve, reject },
      })
      pump()
    })
    return { stimulusId: stimulus.id, outcome: 'admitted', runId }
  }

  function cancelPendingSends(sessionId?: string) {
    for (const [activeSessionId, controller] of activeSends) {
      if (!sessionId || sessionId === activeSessionId)
        controller.abort(new Error('Chat session send was cancelled'))
    }

    for (const queued of pendingQueuedSends) {
      if (sessionId && queued.sessionId !== sessionId)
        continue

      queued.cancelled = true
      leases.withdraw('voice', queued.runId)
      runs.transition(queued.runId, 'dropped')
      queued.deferred.reject(new Error('Chat session was reset before send could start'))
    }

    pendingQueuedSends = sessionId
      ? pendingQueuedSends.filter(item => item.sessionId !== sessionId)
      : []
    emitStateChange()
  }

  /**
   * Cancels one run. A waiting run never starts. A running run stops, and its late output never commits.
   * With rollback, the run's user turn and partial reply leave the session, so a requeued input cannot duplicate them.
   */
  function cancelRun(runId: string, options: { rollback?: boolean } = {}) {
    const waiting = pendingQueuedSends.find(item => item.runId === runId)
    if (waiting) {
      pendingQueuedSends = pendingQueuedSends.filter(item => item !== waiting)
      waiting.cancelled = true
      leases.withdraw('voice', runId)
      runs.transition(runId, 'dropped')
      waiting.deferred.reject(new Error('Run was cancelled before it started'))
      emitStateChange()
      return true
    }

    const running = Array.from(runningSends.values()).find(item => item.runId === runId)
    if (!running?.controller)
      return false
    running.cancellation = { rollback: options.rollback ?? false }
    running.controller.abort(new Error('Run was cancelled'))
    return true
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
    getRunningSessionIds: () => Array.from(runningSends.keys()),
    cancelRun,
    hooks,
    getRun: runId => runs.get(runId),
    getRuns: () => runs.snapshot(),
    getIntakeRecords: () => intake.snapshot(),
  }
}
