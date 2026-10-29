import { createMemoryConsolidationAgent } from '@proj-airi/agents/memory-consolidation'

import { useMemoryStore } from '../stores/memory'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useTextGeneration } from './text-generation'

/**
 * Tidies up the memories of one character card with its chat model, when the owner asks for it in Settings.
 *
 * The agent in `@proj-airi/agents/memory-consolidation` owns the prompt and the reply format.
 *
 * Returns:
 * - `consolidate`, which replaces the card's entries with the tidied ones. It rejects when the card has no chat model,
 *   the request fails, or the reply is not valid. The memory stays as it is then.
 */
export function useMemoryConsolidation() {
  const memory = useMemoryStore()
  const cards = useAiriCardStore()
  const { generateText } = useTextGeneration()

  async function consolidate(personaId: string) {
    const { provider, model } = cards.getModules(personaId).consciousness
    if (!provider || !model)
      throw new Error('No chat model is configured for this character')

    const entries = memory.entries
      .filter(entry => entry.persona === personaId)
      .map(({ id, description, body }) => ({ id, description, body }))
    const agent = createMemoryConsolidationAgent({ generateText: generateText({ providerId: provider, model }) })
    const results = await agent.consolidate(entries, new AbortController().signal)
    memory.consolidate(personaId, entries.map(entry => entry.id), results)
  }

  return { consolidate }
}
