/**
 * Structured item stored inside a history block.
 */
export type HistoryItem
  = HistoryItemDomainEvent
    | HistoryReaction
    | HistorySummary
    | HistoryTurn

/**
 * History domain event item used to preserve structured event provenance.
 */
export interface HistoryItemDomainEvent {
  eventType: string
  payload: Record<string, unknown>
  type: 'domain-event'
}

/**
 * History reaction item used to keep spark output close to the related turn.
 */
export interface HistoryReaction {
  reactionType: 'spark-command' | 'spark-notify' | string
  source?: string
  text: string
  type: 'reaction'
}

/**
 * History summary item used by a history block segment.
 */
export interface HistorySummary {
  fromTurnIndex?: number
  metadata?: Record<string, unknown>
  text: string
  toTurnIndex?: number
  type: 'summary'
}

/**
 * History turn item used for structured session or domain turn tracking.
 */
export interface HistoryTurn {
  action: HistoryTurnAction
  actor: 'agent' | 'assistant' | 'player' | 'system' | string
  turnIndex: number
  turnType: string
  type: 'turn'
}

/**
 * Structured action stored on a turn history item.
 */
export type HistoryTurnAction
  = HistoryTurnEventAction
    | HistoryTurnGenericAction
    | HistoryTurnMoveAction
    | HistoryTurnTextAction

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
  [key: string]: unknown
  fen?: string
  kind: string
  note?: string
  payload?: Record<string, unknown>
  san?: string
  uci?: string
}

/**
 * Chess-style move action stored on a turn.
 */
export interface HistoryTurnMoveAction {
  fen?: string
  kind: 'move-executed' | 'move-played'
  note?: string
  payload?: Record<string, unknown>
  san: string
  uci?: string
}

/**
 * Text action stored on a turn.
 */
export interface HistoryTurnTextAction {
  kind: 'text'
  text: string
}

/**
 * Rich message projected from session, spark, or domain data.
 *
 * Use when:
 * - You need structured message segments
 * - You want to preserve history blocks, summaries, or other contextual payloads
 *
 * Expects:
 * - `segments` to describe the full rendered message content
 *
 * Returns:
 * - A structured message that can be compacted or rendered later
 */
export interface Message {
  id: string
  metadata?: Record<string, unknown>
  role: 'assistant' | 'context' | 'event' | 'summary' | 'system' | 'user'
  segments: MessageSegment[]
  source?: string
}

/**
 * Alias for the domain event segment shape used by the approved spec.
 */
export type MessageDomainEventSegment = SegmentDomainEvent

/**
 * Alias for the history block segment shape used by the approved spec.
 */
export type MessageHistoryBlockSegment = SegmentHistoryBlock

/**
 * Alias for the instruction segment shape used by the approved spec.
 */
export type MessageInstructionSegment = SegmentInstruction

/**
 * Alias for the reference segment shape used by the approved spec.
 */
export type MessageReferenceSegment = SegmentReference

/**
 * Structured content segment used inside a projected message.
 */
export type MessageSegment
  = SegmentDomainEvent
    | SegmentHistoryBlock
    | SegmentInstruction
    | SegmentReference
    | SegmentStateSnapshot
    | SegmentSummary
    | SegmentTaggedText
    | SegmentText

/**
 * Alias for the state snapshot segment shape used by the approved spec.
 */
export type MessageStateSnapshotSegment = SegmentStateSnapshot

/**
 * Alias for the summary segment shape used by the approved spec.
 */
export type MessageSummarySegment = SegmentSummary

/**
 * Alias for the tagged text segment shape used by the approved spec.
 */
export type MessageTaggedTextSegment = SegmentTaggedText

/**
 * Alias for the text segment shape used by the approved spec.
 */
export type MessageTextSegment = SegmentText

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
  content: string
  metadata?: Record<string, unknown>
  name?: string
  role: 'assistant' | 'system' | 'tool' | 'user'
}

/**
 * Domain event segment for structured event payloads.
 */
export interface SegmentDomainEvent {
  eventType: string
  payload: Record<string, unknown>
  type: 'domain-event'
}

/**
 * History block segment that keeps turn/reaction pairing intact.
 */
export interface SegmentHistoryBlock {
  compacted: boolean
  items: HistoryItem[]
  type: 'history-block'
}

/**
 * Instruction segment for explicit runtime or system guidance.
 */
export interface SegmentInstruction {
  priority?: 'critical' | 'high' | 'low' | 'normal'
  text: string
  type: 'instruction'
}

/**
 * Reference segment for stable pointers to prior messages or resources.
 */
export interface SegmentReference {
  note?: string
  refType: string
  targetId: string
  type: 'reference'
}

/**
 * State snapshot segment for deterministic state serialization.
 */
export interface SegmentStateSnapshot {
  payload: Record<string, unknown>
  stateType: string
  type: 'state-snapshot'
}

/**
 * Summary segment for historical or narrative windows.
 */
export interface SegmentSummary {
  metadata?: Record<string, unknown>
  text: string
  type: 'summary'
}

/**
 * Tagged text segment that preserves semantic tag boundaries.
 */
export interface SegmentTaggedText {
  tag: string
  text: string
  type: 'tagged-text'
}

/**
 * Plain text segment for projected message rendering.
 */
export interface SegmentText {
  text: string
  type: 'text'
}
