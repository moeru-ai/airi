import type { ItemParam } from '@xsai-ext/responses'
import type { Message as ChatMessage, CompletionStep } from '@xsai/shared-chat'

/**
 * Provider-ready message payload.
 *
 * Use when:
 * - Sending messages to chat-style providers
 * - Preserving a simple role/content shape alongside richer projected messages
 *
 * Expects:
 * - `content` already serialized into a provider-safe string
 *
 * Returns:
 * - A minimal chat message record that providers can consume directly
 */
export interface RawMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  metadata?: Record<string, unknown>
}

/** A conversation keeps authored turns in chronological order. Protocol roles are assigned by adapters. */
export interface Conversation {
  turns: Turn[]
}

/** Each turn owns content with one source and authority. Only assistant turns execute rounds. */
export type Turn = UserTurn | AssistantTurn | SystemTurn

/** User-authored content and attachments, before provider projection. */
export interface UserTurn {
  type: 'user'
  id: string
  content: (InputSegment | ContextSegment)[]
}

/** Context supplied by the application is not automatically a trusted instruction. */
export interface SystemTurn {
  type: 'system'
  id: string
  authority: 'system' | 'developer' | 'context'
  content: (SegmentText | ContextSegment)[]
}

/** One assistant execution. A round is one model invocation plus its tool executions. */
export interface AssistantTurn {
  type: 'assistant'
  id: string
  /** Supplied by the agent scheduler when this turn belongs to an identified run. */
  runId?: string
  status: 'completed' | 'failed' | 'cancelled'
  rounds: GenerationRound[]
}

/** Tool references retain output order; calls and results are owned only by toolInvocations. */
export type RoundContent = SegmentText | SegmentRefusal | ContextSegment | { type: 'tool', invocationId: string }

/** One model invocation and its tool executions, with native data isolated to that invocation. */
export interface GenerationRound {
  id: string
  /** Absent for imported history whose original model invocation is not known. */
  modelCall?: { model: string, finishReason: CompletionStep['finishReason'], usage?: CompletionStep['usage'] }
  content: RoundContent[]
  toolInvocations: ToolInvocation[]
  /** Provider data belongs to this round and cannot cross the recorded scope. */
  continuation?: ProviderContinuation
  /** Unknown native content is saved, but cannot silently disappear on a protocol change. */
  projectionIssues: string[]
}

/** A tool call and its execution result have one owner inside a round. */
export interface ToolInvocation {
  /** Unique within the owning round; callId is the provider's correlation key. */
  id: string
  callId: string
  name: string
  arguments: string
  /** Present only when the executor reports an actual child agent run. */
  childRunId?: string
  execution: ToolExecution
}

/** A missing result is pending, never an empty successful result. */
export type ToolExecution
  = { status: 'pending' }
    | { status: 'succeeded' | 'failed', output: InputSegment[] }
    | { status: 'cancelled' }

/** Domain data becomes text only inside the selected protocol adapter. */
export type ContextSegment = SegmentInstruction | SegmentTaggedText | SegmentDomainEvent
  | SegmentStateSnapshot | SegmentHistoryBlock | SegmentSummary | SegmentReference
  | { type: 'runtime-context', entries: { source: string, text: string }[] }

/**
 * Structured content segment used inside a projected message.
 */
export type MessageSegment
  = ContentSegment
    | SegmentToolCall
    | SegmentToolResult
    | SegmentInstruction
    | SegmentTaggedText
    | SegmentDomainEvent
    | SegmentStateSnapshot
    | SegmentHistoryBlock
    | SegmentSummary
    | SegmentReference
    | { type: 'runtime-context', entries: { source: string, text: string }[] }

/** Content semantics retained until the selected protocol renders a request. */
export type InputSegment = SegmentText
  | { type: 'image', url: string, detail?: 'auto' | 'low' | 'high' }
  | { type: 'audio', data: string, format: 'wav' | 'mp3' }
  | ({ type: 'file', name?: string } & (
    | { data: string, url?: never, providerFileId?: never }
    | { url: string, data?: never, providerFileId?: never }
    | { providerFileId: string, data?: never, url?: never }
  ))

export interface SegmentRefusal { type: 'refusal', text: string }

export type ContentSegment = InputSegment | SegmentRefusal

/** A source belongs to a specific output text item, with offsets in that item's text. */
export interface Citation {
  url: string
  title: string
  startIndex: number
  endIndex: number
}

/** A complete invocation. The call id correlates its result across protocol projections. */
export interface SegmentToolCall {
  type: 'tool-call'
  callId: string
  name: string
  arguments: string
}

/** A completed tool result, including media that the target protocol can carry. */
export interface SegmentToolResult {
  type: 'tool-result'
  callId: string
  content: InputSegment[]
}

/** Wire messages exist only after projection. Each protocol retains its owning SDK contract. */
export interface AgentMessageByProtocol {
  'chat-completions': ChatMessage
  'responses': ItemParam
}

export type AgentMessage<Protocol extends keyof AgentMessageByProtocol> = AgentMessageByProtocol[Protocol]

/**
 * Serializable SDK output owned by its protocol adapter.
 * The scope identifies the provider instance, endpoint, model, and conversation.
 * A different scope uses the turn's portable messages instead of this state.
 * Replay preserves provider extensions without parsing or rebuilding their nested payloads.
 */
export type ProviderContinuation = { scope: string } & (
  | { protocol: 'chat-completions', data: AgentMessage<'chat-completions'>[] }
  | { protocol: 'responses', data: AgentMessage<'responses'>[] }
)

/**
 * Plain text segment for projected message rendering.
 */
export interface SegmentText {
  type: 'text'
  text: string
  citations?: Citation[]
}

/**
 * Instruction segment for explicit runtime or system guidance.
 */
export interface SegmentInstruction {
  type: 'instruction'
  text: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
}

/**
 * Tagged text segment that preserves semantic tag boundaries.
 */
export interface SegmentTaggedText {
  type: 'tagged-text'
  tag: string
  text: string
}

/**
 * Domain event segment for structured event payloads.
 */
export interface SegmentDomainEvent {
  type: 'domain-event'
  eventType: string
  payload: Record<string, unknown>
}

/**
 * State snapshot segment for deterministic state serialization.
 */
export interface SegmentStateSnapshot {
  type: 'state-snapshot'
  stateType: string
  payload: Record<string, unknown>
}

/**
 * History block segment that keeps turn/reaction pairing intact.
 */
export interface SegmentHistoryBlock {
  type: 'history-block'
  compacted: boolean
  items: HistoryItem[]
}

/**
 * History summary item used by a history block segment.
 */
export interface HistorySummary {
  type: 'summary'
  text: string
  fromTurnIndex?: number
  toTurnIndex?: number
  metadata?: Record<string, unknown>
}

/**
 * History reaction item used to keep spark output close to the related turn.
 */
export interface HistoryReaction {
  type: 'reaction'
  reactionType: 'spark-notify' | 'spark-command' | string
  text: string
  source?: string
}

/**
 * History turn item used for structured session or domain turn tracking.
 */
export interface HistoryTurn {
  type: 'turn'
  turnType: string
  turnIndex: number
  actor: 'player' | 'assistant' | 'agent' | 'system' | string
  action: HistoryTurnAction
}

/**
 * Structured action stored on a turn history item.
 */
export type HistoryTurnAction
  = HistoryTurnMoveAction
    | HistoryTurnTextAction
    | HistoryTurnEventAction
    | HistoryTurnGenericAction

/**
 * Chess-style move action stored on a turn.
 */
export interface HistoryTurnMoveAction {
  kind: 'move-played' | 'move-executed'
  san: string
  uci?: string
  fen?: string
  note?: string
  payload?: Record<string, unknown>
}

/**
 * Text action stored on a turn.
 */
export interface HistoryTurnTextAction {
  kind: 'text'
  text: string
}

/**
 * Event action stored on a turn.
 */
export interface HistoryTurnEventAction {
  kind: 'event'
  name: string
  payload?: Record<string, unknown>
}

/**
 * Generic fallback action stored on a turn.
 */
export interface HistoryTurnGenericAction {
  kind: string
  san?: string
  uci?: string
  fen?: string
  note?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Structured item stored inside a history block.
 */
export type HistoryItem
  = HistorySummary
    | HistoryReaction
    | HistoryItemDomainEvent
    | HistoryTurn

/**
 * History domain event item used to preserve structured event provenance.
 */
export interface HistoryItemDomainEvent {
  type: 'domain-event'
  eventType: string
  payload: Record<string, unknown>
}

/**
 * Alias for the text segment shape used by the approved spec.
 */
export type MessageTextSegment = SegmentText

/**
 * Alias for the instruction segment shape used by the approved spec.
 */
export type MessageInstructionSegment = SegmentInstruction

/**
 * Alias for the tagged text segment shape used by the approved spec.
 */
export type MessageTaggedTextSegment = SegmentTaggedText

/**
 * Alias for the domain event segment shape used by the approved spec.
 */
export type MessageDomainEventSegment = SegmentDomainEvent

/**
 * Alias for the state snapshot segment shape used by the approved spec.
 */
export type MessageStateSnapshotSegment = SegmentStateSnapshot

/**
 * Alias for the history block segment shape used by the approved spec.
 */
export type MessageHistoryBlockSegment = SegmentHistoryBlock

/**
 * Alias for the summary segment shape used by the approved spec.
 */
export type MessageSummarySegment = SegmentSummary

/**
 * Alias for the reference segment shape used by the approved spec.
 */
export type MessageReferenceSegment = SegmentReference

/**
 * Summary segment for historical or narrative windows.
 */
export interface SegmentSummary {
  type: 'summary'
  text: string
  metadata?: Record<string, unknown>
}

/**
 * Reference segment for stable pointers to prior messages or resources.
 */
export interface SegmentReference {
  type: 'reference'
  refType: string
  targetId: string
  note?: string
}
