import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { memoryName, useMemoryStore } from './memory'

describe('memory store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps one entry per name in a scope and lists it in the index', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'Favorite Game', description: 'What the owner plays.', body: 'Porridge games.', scope: 'general' }, 'airi')
    memory.write({ name: 'favorite-game', description: 'What the owner plays now.', body: 'Minecraft.', scope: 'general' }, 'airi')

    expect(memory.entries.map(entry => entry.name)).toEqual(['favorite-game'])
    expect(memory.indexFor('airi')).toBe('General:\n- favorite-game: What the owner plays now.')
    expect(memory.read('Favorite Game', 'luna')?.body).toBe('Minecraft.')
  })

  // General memories reach every persona. A persona's own memories reach only that persona.
  it('gives each persona the general memories and its own', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.', scope: 'general' }, 'airi')
    memory.write({ name: 'channel-rules', description: 'Rules of the Discord channel.', body: 'No spoilers.', scope: 'persona' }, 'discord-host')

    expect(memory.indexFor('discord-host')).toBe('Your own:\n- channel-rules: Rules of the Discord channel.\nGeneral:\n- nickname: What the owner likes to be called.')
    expect(memory.indexFor('airi')).not.toContain('channel-rules')
    expect(memory.read('channel-rules', 'airi')).toBeUndefined()
    expect(memory.read('channel-rules', 'discord-host')?.body).toBe('No spoilers.')
  })

  it('prefers the persona own entry, forgets it first, and refuses an empty name or body', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'tone', description: '', body: 'Calm.', scope: 'general' }, 'airi')
    memory.write({ name: 'tone', description: '', body: 'Short sentences.', scope: 'persona' }, 'focus')

    expect(memory.read('tone', 'focus')?.body).toBe('Short sentences.')
    expect(memory.forget('tone', 'focus')).toBe(true)
    expect(memory.read('tone', 'focus')?.body).toBe('Calm.')
    expect(memory.write({ name: '!!', description: '', body: 'x', scope: 'general' }, 'airi')).toBeUndefined()
    expect(memory.write({ name: 'x', description: '', body: ' ', scope: 'general' }, 'airi')).toBeUndefined()
    expect(memoryName('  我的 猫咪！ ')).toBe('我的-猫咪')
  })
})
