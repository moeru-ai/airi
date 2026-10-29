import localforage from 'localforage'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMemoryStore } from './memory'

const records = localforage.createInstance({ name: 'airi-memory', storeName: 'entries' })
const stores: ReturnType<typeof createPinia>[] = []

/** Each store stands for one window. */
function createStore() {
  const pinia = createPinia()
  stores.push(pinia)
  return useMemoryStore(pinia)
}

describe('memory store', () => {
  beforeEach(async () => {
    await records.clear()
    localStorage.removeItem('memory/entries')
    // The entries are in the order of their changes, so each change gets its own time.
    let now = 1
    vi.spyOn(Date, 'now').mockImplementation(() => now++)
  })

  afterEach(async () => {
    for (const pinia of stores.splice(0))
      disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.removeItem('memory/entries')
    await records.clear()
  })

  it('gives each new fact its own id, changes an entry by its id, and lists it in the index', async () => {
    const memory = createStore()
    const game = (await memory.write({ description: 'What the owner plays.', body: 'Porridge games.' }, 'airi'))!
    // Two facts with the same index line stay two entries.
    const other = (await memory.write({ description: 'What the owner plays.', body: 'Puzzle games on the train.' }, 'airi'))!
    await memory.write({ id: game.id, description: 'What the owner plays now.', body: 'Minecraft.' }, 'airi')

    expect(other.id).not.toBe(game.id)
    expect(memory.entries).toHaveLength(2)
    expect(memory.read(game.id, 'airi')?.body).toBe('Minecraft.')
    expect(memory.indexFor('airi')).toBe(`Your own:\n- ${other.id}: What the owner plays.\n- ${game.id}: What the owner plays now.`)
  })

  // A card keeps its own memories. Only the owner makes one general, and then every card reads it.
  it('keeps memories on their card until the owner makes one general', async () => {
    const memory = createStore()
    const nickname = (await memory.write({ description: 'What the owner likes to be called.', body: 'Yumeka.' }, 'airi'))!
    const rules = (await memory.write({ description: 'Rules of the Discord channel.', body: 'No spoilers.' }, 'discord-host'))!

    expect(memory.indexFor('discord-host')).toBe(`Your own:\n- ${rules.id}: Rules of the Discord channel.`)
    expect(memory.read(nickname.id, 'discord-host')).toBeUndefined()

    await memory.makeGeneral(nickname)

    expect(memory.indexFor('discord-host')).toBe(`Your own:\n- ${rules.id}: Rules of the Discord channel.\nGeneral:\n- ${nickname.id}: What the owner likes to be called.`)
    expect(memory.read(nickname.id, 'discord-host')?.body).toBe('Yumeka.')
    expect(memory.entries.find(entry => entry.id === nickname.id)?.persona).toBeUndefined()
  })

  it('replaces the tidied entries and keeps one saved during the tidy-up', async () => {
    const memory = createStore()
    const computer = (await memory.write({ description: 'Uses an M1 Pro', body: 'Still uses an M1 Pro.' }, 'airi'))!
    const old = (await memory.write({ description: 'Has not changed computers for long', body: 'Has not changed computers for a long time.' }, 'airi'))!
    const replaced = [computer.id, old.id]
    const saved = (await memory.write({ description: 'Lives in Bangkok', body: 'Has lived in Bangkok for years.' }, 'airi'))!

    await memory.consolidate('airi', replaced, [{ ids: [computer.id, old.id], description: 'Still on an M1 Pro', body: 'Has used an M1 Pro for a long time.' }])

    expect(memory.indexFor('airi')).toBe(`Your own:\n- ${saved.id}: Lives in Bangkok\n- ${computer.id}: Still on an M1 Pro`)
  })

  it('changes and forgets only the card own entries, and refuses an empty body', async () => {
    const memory = createStore()
    const tone = (await memory.write({ description: '', body: 'Calm.' }, 'airi'))!
    await memory.makeGeneral(tone)
    // A general memory belongs to the owner, so a write with its id adds the card's own entry.
    const own = (await memory.write({ id: tone.id, description: '', body: 'Short sentences.' }, 'focus'))!

    expect(own.id).not.toBe(tone.id)
    expect(memory.read(tone.id, 'focus')?.body).toBe('Calm.')
    expect(await memory.forget(own.id, 'focus')).toBe(true)
    // A run cannot forget a general memory either.
    expect(await memory.forget(tone.id, 'focus')).toBe(false)
    expect(await memory.write({ description: '', body: ' ' }, 'airi')).toBeUndefined()
  })

  it('keeps the entries across restarts and shows a change in every window', async () => {
    const chat = createStore()
    const settings = createStore()
    const nickname = (await chat.write({ description: 'What the owner likes to be called.', body: 'Yumeka.' }, 'airi'))!

    await vi.waitFor(() => expect(settings.read(nickname.id, 'airi')?.body).toBe('Yumeka.'))
    const restarted = createStore()
    await vi.waitFor(() => expect(restarted.read(nickname.id, 'airi')?.body).toBe('Yumeka.'))

    await settings.remove(nickname)

    await vi.waitFor(() => expect(chat.entries).toEqual([]))
    // The removal stays as a tombstone.
    expect(await records.getItem(nickname.id)).toEqual({ id: nickname.id, updatedAt: expect.any(Number), deleted: true })
  })

  it('moves the entries from localStorage once, with new ids', async () => {
    localStorage.setItem('memory/entries', JSON.stringify([
      { name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.', persona: 'airi', updatedAt: 10 },
      { name: 'tone', description: 'How to answer.', body: 'Calm.', updatedAt: 20 },
    ]))

    const memory = createStore()

    await vi.waitFor(() => expect(memory.entries).toHaveLength(2))
    expect(memory.entries).toEqual([
      { id: expect.any(String), description: 'What the owner likes to be called.', body: 'Yumeka.', persona: 'airi', updatedAt: 10 },
      { id: expect.any(String), description: 'How to answer.', body: 'Calm.', persona: undefined, updatedAt: 20 },
    ])
    expect(localStorage.getItem('memory/entries')).toBeNull()
  })
})
