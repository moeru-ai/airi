import type { ChatAssistantMessage, ChatHistoryItem } from '@proj-airi/core-agent'
import type { NewMessagesPayload, WireMessage } from '@proj-airi/server-sdk-shared'

import { isStoppedAssistant } from '@proj-airi/core-agent'

/**
 * Extract a plain-text payload from a local `ChatHistoryItem` for upload.
 *
 * Use when:
 * - Pushing a message via `sendMessages` RPC. The server schema for v1 only
 *   accepts a string `content` field — slices and tool calls cannot round-trip
 *   yet.
 *
 * Expects:
 * - Tool-result and tool-call slices are dropped silently. If you need full
 *   fidelity, wait until the server-side schema grows structured content.
 *
 * Returns:
 * - The first text slice for assistant messages with slice arrays; otherwise
 *   the message's stringified content. Empty string when nothing extractable.
 */
export function extractMessageText(message: ChatHistoryItem): string {
  if (message.role === 'assistant') {
    // The discriminated union narrows `message` to a shape that includes
    // `slices`; reading via the narrowed alias keeps tsc happy without an
    // `as` cast.
    const assistant: ChatAssistantMessage = message
    if (Array.isArray(assistant.slices) && assistant.slices.length > 0) {
      const text = assistant.slices
        .filter((slice): slice is { type: 'text', text: string } => slice.type === 'text')
        .map(slice => slice.text)
        .join('')
      if (text)
        return text
    }
  }
  if (typeof message.content === 'string')
    return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part)
          return String(part.text ?? '')
        return ''
      })
      .join('')
  }
  return ''
}

/**
 * Whether a history item is a user turn whose visible text is exactly `text`.
 *
 * Use when:
 * - A composer's send-failure path needs to know whether its optimistic turn
 *   reached history (committed turns keep their text in the transcript, so
 *   restoring the draft would duplicate the turn on resend). Centralizes the
 *   knowledge of how the orchestrator shapes user content (plain string, or a
 *   leading text part when attachments ride along).
 *
 * Expects:
 * - `text` is the raw composer text, before any provider-time prefixes.
 *
 * Returns:
 * - `true` only for `role: 'user'` items whose extracted text equals `text`.
 */
export function isUserTurnWithText(message: ChatHistoryItem | undefined, text: string): boolean {
  return message?.role === 'user' && extractMessageText(message) === text
}

/**
 * Decide whether a local message should be mirrored to the cloud.
 *
 * Use when:
 * - Filtering messages right before `sendMessages`.
 *
 * Expects:
 * - The caller has already validated the message has an `id`.
 *
 * Returns:
 * - `true` for `user` / `assistant` turns that should sync. Excluded (returns
 *   `false`):
 *   - Tool call / result exchanges: intentionally not synced in v1.
 *   - System prompts: recomputed from settings on every device.
 *   - Error messages: a per-device runtime failure, not a server-acknowledged turn.
 *   - Stopped assistant turns: the `stopped` flag does not ride the wire format,
 *     so an upload lands server-side as a completed turn and loses the
 *     cancellation signal.
 *   - Provisional user turns: the send is still in flight; a stop before any
 *     output retracts them locally, so an upload would resurrect retracted text
 *     on the next catch-up pull.
 */
export function isCloudSyncableMessage(message: ChatHistoryItem): boolean {
  if (message.role === 'tool')
    return false
  if (message.role === 'system')
    return false
  if (message.role === 'error')
    return false
  if (isStoppedAssistant(message))
    return false
  if (message.provisional)
    return false
  return true
}

/**
 * Convert a server `WireMessage` into a local `ChatHistoryItem`.
 *
 * Before:
 * - { id, role: 'assistant', content: 'hi', seq: 7, ... }
 *
 * After:
 * - { id, role: 'assistant', content: 'hi', slices: [{type:'text', text:'hi'}], tool_results: [], createdAt }
 *
 * Use when:
 * - Merging messages received via `pullMessages` or `newMessages` into the
 *   local session store. The local shape carries assistant-specific fields
 *   that the wire format does not, so we synthesize minimal placeholders
 *   for them.
 */
export function wireMessageToLocal(wire: WireMessage): ChatHistoryItem {
  // Server wire format only stores plain text content; we recreate the
  // local shape with empty tool_results / slices so downstream UI code can
  // assume the invariants documented in core-agent's ChatAssistantMessage.
  switch (wire.role) {
    case 'assistant': {
      const assistant: ChatAssistantMessage = {
        role: 'assistant',
        content: wire.content,
        slices: wire.content ? [{ type: 'text', text: wire.content }] : [],
        tool_results: [],
      }
      return Object.assign(assistant, {
        id: wire.id,
        createdAt: wire.createdAt,
      })
    }
    case 'user':
      return {
        role: 'user',
        content: wire.content,
        id: wire.id,
        createdAt: wire.createdAt,
      }
    case 'system':
      return {
        role: 'system',
        content: wire.content,
        id: wire.id,
        createdAt: wire.createdAt,
      }
    case 'error':
      return {
        role: 'error',
        content: wire.content,
        id: wire.id,
        createdAt: wire.createdAt,
      }
    case 'tool':
      // Tool messages require a `tool_call_id` we cannot reconstruct from
      // the wire format; surface as an error message so the UI shows
      // *something* instead of dropping silently.
      return {
        role: 'error',
        content: wire.content || '[tool message: cannot reconstruct without tool_call_id]',
        id: wire.id,
        createdAt: wire.createdAt,
      }
  }
}

export interface CloudMergeResult {
  /** Merged message list (returns the original reference when nothing changed). */
  messages: ChatHistoryItem[]
  /** Highest seq seen, including the input cursor. */
  maxSeq: number
  /** True when either `messages` or `maxSeq` differs from the input. */
  dirty: boolean
}

/**
 * Merge a `newMessages` / `pullMessages` payload into a local message list.
 *
 * Use when:
 * - The chat session store receives an authoritative server payload
 *   (push or pull) and needs to update its in-memory list and `cloudMaxSeq`
 *   cursor without losing local-only fields on existing rows.
 *
 * Expects:
 * - `currentMessages` is the live list. Wire messages whose id already
 *   exists locally are dropped (the local copy is preserved because it may
 *   carry slices/tool_results that the wire format cannot represent).
 * - `currentMaxSeq` is the cursor previously stored on the session meta;
 *   `0` for the very first merge.
 * - `payload.messages` may arrive out of seq order (server pagination
 *   boundaries, pub/sub interleave). New messages are appended in seq order
 *   so the in-memory list stays monotonic.
 *
 * Returns:
 * - `messages` — the new array (same reference if no-op).
 * - `maxSeq` — the cursor to write back to meta.
 * - `dirty` — whether the caller should persist.
 */
export function mergeCloudMessagesIntoLocal(
  currentMessages: ChatHistoryItem[],
  currentMaxSeq: number,
  payload: Pick<NewMessagesPayload, 'messages'> & { toSeq?: number },
): CloudMergeResult {
  const knownIds = new Set<string>()
  for (const message of currentMessages) {
    if (message.id)
      knownIds.add(message.id)
  }

  // Sort incoming messages by seq before appending so that out-of-order
  // delivery does not produce a permanently-misordered local list. Cloning
  // the array first keeps callers safe from mutation.
  const sortedWire = [...payload.messages].sort((a, b) => a.seq - b.seq)

  const additions: ChatHistoryItem[] = []
  let maxSeq = currentMaxSeq
  for (const wire of sortedWire) {
    if (wire.seq > maxSeq)
      maxSeq = wire.seq
    if (knownIds.has(wire.id))
      continue
    additions.push(wireMessageToLocal(wire))
  }

  // The server may report a higher seq than the highest message in the
  // payload (e.g. when messages were redacted upstream). Honour it.
  if (typeof payload.toSeq === 'number' && payload.toSeq > maxSeq)
    maxSeq = payload.toSeq

  if (additions.length === 0 && maxSeq === currentMaxSeq) {
    return { messages: currentMessages, maxSeq: currentMaxSeq, dirty: false }
  }

  const messages = additions.length > 0
    ? [...currentMessages, ...additions]
    : currentMessages

  return { messages, maxSeq, dirty: true }
}
