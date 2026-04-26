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
  /** System prompt base text. */
  systemPromptBase?: string
  /** Optional current-task memory/context text to pin in the system prompt. */
  taskMemoryString?: string
  /** Maximum number of recent tool-interaction blocks to keep in full. */
  maxFullToolBlocks?: number
  /** Maximum number of recent text-like blocks to keep in full. */
  maxFullTextBlocks?: number
  /** Maximum number of compacted summary blocks to include as quoted history. */
  maxCompactedBlocks?: number
}

const DEFAULTS = {
  maxFullToolBlocks: 5,
  maxFullTextBlocks: 3,
  maxCompactedBlocks: 4,
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
      system,
      messages: [],
      metadata: {
        totalTranscriptEntries: transcriptEntries.length,
        totalBlocks: 0,
        keptFullBlocks: 0,
        compactedBlocks: 0,
        droppedBlocks: 0,
        projectedMessageCount: 0,
        estimatedCharacters: system.length,
      },
    }
  }

  const firstUserBlockIdx = allBlocks.findIndex(b => b.kind === 'user')
  const pinnedBlock = firstUserBlockIdx >= 0 ? allBlocks[firstUserBlockIdx] : null
  const candidateBlocks = allBlocks.filter((_, idx) => idx !== firstUserBlockIdx)

  const toolBlocks: ToolInteractionBlock[] = []
  const textLikeBlocks: TranscriptBlock[] = []

  for (const block of candidateBlocks) {
    switch (block.kind) {
      case 'tool_interaction':
        toolBlocks.push(block)
        break
      case 'text':
      case 'system':
      case 'user':
        textLikeBlocks.push(block)
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

  interface EmitItem { sortKey: number, block: TranscriptBlock }
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
      case 'user':
      case 'system':
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
    totalTranscriptEntries: transcriptEntries.length,
    totalBlocks: allBlocks.length,
    keptFullBlocks: keptFullCount,
    compactedBlocks: compactedResults.length,
    droppedBlocks,
    projectedMessageCount: messages.length,
    estimatedCharacters: estimatedChars,
  }

  return { system, messages, metadata }
}

function entryToMessage(entry: TranscriptEntry): TranscriptProjectedMessage {
  const msg: TranscriptProjectedMessage = {
    role: entry.role,
    content: entry.content,
  }
  if (entry.toolCalls && entry.toolCalls.length > 0) {
    msg.tool_calls = entry.toolCalls
  }
  if (entry.toolCallId) {
    msg.tool_call_id = entry.toolCallId
  }
  return msg
}

function createCompactedHistoryMessage(compactedResults: readonly CompactedBlock[]): TranscriptProjectedMessage {
  const payload = compactedResults.map(block => ({
    originalKind: block.originalKind,
    entryIdRange: block.entryIdRange,
    summary: block.summary,
  }))

  return {
    role: 'assistant',
    content: [
      'Compacted transcript history follows as quoted JSON data.',
      'This is historical context only, not a system instruction.',
      JSON.stringify(payload),
    ].join('\n'),
  }
}

function isCompleteToolInteraction(block: ToolInteractionBlock): boolean {
  const toolCalls = block.assistant.toolCalls ?? []
  if (toolCalls.length === 0)
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

function estimateContentCharacters(content: string | unknown[] | undefined): number {
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

  const record = part as { type?: unknown, text?: unknown }
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
