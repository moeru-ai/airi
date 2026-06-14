import { errorMessageFrom } from '@moeru/std'

import { memoryRepo } from '../../database/repos/memory.repo'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useMemoryStore } from '../../stores/modules/memory'
import { formatRecalledMemories, rankRecallHits } from '../../stores/modules/memory/recall-scoring'
import { useMemoryEmbedder } from './use-memory-embedder'

const DAY_MS = 86_400_000

// Single local user until multi-user scoping lands; memories are scoped per character + this id.
const LOCAL_USER_ID = 'local'

/**
 * Read-only long-term memory recall for a chat turn.
 *
 * Use when:
 * - About to compose a turn and want relevant memories injected as side context.
 *
 * Expects:
 * - `memoryStore.enabled` and a configured embed provider/model; otherwise recall is a no-op.
 * - A pre-built query string (typically the current input plus the last turn or two).
 *
 * Returns:
 * - `recall(query)` → the formatted `[Memory]` block, or '' when memory is off, unconfigured, the
 *   query is empty, or nothing clears the similarity threshold. P3 is read-only: no salience
 *   reinforcement or writes happen here (deferred to the write path).
 */
export function useMemoryRecall() {
  const memoryStore = useMemoryStore()
  const cardStore = useAiriCardStore()
  const { embedText } = useMemoryEmbedder()

  async function recall(query: string): Promise<string> {
    if (!memoryStore.enabled || !memoryStore.configured)
      return ''

    const text = query.trim()
    if (!text)
      return ''

    const scope = { character: cardStore.activeCardId, userId: LOCAL_USER_ID }

    try {
      const embedding = await embedText(text)
      const hits = await memoryRepo.search(scope, {
        embedding,
        k: memoryStore.topK,
        minSimilarity: memoryStore.simThreshold,
      })
      if (hits.length === 0)
        return ''

      const ranked = rankRecallHits(hits, Date.now(), {
        recencyHalfLifeMs: memoryStore.recencyHalfLifeDays * DAY_MS,
      })
      return formatRecalledMemories(ranked.map(hit => hit.record))
    }
    catch (error) {
      // Recall must never break a turn: a failed embed/search just yields no memory context.
      console.warn('[memory-recall] recall failed:', errorMessageFrom(error))
      return ''
    }
  }

  return { recall }
}
