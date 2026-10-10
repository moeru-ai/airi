import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { memoryName, useMemoryStore } from './memory'

describe('memory store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps one entry per name on a card and lists it in the index', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'Favorite Game', description: 'What the owner plays.', body: 'Porridge games.' }, 'airi')
    memory.write({ name: 'favorite-game', description: 'What the owner plays now.', body: 'Minecraft.' }, 'airi')

    expect(memory.entries.map(entry => entry.name)).toEqual(['favorite-game'])
    expect(memory.indexFor('airi')).toBe('Your own:\n- favorite-game: What the owner plays now.')
    expect(memory.read('Favorite Game', 'airi')?.body).toBe('Minecraft.')
  })

  // A card keeps its own memories. Only the owner makes one general, and then every card reads it.
  it('keeps memories on their card until the owner makes one general', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.' }, 'airi')
    memory.write({ name: 'channel-rules', description: 'Rules of the Discord channel.', body: 'No spoilers.' }, 'discord-host')

    expect(memory.indexFor('discord-host')).toBe('Your own:\n- channel-rules: Rules of the Discord channel.')
    expect(memory.read('nickname', 'discord-host')).toBeUndefined()

    memory.makeGeneral({ name: 'nickname', persona: 'airi' })

    expect(memory.indexFor('discord-host')).toBe('Your own:\n- channel-rules: Rules of the Discord channel.\nGeneral:\n- nickname: What the owner likes to be called.')
    expect(memory.read('nickname', 'discord-host')?.body).toBe('Yumeka.')
    expect(memory.entries.filter(entry => entry.name === 'nickname').map(entry => entry.persona)).toEqual([undefined])
  })

  it('prefers the card own entry, forgets only its own, and refuses an empty name or body', () => {
    const memory = useMemoryStore()
    memory.write({ name: 'tone', description: '', body: 'Calm.' }, 'airi')
    memory.makeGeneral({ name: 'tone', persona: 'airi' })
    memory.write({ name: 'tone', description: '', body: 'Short sentences.' }, 'focus')

    expect(memory.read('tone', 'focus')?.body).toBe('Short sentences.')
    expect(memory.forget('tone', 'focus')).toBe(true)
    expect(memory.read('tone', 'focus')?.body).toBe('Calm.')
    // A general memory belongs to the owner, so a run cannot forget it.
    expect(memory.forget('tone', 'focus')).toBe(false)
    expect(memory.write({ name: '!!', description: '', body: 'x' }, 'airi')).toBeUndefined()
    expect(memory.write({ name: 'x', description: '', body: ' ' }, 'airi')).toBeUndefined()
    expect(memoryName('  我的 猫咪！ ')).toBe('我的-猫咪')
  })

  // ROOT CAUSE:
  // The index listed every entry, so many memories grew every system prompt without a bound.
  it('lists the newest entries only and counts the rest', () => {
    const memory = useMemoryStore()
    for (let index = 0; index < 45; index++)
      memory.write({ name: `fact-${String(index).padStart(2, '0')}`, description: 'A fact.', body: 'x' }, 'airi')
    for (const [index, entry] of memory.entries.entries())
      entry.updatedAt = index

    const index = memory.indexFor('airi')

    expect(index.split('\n').filter(line => line.startsWith('- '))).toHaveLength(40)
    expect(index).toContain('- fact-44: A fact.')
    expect(index).not.toContain('- fact-00:')
    expect(index).toContain('5 older entries are not listed.')
  })
})
