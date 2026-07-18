import type { HistoryItem, Message, MessageHistoryBlockSegment, RawMessage } from './types'

/**
 * Options for compacting projected conversation history.
 */
export interface CompactConversationEntriesOptions {
  /** Ordered conversation entries to compact in place. */
  entries: Array<Message | RawMessage>
  /** Maximum number of explicit `turn` items to preserve inside each history block. */
  recentTurnLimit: number
  /** Optional domain-aware summary formatter used for removed history windows. */
  summarizeCompactedHistory?: (input: {
    removedTurnCount: number
    originalItems: HistoryItem[]
    keptItems: HistoryItem[]
  }) => string
}

function isStructuredMessage(entry: Message | RawMessage): entry is Message {
  return 'segments' in entry
}

function countTurns(items: HistoryItem[]) {
  return items.reduce((count, item) => count + (item.type === 'turn' ? 1 : 0), 0)
}

function keepRecentHistoryItems(items: HistoryItem[], recentTurnLimit: number) {
  const keptItems: HistoryItem[] = []
  let turnCount = 0

  for (let index = items.length - 1; index >= 0; index -= 1) {
    keptItems.unshift(items[index])
    if (items[index].type === 'turn')
      turnCount += 1

    if (turnCount >= recentTurnLimit)
      break
  }

  return keptItems
}

function compactHistoryBlock(
  segment: MessageHistoryBlockSegment,
  recentTurnLimit: number,
  summarizeCompactedHistory?: (input: {
    removedTurnCount: number
    originalItems: HistoryItem[]
    keptItems: HistoryItem[]
  }) => string,
): MessageHistoryBlockSegment {
  if (segment.compacted)
    return segment

  const historyTurnCount = countTurns(segment.items)
  if (historyTurnCount <= recentTurnLimit)
    return segment

  const keptItems = keepRecentHistoryItems(segment.items, recentTurnLimit)
  const removedTurnCount = historyTurnCount - recentTurnLimit

  return {
    type: 'history-block',
    compacted: true,
    items: [
      {
        type: 'summary',
        text: summarizeCompactedHistory?.({
          removedTurnCount,
          originalItems: segment.items,
          keptItems,
        }) ?? `Compacted ${removedTurnCount} older turns with paired reactions.`,
        fromTurnIndex: segment.items.find(item => item.type === 'turn')?.type === 'turn'
          ? (segment.items.find(item => item.type === 'turn')?.turnIndex ?? undefined)
          : undefined,
        toTurnIndex: keptItems.findLast(item => item.type === 'turn')?.type === 'turn'
          ? keptItems.findLast(item => item.type === 'turn')?.turnIndex
          : undefined,
      },
      ...keptItems,
    ],
  }
}

/**
 * Compacts older structured history blocks while preserving recent turn/reaction pairs.
 *
 * Use when:
 * - Long-running conversations need a smaller prompt footprint
 * - Domain history must keep recent turn/reaction pairs intact without hardcoding one plugin format
 *
 * Expects:
 * - History blocks to be ordered chronologically
 * - `recentTurnLimit` to be a positive integer
 * - `summarizeCompactedHistory`, when provided, returns domain-specific summary text for removed history
 *
 * Returns:
 * - A new entry array with eligible history blocks compacted in place
 */
export function compactConversationEntries(input: CompactConversationEntriesOptions): Array<Message | RawMessage> {
  if (input.recentTurnLimit <= 0)
    return input.entries

  return input.entries.map((entry) => {
    if (!isStructuredMessage(entry))
      return entry

    return {
      ...entry,
      segments: entry.segments.map((segment) => {
        if (segment.type !== 'history-block')
          return segment

        return compactHistoryBlock(segment, input.recentTurnLimit, input.summarizeCompactedHistory)
      }),
    }
  })
}
