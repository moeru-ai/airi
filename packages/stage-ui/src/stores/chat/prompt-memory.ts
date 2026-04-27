import type { MemoryGateway, MemoryPromptContext, MemoryScope } from '../../services/memory/gateway'

// NOTICE:
// Realtime chat reads local memory only through the local memory gateway
// (desktop SQLite, web stub). LangMem is cloud background consolidation only:
// prompt assembly must not wait for raw-turn upload, patch pull, runtime ticks,
// fetch, or any LangMem response. Local long-term tables are patched from cloud
// memory output; they are not generated in the realtime chat path.

/**
 * Renders local memory prompt context into a compact, deterministic text block.
 *
 * Use when:
 * - The chat orchestrator wants to attach local memory to the latest user turn
 * - Prompt assembly must keep a stable section order for cache friendliness
 *
 * Expects:
 * - `profileSummary`, `stableFacts`, and `recentTurns` may each be empty
 * - Memory cards are intentionally ignored in Phase 5
 *
 * Returns:
 * - Empty string when no supported memory content exists
 * - Otherwise a `[Memory]` block with sections ordered as profile summary,
 *   stable facts, then recent turns
 */
export function formatMemoryPromptText(promptContext: MemoryPromptContext) {
  const sections: string[] = []

  if (promptContext.profileSummary) {
    sections.push([
      '[Profile Summary]',
      promptContext.profileSummary,
    ].join('\n'))
  }

  if (promptContext.stableFacts.length > 0) {
    sections.push([
      '[Stable Facts]',
      ...promptContext.stableFacts.map(fact => `- ${fact.key}: ${fact.value}`),
    ].join('\n'))
  }

  if (promptContext.recentTurns.length > 0) {
    sections.push([
      '[Recent Turns]',
      ...promptContext.recentTurns.map(turn => `- ${turn.role}: ${turn.text}`),
    ].join('\n'))
  }

  if (sections.length === 0)
    return ''

  return ['[Memory]', ...sections].join('\n\n')
}

/**
 * Reads local memory prompt context and returns both the raw snapshot and formatted text.
 *
 * Use when:
 * - The chat store needs a safe pre-LLM memory read path
 * - Runtime adapters may legitimately return empty prompt context
 *
 * Expects:
 * - `gateway.readPromptContext` should be resilient, but any thrown error is treated
 *   as an empty-memory fallback in Phase 5
 *
 * Returns:
 * - The prompt context plus a formatted text block
 * - On failure, a stable empty snapshot and empty prompt text
 */
export async function readMemoryPromptText(params: {
  gateway: MemoryGateway
  scope: MemoryScope
}) {
  try {
    const promptContext = await params.gateway.readPromptContext({
      scope: params.scope,
    })

    return {
      promptContext,
      promptText: formatMemoryPromptText(promptContext),
    }
  }
  catch {
    const promptContext: MemoryPromptContext = {
      memoryCards: [],
      profileSummary: null,
      recentTurns: [],
      schemaVersion: 0,
      scope: params.scope,
      stableFacts: [],
    }

    return {
      promptContext,
      promptText: '',
    }
  }
}
