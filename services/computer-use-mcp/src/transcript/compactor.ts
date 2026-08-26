/**
 * Deterministic Compactor - summarizes transcript blocks without LLM calls.
 *
 * When a transcript block is removed from the prompt, the compactor generates
 * a lightweight, deterministic summary so the model doesn't experience a
 * complete context blackout in the middle of the conversation.
 *
 * Rules:
 *   - Tool interaction blocks: tool name and deterministic result snippets
 *   - Text blocks: truncated first N chars of the assistant text
 *   - User blocks: truncated first N chars
 *   - System blocks: "[system message]"
 *   - Compacted blocks are explicitly tagged; they cannot be confused with
 *     original transcript entries.
 */

import type { CompactedBlock, TranscriptBlock } from './types'

/** Maximum characters for content snippets in compacted summaries. */
const SUMMARY_SNIPPET_LENGTH = 120

/**
 * Generate a deterministic compacted summary for a transcript block.
 */
export function compactBlock(block: TranscriptBlock): CompactedBlock {
  switch (block.kind) {
    case 'system': {
      return {
        entryIdRange: block.entryIdRange,
        kind: 'compacted',
        originalKind: 'system',
        summary: '[Compacted system message]',
      }
    }

    case 'text': {
      const text = contentToString(block.entry.content)
      return {
        entryIdRange: block.entryIdRange,
        kind: 'compacted',
        originalKind: 'text',
        summary: `[Compacted ${block.entry.role} text] ${snippet(text)}`,
      }
    }

    case 'tool_interaction': {
      const toolNames = (block.assistant.toolCalls ?? [])
        .map(tc => tc.function.name)
        .join(', ')

      const resultSummaries = block.toolResults.map((tr) => {
        const text = contentToString(tr.content)
        return `${tr.toolCallId}: ${snippet(text)}`
      })

      const summary = [
        `[Compacted tool interaction] Tools: ${toolNames}`,
        ...resultSummaries.map(r => `  ${r}`),
      ].join('\n')

      return {
        entryIdRange: block.entryIdRange,
        kind: 'compacted',
        originalKind: 'tool_interaction',
        summary,
      }
    }

    case 'user': {
      const text = contentToString(block.entry.content)
      return {
        entryIdRange: block.entryIdRange,
        kind: 'compacted',
        originalKind: 'user',
        summary: `[Compacted user message] ${snippet(text)}`,
      }
    }
  }
}

/**
 * Coerce transcript entry content to a string for summarization.
 * Handles the widened `string | unknown[]` content type.
 */
function contentToString(content: string | undefined | unknown[]): string {
  if (content === undefined || content === null)
    return ''
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    // Extract text parts from structured content arrays
    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (isTextContentPart(part))
          return part.text
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return String(content)
}

function isTextContentPart(part: unknown): part is { text: string, type: 'text' } {
  if (typeof part !== 'object' || part === null)
    return false
  const record = part as { text?: unknown, type?: unknown }
  return record.type === 'text' && typeof record.text === 'string'
}

/**
 * Truncate a string to the snippet length, appending '...' if truncated.
 */
function snippet(text: string): string {
  if (text.length <= SUMMARY_SNIPPET_LENGTH)
    return text
  return `${text.slice(0, SUMMARY_SNIPPET_LENGTH)}...`
}
