import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { memoryName, useMemoryStore } from './memory'

describe('memory store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps one entry per name and lists each in the index', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'Favorite Game', description: 'What the owner plays.', body: 'Porridge games.', visibility: 'owner' })
    memory.write({ name: 'favorite-game', description: 'What the owner plays now.', body: 'Minecraft.', visibility: 'owner' })

    expect(memory.entries.map(entry => entry.name)).toEqual(['favorite-game'])
    expect(memory.indexFor(true)).toBe('- favorite-game: What the owner plays now.')
    expect(memory.read('Favorite Game', true)?.body).toBe('Minecraft.')
  })

  // An owner-only memory never reaches a reader that is not the owner alone.
  it('shows owner entries only to the owner alone', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'allergy', description: 'Food the owner avoids.', body: 'Peanuts.', visibility: 'owner' })
    memory.write({ name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.', visibility: 'shared' })

    expect(memory.indexFor(false)).toBe('- nickname: What the owner likes to be called.')
    expect(memory.read('allergy', false)).toBeUndefined()
    expect(memory.read('allergy', true)?.body).toBe('Peanuts.')
  })

  it('refuses an empty name or body, and forgets by name', () => {
    const memory = useMemoryStore()
    expect(memory.write({ name: '!!', description: '', body: 'x', visibility: 'owner' })).toBeUndefined()
    expect(memory.write({ name: 'x', description: '', body: ' ', visibility: 'owner' })).toBeUndefined()
    memory.write({ name: 'x', description: '', body: 'y', visibility: 'owner' })

    expect(memory.forget('X')).toBe(true)
    expect(memory.forget('x')).toBe(false)
    expect(memoryName('  我的 猫咪！ ')).toBe('我的-猫咪')
  })
})
