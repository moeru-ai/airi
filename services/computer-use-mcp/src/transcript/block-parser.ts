/**
 * Block Parser — groups flat TranscriptEntry[] into logical TranscriptBlock[].
 *
 * A TranscriptBlock is the atomic unit of prompt projection: you never split
 * a block. Either the whole block goes into the prompt, or it gets compacted.
 *
 * Block types:
 *   - ToolInteractionBlock: assistant(tool_calls) + matching tool results
 *   - TextBlock: assistant text-only (no tool_calls)
 *   - UserBlock: user message
 *   - SystemBlock: system message
 */

import type {
  SystemBlock,
  TextBlock,
  ToolInteractionBlock,
  TranscriptBlock,
  TranscriptEntry,
  UserBlock,
} from './types'

/**
 * Parse a flat array of transcript entries into an ordered sequence of blocks.
 *
 * Walk forward through entries:
 *   - `role:system` → SystemBlock
 *   - `role:user` → UserBlock
 *   - `role:assistant` with `toolCalls` → ToolInteractionBlock
 *     (consumes subsequent `role:tool` entries matching the claimed ids)
 *   - `role:assistant` without `toolCalls` → TextBlock
 *   - `role:tool` without a preceding assistant → treated as orphan,
 *     wrapped in a TextBlock defensively (should not appear in valid sequences)
 */
export function parseTranscriptBlocks(entries: readonly TranscriptEntry[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = []
  let i = 0

  while (i < entries.length) {
    const entry = entries[i]

    if (entry.role === 'system') {
      const block: SystemBlock = {
        kind: 'system',
        entry,
        entryIdRange: [entry.id, entry.id],
      }
      blocks.push(block)
      i++
      continue
    }

    if (entry.role === 'user') {
      const block: UserBlock = {
        kind: 'user',
        entry,
        entryIdRange: [entry.id, entry.id],
      }
      blocks.push(block)
      i++
      continue
    }

    if (entry.role === 'assistant') {
      if (entry.toolCalls && entry.toolCalls.length > 0) {
        // ToolInteractionBlock: assistant + all matching tool results
        const claimedIds = new Set<string>(entry.toolCalls.map(tc => tc.id))
        const toolResults: TranscriptEntry[] = []
        // NOTICE: seenResultIds guards against duplicate tool result rows for the
        // same tool_call_id. In normal flow the store is append-only and won't
        // produce duplicates, but retry/replay edge cases can surface them.
        // Deduplicating here (keeping the first occurrence) ensures projection
        // never emits multiple tool messages for the same id, which most
        // providers reject as invalid conversation state.
        const seenResultIds = new Set<string>()
        let lastId = entry.id
        let j = i + 1

        // Consume contiguous tool messages that match claimed ids
        while (j < entries.length && entries[j].role === 'tool') {
          const toolEntry = entries[j]
          if (
            toolEntry.toolCallId
            && claimedIds.has(toolEntry.toolCallId)
            && !seenResultIds.has(toolEntry.toolCallId)
          ) {
            seenResultIds.add(toolEntry.toolCallId)
            toolResults.push(toolEntry)
            lastId = toolEntry.id
            j++
          }
          else {
            break
          }
        }

        const block: ToolInteractionBlock = {
          kind: 'tool_interaction',
          assistant: entry,
          toolResults,
          entryIdRange: [entry.id, lastId],
        }
        blocks.push(block)
        i = j
      }
      else {
        // TextBlock: plain assistant text
        const block: TextBlock = {
          kind: 'text',
          entry,
          entryIdRange: [entry.id, entry.id],
        }
        blocks.push(block)
        i++
      }
      continue
    }

    if (entry.role === 'tool') {
      // Orphan tool message — defensive wrapping.
      // NOTICE: This should not happen in valid sequences. If it does,
      // something upstream produced a broken tool result without a matching
      // assistant tool_call. We wrap it so it doesn't get silently lost.
      const block: TextBlock = {
        kind: 'text',
        entry,
        entryIdRange: [entry.id, entry.id],
      }
      blocks.push(block)
      i++
      continue
    }

    // Unknown role — skip
    i++
  }

  return blocks
}
