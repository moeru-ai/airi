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
  role: 'system' | 'user' | 'assistant' | 'context' | 'event' | 'summary'
  source?: string
  segments: MessageSegment[]
  metadata?: Record<string, unknown>
}

/**
 * Structured content segment used inside a projected message.
 */
export type MessageSegment
  = SegmentText
    | SegmentInstruction
    | SegmentTaggedText
    | SegmentDomainEvent
    | SegmentStateSnapshot
    | SegmentHistoryBlock
    | SegmentSummary
    | SegmentReference

/**
 * Plain text segment for projected message rendering.
 */
export interface SegmentText {
  type: 'text'
  text: string
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
