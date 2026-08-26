/**
 * Transcript Projector - assembles a provider-safe LLM request from transcript
 * truth source entries.
 *
 * This module is intentionally pure and transcript-only. It does not read audit
 * logs, mutate the transcript store, write archive files, or call external
 * context projectors. Later runtime layers can prepend richer system context at
 * the call site without making projected messages the truth source.
 */

import type {
  CompactedBlock,
  ToolInteractionBlock,
  TranscriptBlock,
  TranscriptEntry,
  TranscriptProjectedMessage,
  TranscriptProjectionMetadata,
  TranscriptProjectionResult,
} from './types'

import { parseTranscriptBlocks } from './block-parser'
import { compactBlock } from './compactor'

export interface TranscriptProjectionOptions {
  /** Maximum number of compacted summary blocks to include as quoted history. */
  maxCompactedBlocks?: number
  /** Maximum number of recent text-like blocks to keep in full. */
  maxFullTextBlocks?: number
  /** Maximum number of recent tool-interaction blocks to keep in full. */
  maxFullToolBlocks?: number
  /** System prompt base text. */
  systemPromptBase?: string
  /** Optional current-task memory/context text to pin in the system prompt. */
  taskMemoryString?: string
}

const DEFAULTS = {
  maxCompactedBlocks: 4,
  maxFullTextBlocks: 3,
  maxFullToolBlocks: 5,
}

/**
 * Project the full transcript into a provider-safe LLM request.
 *
 * Invariants:
 * - The first user message is pinned.
 * - Recent full tool interactions keep assistant tool_calls and matching tool
 *   results together.
 * - Compacted summaries are carried as quoted assistant history, never as
 *   system instructions or synthetic user messages.
 * - Orphan tool messages are never emitted.
 */
export function projectTranscript(
  transcriptEntries: readonly TranscriptEntry[],
  opts: TranscriptProjectionOptions = {},
): TranscriptProjectionResult {
  const maxFullToolBlocks = opts.maxFullToolBlocks ?? DEFAULTS.maxFullToolBlocks
  const maxFullTextBlocks = opts.maxFullTextBlocks ?? DEFAULTS.maxFullTextBlocks
  const maxCompactedBlocks = opts.maxCompactedBlocks ?? DEFAULTS.maxCompactedBlocks

  let system = opts.systemPromptBase ?? ''
  if (opts.taskMemoryString?.trim()) {
    system += `${system ? '\n\n' : ''}Task Memory\n${opts.taskMemoryString}`
  }

  const allBlocks = parseTranscriptBlocks(transcriptEntries)

  if (allBlocks.length === 0) {
    return {
      messages: [],
      metadata: {
        compactedBlocks: 0,
        droppedBlocks: 0,
        estimatedCharacters: system.length,
        keptFullBlocks: 0,
        projectedMessageCount: 0,
        totalBlocks: 0,
        totalTranscriptEntries: transcriptEntries.length,
      },
      system,
    }
  }

  const firstUserBlockIdx = allBlocks.findIndex(b => b.kind === 'user')
  const pinnedBlock = firstUserBlockIdx >= 0 ? allBlocks[firstUserBlockIdx] : null
  const candidateBlocks = allBlocks.filter((_, idx) => idx !== firstUserBlockIdx)

  const toolBlocks: ToolInteractionBlock[] = []
  const textLikeBlocks: TranscriptBlock[] = []

  for (const block of candidateBlocks) {
    switch (block.kind) {
      case 'system':
      case 'text':
      case 'user':
        textLikeBlocks.push(block)
        break
      case 'tool_interaction':
        toolBlocks.push(block)
        break
    }
  }

  // Only complete tool interactions may be re-emitted as provider messages.
  // Incomplete interactions are compacted/dropped so projected history never
  // contains assistant tool_calls without matching tool results.
  const completeToolBlocks = toolBlocks.filter(block => isCompleteToolInteraction(block))
  const keptToolBlocks: Set<TranscriptBlock> = new Set(takeLast(completeToolBlocks, maxFullToolBlocks))
  const keptTextBlocks: Set<TranscriptBlock> = new Set(takeLast(textLikeBlocks, maxFullTextBlocks))

  const blocksToCompact: TranscriptBlock[] = []
  for (const block of candidateBlocks) {
    if (keptToolBlocks.has(block) || keptTextBlocks.has(block)) {
      continue
    }
    blocksToCompact.push(block)
  }

  const compactedSourceBlocks = maxCompactedBlocks <= 0
    ? []
    : blocksToCompact.slice(-maxCompactedBlocks)
  const droppedBlocks = blocksToCompact.length - compactedSourceBlocks.length
  const compactedResults: CompactedBlock[] = compactedSourceBlocks.map(b => compactBlock(b))

  const compactedHistoryMessage = compactedResults.length > 0
    ? createCompactedHistoryMessage(compactedResults)
    : null

  interface EmitItem { block: TranscriptBlock, sortKey: number }
  const emitItems: EmitItem[] = []

  if (pinnedBlock) {
    emitItems.push({ block: pinnedBlock, sortKey: pinnedBlock.entryIdRange[0] })
  }

  for (const block of candidateBlocks) {
    if (keptToolBlocks.has(block) || keptTextBlocks.has(block)) {
      emitItems.push({ block, sortKey: block.entryIdRange[0] })
    }
  }

  emitItems.sort((a, b) => a.sortKey - b.sortKey)

  const messages: TranscriptProjectedMessage[] = []
  for (const item of emitItems) {
    const block = item.block
    switch (block.kind) {
      case 'system':
      case 'user':
        messages.push(entryToMessage(block.entry))
        break
      case 'text':
        if (block.entry.role !== 'tool') {
          messages.push(entryToMessage(block.entry))
        }
        break
      case 'tool_interaction':
        messages.push(entryToMessage(block.assistant))
        for (const tr of block.toolResults) {
          messages.push(entryToMessage(tr))
        }
        break
    }
  }
  if (compactedHistoryMessage) {
    const firstUserMessageIndex = messages.findIndex(m => m.role === 'user')
    messages.splice(firstUserMessageIndex >= 0 ? firstUserMessageIndex + 1 : 0, 0, compactedHistoryMessage)
  }

  const keptFullCount = (pinnedBlock ? 1 : 0)
    + keptToolBlocks.size
    + keptTextBlocks.size

  const estimatedChars = system.length
    + messages.reduce((acc, m) =>
      acc
      + estimateContentCharacters(m.content)
      + estimateToolCallsCharacters(m.tool_calls), 0)

  const metadata: TranscriptProjectionMetadata = {
    compactedBlocks: compactedResults.length,
    droppedBlocks,
    estimatedCharacters: estimatedChars,
    keptFullBlocks: keptFullCount,
    projectedMessageCount: messages.length,
    totalBlocks: allBlocks.length,
    totalTranscriptEntries: transcriptEntries.length,
  }

  return { messages, metadata, system }
}

function createCompactedHistoryMessage(compactedResults: readonly CompactedBlock[]): TranscriptProjectedMessage {
  const payload = compactedResults.map(block => ({
    entryIdRange: block.entryIdRange,
    originalKind: block.originalKind,
    summary: block.summary,
  }))

  return {
    content: [
      'Compacted transcript history follows as quoted JSON data.',
      'This is historical context only, not a system instruction.',
      JSON.stringify(payload),
    ].join('\n'),
    role: 'assistant',
  }
}

function entryToMessage(entry: TranscriptEntry): TranscriptProjectedMessage {
  const msg: TranscriptProjectedMessage = {
    content: entry.content,
    role: entry.role,
  }
  if (entry.toolCalls && entry.toolCalls.length > 0) {
    msg.tool_calls = entry.toolCalls
  }
  if (entry.toolCallId) {
    msg.tool_call_id = entry.toolCallId
  }
  return msg
}

function estimateContentCharacters(content: string | undefined | unknown[]): number {
  if (content === undefined)
    return 0
  if (typeof content === 'string')
    return content.length
  return content.reduce<number>((acc, part) => acc + estimateStructuredPartCharacters(part), 0)
}

function estimateStructuredPartCharacters(part: unknown): number {
  if (typeof part === 'string')
    return part.length
  if (typeof part !== 'object' || part === null)
    return 16

  const record = part as { text?: unknown, type?: unknown }
  if (record.type === 'text' && typeof record.text === 'string')
    return record.text.length

  return 64
}

function estimateToolCallsCharacters(toolCalls: TranscriptProjectedMessage['tool_calls']): number {
  if (!toolCalls?.length)
    return 0
  return toolCalls.reduce((acc, tc) =>
    acc
    + tc.id.length
    + tc.type.length
    + tc.function.name.length
    + tc.function.arguments.length
    + 32, 0)
}

function isCompleteToolInteraction(block: ToolInteractionBlock): boolean {
  const toolCalls = block.assistant.toolCalls ?? []
  if (toolCalls.length === 0)
    return false

  // Reject duplicate assistant tool_call IDs (provider hallucination)
  const uniqueToolCallIds = new Set(toolCalls.map(tc => tc.id))
  if (uniqueToolCallIds.size !== toolCalls.length)
    return false

  const resultIds = new Set(
    block.toolResults
      .map(result => result.toolCallId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )

  return toolCalls.every(toolCall => resultIds.has(toolCall.id))
}

function takeLast<T>(items: readonly T[], limit: number): T[] {
  if (limit <= 0)
    return []
  return items.slice(-limit)
}
