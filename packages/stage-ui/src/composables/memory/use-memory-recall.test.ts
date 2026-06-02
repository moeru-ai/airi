import type { MemorySearchHit } from '../../types/memory'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const embedText = vi.fn()
const search = vi.fn()

const memoryState = reactive({
  enabled: true,
  configured: true,
  topK: 6,
  simThreshold: 0.6,
  recencyHalfLifeDays: 30,
})

vi.mock('./use-memory-embedder', () => ({
  useMemoryEmbedder: () => ({ embedText }),
}))

vi.mock('../../database/repos/memory.repo', () => ({
  memoryRepo: { search },
}))

vi.mock('../../stores/modules/airi-card', () => ({
  useAiriCardStore: () => ({ activeCardId: 'airi' }),
}))

vi.mock('../../stores/modules/memory', () => ({
  useMemoryStore: () => memoryState,
}))

function hit(text: string, similarity: number): MemorySearchHit {
  return {
    similarity,
    record: {
      id: text,
      character: 'airi',
      userId: 'local',
      text,
      type: 'fact',
      embedding: [1, 0, 0],
      salience: 1,
      createdAt: 0,
      updatedAt: 0,
    },
  }
}

describe('useMemoryRecall', () => {
  beforeEach(() => {
    embedText.mockReset()
    search.mockReset()
    memoryState.enabled = true
    memoryState.configured = true
    memoryState.topK = 6
    memoryState.simThreshold = 0.6
    memoryState.recencyHalfLifeDays = 30
  })

  /**
   * @example
   * Disabled memory -> '' and never embeds or searches.
   */
  it('returns empty and skips work when memory is disabled', async () => {
    memoryState.enabled = false

    const { useMemoryRecall } = await import('./use-memory-recall')
    await expect(useMemoryRecall().recall('hi')).resolves.toBe('')
    expect(embedText).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  /**
   * @example
   * Configured but no search hits -> '' (caller clears its context line).
   */
  it('returns empty when nothing clears the similarity threshold', async () => {
    embedText.mockResolvedValue([1, 0, 0])
    search.mockResolvedValue([])

    const { useMemoryRecall } = await import('./use-memory-recall')
    await expect(useMemoryRecall().recall('what do you know')).resolves.toBe('')
    expect(search).toHaveBeenCalledOnce()
  })

  /**
   * @example
   * Hits -> a formatted [Memory] block, and search uses the store's top-k + threshold.
   */
  it('formats recalled memories and forwards top-k + threshold to search', async () => {
    embedText.mockResolvedValue([1, 0, 0])
    search.mockResolvedValue([hit('User prefers tea', 0.8), hit('Lives in Berlin', 0.7)])

    const { useMemoryRecall } = await import('./use-memory-recall')
    const text = await useMemoryRecall().recall('  tell me about myself  ')

    expect(text).toContain('Things you remember')
    expect(text).toContain('- User prefers tea')
    expect(text).toContain('- Lives in Berlin')

    expect(embedText).toHaveBeenCalledWith('tell me about myself')
    const [, query] = search.mock.calls[0]
    expect(query.k).toBe(6)
    expect(query.minSimilarity).toBe(0.6)
  })

  /**
   * @example
   * An embed failure is swallowed so a turn never breaks; recall yields ''.
   */
  it('returns empty when embedding throws', async () => {
    embedText.mockRejectedValue(new Error('embed down'))

    const { useMemoryRecall } = await import('./use-memory-recall')
    await expect(useMemoryRecall().recall('hi')).resolves.toBe('')
  })
})
