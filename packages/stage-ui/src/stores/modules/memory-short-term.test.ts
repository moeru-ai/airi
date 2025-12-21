import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useMemoryShortTermStore } from './memory-short-term'

describe('useMemoryShortTermStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = useMemoryShortTermStore()
    expect(store.enabled).toBe(false)
    expect(store.maxMessages).toBe(20)
    expect(store.configured).toBe(false)
  })

  it('should be configured when enabled', () => {
    const store = useMemoryShortTermStore()
    store.enabled = true
    expect(store.configured).toBe(true)
  })

  it('should update maxMessages', () => {
    const store = useMemoryShortTermStore()
    store.maxMessages = 50
    expect(store.maxMessages).toBe(50)
  })

  it('should reset state', () => {
    const store = useMemoryShortTermStore()
    store.enabled = true
    store.maxMessages = 100
    store.resetState()
    expect(store.enabled).toBe(false)
    expect(store.maxMessages).toBe(20)
  })
})
