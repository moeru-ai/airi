import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useMemoryLongTermStore } from './memory-long-term'

describe('useMemoryLongTermStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = useMemoryLongTermStore()
    expect(store.enabled).toBe(false)
    expect(store.vectorDbProvider).toBe('')
    expect(store.embeddingProvider).toBe('')
    expect(store.embeddingModel).toBe('')
    expect(store.configured).toBe(false)
  })

  it('should not be configured when only enabled', () => {
    const store = useMemoryLongTermStore()
    store.enabled = true
    expect(store.configured).toBe(false)
  })

  it('should be configured when all required fields are set', () => {
    const store = useMemoryLongTermStore()
    store.enabled = true
    store.vectorDbProvider = 'pgvector'
    store.embeddingProvider = 'openai'
    store.embeddingModel = 'text-embedding-3-small'
    expect(store.configured).toBe(true)
  })

  it('should reset state', () => {
    const store = useMemoryLongTermStore()
    store.enabled = true
    store.vectorDbProvider = 'pgvector'
    store.embeddingProvider = 'openai'
    store.embeddingModel = 'text-embedding-3-small'
    store.resetState()
    expect(store.enabled).toBe(false)
    expect(store.vectorDbProvider).toBe('')
    expect(store.embeddingProvider).toBe('')
    expect(store.embeddingModel).toBe('')
  })
})
