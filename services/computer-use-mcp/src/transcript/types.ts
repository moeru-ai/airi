/**
 * Transcript Truth Source - types for the LLM conversation transcript store.
 *
 * This is SEPARATE from `SessionTraceEntry` / `audit.jsonl`.
 * `audit.jsonl` records operational events (requested, executed, failed, etc.).
 * `transcript.jsonl` records the actual LLM conversation messages.
 *
 * The transcript store is append-only. Prompt pruning never deletes entries;
 * it only controls which entries get projected into the next LLM request.
 */

// ---------------------------------------------------------------------------
// 1. Transcript Entry - the atomic unit persisted to transcript.jsonl
// ---------------------------------------------------------------------------

/**
 * A compacted summary of a transcript block that was removed from the prompt.
 * Explicitly tagged so it cannot be confused with original transcript.
 */
export interface CompactedBlock {
  /** Entry id range of the original block. */
  entryIdRange: [number, number]
  kind: 'compacted'
  /** Which original block kind this summarizes. */
  originalKind: TranscriptBlock['kind']
  /** Human-readable deterministic summary. */
  summary: string
}

export type ProjectedBlock = CompactedBlock | TranscriptBlock

// ---------------------------------------------------------------------------
// 2. Transcript Block - logical grouping of transcript entries
// ---------------------------------------------------------------------------

export interface SystemBlock {
  entry: TranscriptEntry
  entryIdRange: [number, number]
  kind: 'system'
}

export interface TextBlock {
  /**
   * A single text-only transcript entry.
   * Usually an assistant message with no tool_calls, but may also be an
   * orphan tool entry wrapped defensively by transcript parsing.
   */
  entry: TranscriptEntry
  entryIdRange: [number, number]
  kind: 'text'
}

export interface ToolInteractionBlock {
  /** The assistant message containing tool_calls. */
  assistant: TranscriptEntry
  /** Inclusive entry id range [first, last] for ordering. */
  entryIdRange: [number, number]
  kind: 'tool_interaction'
  /** All tool result messages matching the assistant's tool_call ids. */
  toolResults: TranscriptEntry[]
}

/**
 * A "block" is the atomic unit of prompt projection.
 * You never split a block: either the full block appears in the prompt
 * or it is compacted / dropped entirely.
 */
export type TranscriptBlock
  = | SystemBlock
    | TextBlock
    | ToolInteractionBlock
    | UserBlock

/**
 * A single entry in the transcript truth source.
 * Preserves the xsai/OpenAI message shape needed for faithful replay.
 */
export interface TranscriptEntry {
  /** ISO timestamp of when this entry was recorded. */
  at: string
  /**
   * Message content. Accepts the same forms xsai / OpenAI wire format uses:
   * - `string` for plain text
   * - `unknown[]` for structured content parts (TextContentPart[], etc.)
   * - `undefined` for assistant messages that only contain tool_calls
   */
  content?: string | unknown[]
  /** Unique monotonic ID within this session. */
  id: number
  /** The message role. */
  role: 'assistant' | 'system' | 'tool' | 'user'
  /**
   * For tool result messages: the id of the tool_call this responds to.
   */
  toolCallId?: string
  /**
   * For assistant messages that invoke tools.
   * Preserved in xsai/OpenAI wire format.
   */
  toolCalls?: TranscriptToolCall[]
}

// ---------------------------------------------------------------------------
// 3. Compacted Block - deterministic summary of a dropped block
// ---------------------------------------------------------------------------

export interface TranscriptProjectedMessage {
  content?: string | unknown[]
  role: 'assistant' | 'system' | 'tool' | 'user'
  tool_call_id?: string
  tool_calls?: TranscriptToolCall[]
}

// ---------------------------------------------------------------------------
// 4. Projection Output - what the projection layer produces
// ---------------------------------------------------------------------------

export interface TranscriptProjectionMetadata {
  /** Number of blocks compacted into summaries. */
  compactedBlocks: number
  /** Number of blocks dropped entirely (neither kept nor compacted). */
  droppedBlocks: number
  /** Rough character count of the projected messages. */
  estimatedCharacters: number
  /** Number of blocks kept in full. */
  keptFullBlocks: number
  /** Number of projected messages in the output array. */
  projectedMessageCount: number
  /** Number of blocks identified. */
  totalBlocks: number
  /** Total transcript entries in the truth source. */
  totalTranscriptEntries: number
}

export interface TranscriptProjectionResult {
  /**
   * The projected messages array, ready to pass to generateText().
   * Provider-safe: no orphan tool messages, no broken tool_call pairs.
   */
  messages: TranscriptProjectedMessage[]
  /** Projection metadata for observability. */
  metadata: TranscriptProjectionMetadata
  /**
   * The system prompt header (system prompt base + optional task memory).
   */
  system: string
}

export interface TranscriptToolCall {
  function: {
    arguments: string
    name: string
  }
  id: string
  type: 'function'
}

export interface UserBlock {
  entry: TranscriptEntry
  entryIdRange: [number, number]
  kind: 'user'
}
