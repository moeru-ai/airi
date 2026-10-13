import type { Card } from '@proj-airi/ccc'

type Lorebook = NonNullable<Card['characterBook']>
type LorebookEntry = Lorebook['entries'][number]

/**
 * Number of latest chat messages to search when the lorebook has no `scan_depth`.
 * The current user message is always searched in addition to these messages.
 */
const DEFAULT_SCAN_DEPTH = 4

function matchesKey(text: string, key: string, entry: LorebookEntry): boolean {
  if (!key)
    return false

  if (entry.use_regex) {
    try {
      return new RegExp(key, entry.case_sensitive ? '' : 'i').test(text)
    }
    catch {
      // An invalid pattern in a hand-edited card must not stop the chat turn.
      // The entry is treated as not matched.
      return false
    }
  }

  if (entry.case_sensitive)
    return text.includes(key)
  return text.toLowerCase().includes(key.toLowerCase())
}

function matchesAnyKey(text: string, keys: readonly string[], entry: LorebookEntry): boolean {
  return keys.some(key => matchesKey(text, key, entry))
}

function isEntryActive(entry: LorebookEntry, text: string): boolean {
  if (!entry.enabled)
    return false
  if (entry.constant)
    return true
  if (!matchesAnyKey(text, entry.keys, entry))
    return false

  // A selective entry also needs a secondary key. Without secondary keys,
  // the primary keys decide alone.
  const secondaryKeys = entry.secondary_keys
  if (entry.selective && secondaryKeys && secondaryKeys.length > 0)
    return matchesAnyKey(text, secondaryKeys, entry)
  return true
}

/**
 * Selects the lorebook entries for one chat turn, in prompt order.
 *
 * `recentMessages` is the chat history, oldest first. Only the last
 * `scan_depth` messages and `currentMessage` are searched for keys.
 * The result is sorted by `insertion_order`, lowest first.
 *
 * `token_budget`, `recursive_scanning`, and `position` are not applied.
 *
 * @example
 * selectLorebookEntries(book, ['hi'], 'it is my birthday')
 * // => [{ keys: ['birthday'], content: 'Birthday is 1 January.', ... }]
 */
export function selectLorebookEntries(
  book: Lorebook | undefined,
  recentMessages: readonly string[],
  currentMessage: string,
): LorebookEntry[] {
  if (!book || book.entries.length === 0)
    return []

  const scanDepth = Math.max(0, book.scan_depth ?? DEFAULT_SCAN_DEPTH)
  const scannedMessages = scanDepth > 0 ? recentMessages.slice(-scanDepth) : []
  const text = [...scannedMessages, currentMessage].join('\n')

  return book.entries
    .filter(entry => isEntryActive(entry, text))
    .sort((a, b) => a.insertion_order - b.insertion_order)
}
