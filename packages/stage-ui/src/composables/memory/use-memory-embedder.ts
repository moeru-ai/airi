import type { EmbedProvider } from '@xsai-ext/providers/utils'

import { embed } from '@xsai/embed'
import { storeToRefs } from 'pinia'

import { useMemoryStore } from '../../stores/modules/memory'
import { useProvidersStore } from '../../stores/providers'

// TODO: make configurable alongside the embed provider settings (mirrors vision's inference timeout).
const EMBED_TIMEOUT_MS = 30_000

/**
 * Turns memory text into an embedding vector using the configured embed provider/model.
 *
 * Use when:
 * - Writing a memory (embed the fact before storing it)
 * - Recalling (embed the query before a cosine search over the memory store)
 *
 * Expects:
 * - `memoryStore.embedProvider` and `embedModel` are set (throws otherwise)
 * - Non-empty input text after trimming
 *
 * Returns:
 * - A dense vector whose length equals `memoryStore.embeddingDimension`. The dimension is asserted so
 *   a misconfigured non-embed model fails loudly instead of silently poisoning cosine search.
 */
export function useMemoryEmbedder() {
  const providersStore = useProvidersStore()
  const memoryStore = useMemoryStore()
  const { embedProvider, embedModel, embeddingDimension } = storeToRefs(memoryStore)

  async function embedText(text: string): Promise<number[]> {
    if (!embedProvider.value || !embedModel.value)
      throw new Error('Memory embed provider/model not configured')

    const input = text.trim()
    if (!input)
      throw new Error('Cannot embed empty text')

    const provider = await providersStore.getProviderInstance<EmbedProvider>(embedProvider.value)

    // Bound the embed call: a stalled local endpoint should reject, not hang recall/write forever.
    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error(`Embedding timed out after ${EMBED_TIMEOUT_MS}ms`))
    }, EMBED_TIMEOUT_MS)

    let embedding: number[]
    try {
      const result = await embed({
        ...provider.embed(embedModel.value),
        input,
        abortSignal: abortController.signal,
      })
      embedding = result.embedding
    }
    catch (error) {
      if (abortController.signal.aborted) {
        throw abortController.signal.reason instanceof Error
          ? abortController.signal.reason
          : new Error(`Embedding timed out after ${EMBED_TIMEOUT_MS}ms`)
      }
      throw error
    }
    finally {
      clearTimeout(timeoutHandle)
    }

    // A dimension mismatch means the selected model is not the one the store assumes (e.g. a chat
    // model was picked). cosineSimilarity returns 0 across mismatched lengths, so without this guard
    // recall would silently return nothing — fail loudly here instead.
    if (embeddingDimension.value > 0 && embedding.length !== embeddingDimension.value) {
      throw new Error(
        `Embedding dimension mismatch: '${embedModel.value}' returned ${embedding.length}, expected ${embeddingDimension.value}`,
      )
    }

    return embedding
  }

  return { embedText }
}
