import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useMemoryStore } from './memory'

describe('memory store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('gives each new fact its own id, changes an entry by its id, and lists it in the index', () => {
    const memory = useMemoryStore()
    const game = memory.write({ description: 'What the owner plays.', body: 'Porridge games.' }, 'airi')!
    // Two facts with the same index line stay two entries.
    const other = memory.write({ description: 'What the owner plays.', body: 'Puzzle games on the train.' }, 'airi')!
    memory.write({ id: game.id, description: 'What the owner plays now.', body: 'Minecraft.' }, 'airi')

    expect(other.id).not.toBe(game.id)
    expect(memory.entries).toHaveLength(2)
    expect(memory.read(game.id, 'airi')?.body).toBe('Minecraft.')
    expect(memory.indexFor('airi')).toBe(`Your own:\n- ${other.id}: What the owner plays.\n- ${game.id}: What the owner plays now.`)
  })

  // A card keeps its own memories. Only the owner makes one general, and then every card reads it.
  it('keeps memories on their card until the owner makes one general', () => {
    const memory = useMemoryStore()
    const nickname = memory.write({ description: 'What the owner likes to be called.', body: 'Yumeka.' }, 'airi')!
    const rules = memory.write({ description: 'Rules of the Discord channel.', body: 'No spoilers.' }, 'discord-host')!

    expect(memory.indexFor('discord-host')).toBe(`Your own:\n- ${rules.id}: Rules of the Discord channel.`)
    expect(memory.read(nickname.id, 'discord-host')).toBeUndefined()

    memory.makeGeneral(nickname)

    expect(memory.indexFor('discord-host')).toBe(`Your own:\n- ${rules.id}: Rules of the Discord channel.\nGeneral:\n- ${nickname.id}: What the owner likes to be called.`)
    expect(memory.read(nickname.id, 'discord-host')?.body).toBe('Yumeka.')
    expect(memory.entries.find(entry => entry.id === nickname.id)?.persona).toBeUndefined()
  })

  it('replaces the tidied entries and keeps one saved during the tidy-up', () => {
    const memory = useMemoryStore()
    const computer = memory.write({ description: 'Uses an M1 Pro', body: 'Still uses an M1 Pro.' }, 'airi')!
    const old = memory.write({ description: 'Has not changed computers for long', body: 'Has not changed computers for a long time.' }, 'airi')!
    const replaced = [computer.id, old.id]
    const saved = memory.write({ description: 'Lives in Bangkok', body: 'Has lived in Bangkok for years.' }, 'airi')!

    memory.consolidate('airi', replaced, [{ ids: [computer.id, old.id], description: 'Still on an M1 Pro', body: 'Has used an M1 Pro for a long time.' }])

    expect(memory.indexFor('airi')).toBe(`Your own:\n- ${saved.id}: Lives in Bangkok\n- ${computer.id}: Still on an M1 Pro`)
  })

  it('changes and forgets only the card own entries, and refuses an empty body', () => {
    const memory = useMemoryStore()
    const tone = memory.write({ description: '', body: 'Calm.' }, 'airi')!
    memory.makeGeneral(tone)
    // A general memory belongs to the owner, so a write with its id adds the card's own entry.
    const own = memory.write({ id: tone.id, description: '', body: 'Short sentences.' }, 'focus')!

    expect(own.id).not.toBe(tone.id)
    expect(memory.read(tone.id, 'focus')?.body).toBe('Calm.')
    expect(memory.forget(own.id, 'focus')).toBe(true)
    // A run cannot forget a general memory either.
    expect(memory.forget(tone.id, 'focus')).toBe(false)
    expect(memory.write({ description: '', body: ' ' }, 'airi')).toBeUndefined()
  })
})
