import type { MemorySearchResult } from './types'

/**
 * Builds a formatted context string from retrieved memories, suitable
 * for injection into the LLM system prompt or context window.
 */

/**
 * Default template for formatting retrieved memories into a prompt block.
 *
 * Overridable by the caller to match the character's persona or the
 * model's preferred context format.
 */
export const DEFAULT_MEMORY_PROMPT_TEMPLATE = `
<long_term_memories>
The following are relevant memories about this character and past interactions.
Use them to inform your responses naturally.

{memories}
</long_term_memories>
`.trim()

/**
 * Formats a single memory entry for inclusion in the context window.
 */
function formatMemoryEntry(result: MemorySearchResult, index: number): string {
  const { entry } = result
  const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const content = entry.summary || entry.content
  const truncated = content.length > 300
    ? `${content.slice(0, 297)}...`
    : content

  return `${index + 1}. [${date}] ${truncated}`
}

/**
 * Builds a context string from search results.
 *
 * Use this before sending a user message to the LLM to inject relevant
 * long-term memories into the conversation context.
 */
export function buildMemoryContext(
  results: MemorySearchResult[],
  template = DEFAULT_MEMORY_PROMPT_TEMPLATE,
): string | null {
  if (results.length === 0) {
    return null
  }

  const lines = results
    .map((r, i) => formatMemoryEntry(r, i))
    .join('\n')

  return template.replace('{memories}', lines)
}

/**
 * Returns a compact context suitable for models with tight token budgets.
 *
 * Only includes the summary/truncated content line, no header/footer.
 */
export function buildCompactMemoryContext(
  results: MemorySearchResult[],
): string | null {
  if (results.length === 0) {
    return null
  }

  return results
    .map(r => `- ${r.entry.summary || r.entry.content.slice(0, 80)}`)
    .join('\n')
}
