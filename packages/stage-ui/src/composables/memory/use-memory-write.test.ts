import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const generateText = vi.fn()
const embedText = vi.fn()
const search = vi.fn()
const insert = vi.fn()
const update = vi.fn()
const getProviderInstance = vi.fn()

const memoryState = reactive({ enabled: true, configured: true, mergeThreshold: 0.85 })

vi.mock('@xsai/generate-text', () => ({ generateText }))
vi.mock('./use-memory-embedder', () => ({ useMemoryEmbedder: () => ({ embedText }) }))
vi.mock('../../database/repos/memory.repo', () => ({ memoryRepo: { search, insert, update } }))
vi.mock('../../libs/chat-sync', () => ({
  extractMessageText: (m: { content?: unknown }) => (typeof m.content === 'string' ? m.content : ''),
}))
vi.mock('../../stores/modules/airi-card', () => ({ useAiriCardStore: () => ({ activeCardId: 'airi' }) }))
vi.mock('../../stores/modules/consciousness', () => ({ useConsciousnessStore: () => ({ activeModel: 'm', activeProvider: 'p' }) }))
vi.mock('../../stores/providers', () => ({ useProvidersStore: () => ({ getProviderInstance }) }))
vi.mock('../../stores/modules/memory', () => ({ useMemoryStore: () => memoryState }))

const turns = [
  { role: 'user', content: 'I have a cat named Meiqiu', id: 'u1' },
  { role: 'assistant', content: 'aww, cute', id: 'a1' },
] as never[]

describe('useMemoryWrite', () => {
  beforeEach(() => {
    generateText.mockReset()
    embedText.mockReset()
    search.mockReset()
    insert.mockReset()
    update.mockReset()
    getProviderInstance.mockReset()
    getProviderInstance.mockResolvedValue({ chat: () => ({ baseURL: 'x', apiKey: 'k', model: 'm' }) })
    embedText.mockResolvedValue([1, 0, 0])
    memoryState.enabled = true
    memoryState.configured = true
    memoryState.mergeThreshold = 0.85
  })

  /**
   * @example
   * No near-duplicate -> a new memory is inserted with the candidate text/type and the embedding.
   */
  it('inserts a new memory when there is no near-duplicate', async () => {
    generateText.mockResolvedValue({ text: '[{"text":"User has a cat named Meiqiu","type":"fact"}]' })
    search.mockResolvedValue([])

    const { useMemoryWrite } = await import('./use-memory-write')
    const res = await useMemoryWrite().extractAndStore(turns)

    expect(res).toEqual({ inserted: 1, merged: 0 })
    expect(insert).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    const inserted = insert.mock.calls[0][0]
    expect(inserted.text).toBe('User has a cat named Meiqiu')
    expect(inserted.type).toBe('fact')
    expect(inserted.salience).toBe(1)
    expect(inserted.embedding).toEqual([1, 0, 0])
    expect(inserted.character).toBe('airi')
  })

  /**
   * @example
   * A near-duplicate (search hit at/above mergeThreshold) reinforces salience instead of inserting.
   */
  it('reinforces an existing memory when a near-duplicate is found', async () => {
    generateText.mockResolvedValue({ text: '[{"text":"User has a cat","type":"fact"}]' })
    search.mockResolvedValue([{ record: { id: 'x', salience: 2 }, similarity: 0.9 }])

    const { useMemoryWrite } = await import('./use-memory-write')
    const res = await useMemoryWrite().extractAndStore(turns)

    expect(res).toEqual({ inserted: 0, merged: 1 })
    expect(update).toHaveBeenCalledOnce()
    const [, id, patch] = update.mock.calls[0]
    expect(id).toBe('x')
    expect(patch.salience).toBe(3)
    expect(insert).not.toHaveBeenCalled()
    expect(search.mock.calls[0][1].minSimilarity).toBe(0.85)
  })

  /**
   * @example
   * Disabled memory -> no extraction LLM call at all.
   */
  it('does nothing and skips the LLM when disabled', async () => {
    memoryState.enabled = false

    const { useMemoryWrite } = await import('./use-memory-write')
    const res = await useMemoryWrite().extractAndStore(turns)

    expect(res).toEqual({ inserted: 0, merged: 0 })
    expect(generateText).not.toHaveBeenCalled()
  })

  /**
   * @example
   * Extractor returns no candidates -> nothing is embedded or stored.
   */
  it('stores nothing when the extractor yields no candidates', async () => {
    generateText.mockResolvedValue({ text: '[]' })

    const { useMemoryWrite } = await import('./use-memory-write')
    const res = await useMemoryWrite().extractAndStore(turns)

    expect(res).toEqual({ inserted: 0, merged: 0 })
    expect(embedText).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
