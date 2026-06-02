import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ChatHistoryItem } from '../../types/chat'

import { errorMessageFrom } from '@moeru/std'
import { generateText } from '@xsai/generate-text'
import { nanoid } from 'nanoid'

import { memoryRepo } from '../../database/repos/memory.repo'
import { extractMessageText } from '../../libs/chat-sync'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../stores/modules/consciousness'
import { useMemoryStore } from '../../stores/modules/memory'
import { buildExtractionMessages, parseExtractedFacts } from '../../stores/modules/memory/extraction'
import { useProvidersStore } from '../../stores/providers'
import { useMemoryEmbedder } from './use-memory-embedder'

const LOCAL_USER_ID = 'local'

/** Outcome of one write pass, for logging/telemetry. */
export interface MemoryWriteResult {
  inserted: number
  merged: number
}

const EMPTY_RESULT: MemoryWriteResult = { inserted: 0, merged: 0 }

function formatConversation(turns: ChatHistoryItem[]): string {
  return turns
    .filter(turn => turn.role === 'user' || turn.role === 'assistant')
    .map((turn) => {
      const text = extractMessageText(turn).trim()
      if (!text)
        return ''
      return `${turn.role === 'assistant' ? 'Companion' : 'User'}: ${text}`
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Long-term memory write path: extract durable facts from recent turns, dedup against existing
 * memories, and store new ones.
 *
 * Use when:
 * - A write trigger fires (every N completed turns) with the recent conversation window.
 *
 * Expects:
 * - `memoryStore.enabled` + a configured embed provider/model and an active chat provider/model.
 *
 * Returns:
 * - `extractAndStore(turns)` → counts of inserted/merged memories. Never throws (a failure yields a
 *   zero result), and a single in-flight pass blocks re-entry so overlapping triggers do not double
 *   write.
 */
export function useMemoryWrite() {
  const memoryStore = useMemoryStore()
  const cardStore = useAiriCardStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProvidersStore()
  const { embedText } = useMemoryEmbedder()

  let running = false

  async function extractCandidates(conversationText: string) {
    const modelId = consciousnessStore.activeModel
    const providerId = consciousnessStore.activeProvider
    if (!modelId || !providerId)
      return []

    const chatProvider = await providersStore.getProviderInstance<ChatProvider>(providerId)
    const { text } = await generateText({
      ...chatProvider.chat(modelId),
      messages: buildExtractionMessages(conversationText),
      // NOTICE: identity encoding mirrors the autonomous-artistry director call; some local OpenAI-
      // compatible servers mis-handle gzip on non-streaming responses.
      headers: { 'Accept-Encoding': 'identity' },
    })
    return parseExtractedFacts(text ?? '')
  }

  async function extractAndStore(turns: ChatHistoryItem[]): Promise<MemoryWriteResult> {
    if (!memoryStore.enabled || !memoryStore.configured || running)
      return EMPTY_RESULT

    const conversationText = formatConversation(turns)
    if (!conversationText)
      return EMPTY_RESULT

    running = true
    try {
      const candidates = await extractCandidates(conversationText)
      if (candidates.length === 0)
        return EMPTY_RESULT

      const scope = { character: cardStore.activeCardId, userId: LOCAL_USER_ID }
      let inserted = 0
      let merged = 0

      for (const candidate of candidates) {
        const embedding = await embedText(candidate.text)
        // Only the single nearest neighbour matters for a dedup decision.
        const [nearest] = await memoryRepo.search(scope, { embedding, k: 1, minSimilarity: memoryStore.mergeThreshold })

        if (nearest) {
          // Near-duplicate: reinforce the existing memory instead of storing a redundant row.
          await memoryRepo.update(scope, nearest.record.id, {
            salience: nearest.record.salience + 1,
            updatedAt: Date.now(),
          })
          merged += 1
        }
        else {
          await memoryRepo.insert({
            id: nanoid(),
            ...scope,
            text: candidate.text,
            type: candidate.type,
            embedding,
            salience: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          inserted += 1
        }
      }

      return { inserted, merged }
    }
    catch (error) {
      console.warn('[memory-write] extract/store failed:', errorMessageFrom(error))
      return EMPTY_RESULT
    }
    finally {
      running = false
    }
  }

  return { extractAndStore }
}
