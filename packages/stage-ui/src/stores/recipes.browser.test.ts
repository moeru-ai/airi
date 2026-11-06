import localforage from 'localforage'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRecipesStore } from './recipes'

const records = localforage.createInstance({ name: 'airi-recipes', storeName: 'recipes' })
const stores: ReturnType<typeof createPinia>[] = []

/** Each store stands for one window. */
function createStore() {
  const pinia = createPinia()
  stores.push(pinia)
  return useRecipesStore(pinia)
}

describe('recipes store', () => {
  beforeEach(async () => {
    await records.clear()
    localStorage.removeItem('recipes/custom')
  })

  afterEach(async () => {
    for (const pinia of stores.splice(0))
      disposePinia(pinia)
    localStorage.removeItem('recipes/custom')
    await records.clear()
  })

  // A model proposal waits for the owner. After one approval it runs without asking again.
  it('keeps a model proposal unusable until the owner approves and enables it', async () => {
    const recipes = createStore()
    const proposal = await recipes.propose({ name: 'Game night', description: 'Starts a game.', instructions: 'Open the game.', keywords: ['想玩粥了'] })
    expect(recipes.usable.some(recipe => recipe.id === proposal.id)).toBe(false)

    await recipes.approve(proposal.id)
    await recipes.setEnabled(proposal.id, true)

    expect(recipes.usable.some(recipe => recipe.id === proposal.id)).toBe(true)
  })

  it('approves the owner own recipes as they are added', async () => {
    const recipes = createStore()
    await recipes.add({ name: 'Music', description: 'Plays music.', instructions: 'Play music.', keywords: [], enabled: true })

    expect(recipes.usable.map(recipe => recipe.name)).toEqual(['Music'])
  })

  // Editing changes what a recipe does, never who wrote it or whether the owner approved it.
  it('edits a recipe and keeps its source, switch, and approval', async () => {
    const recipes = createStore()
    const proposal = await recipes.propose({ name: 'Summaries', description: 'Recaps.', instructions: 'List goals.', keywords: [] })

    await recipes.update(proposal.id, { name: 'Recap', description: 'When the owner asks.', instructions: 'List goals and decisions.', keywords: ['总结'] })

    expect(recipes.recipes.find(recipe => recipe.id === proposal.id)).toEqual({
      id: proposal.id,
      name: 'Recap',
      description: 'When the owner asks.',
      instructions: 'List goals and decisions.',
      keywords: ['总结'],
      source: 'model',
      enabled: false,
      approved: false,
    })
  })

  // The editor stays open while the owner switches or approves the recipe, maybe in another window.
  it('keeps every field of changes that overlap, and never brings a removed recipe back', async () => {
    const chat = createStore()
    const settings = createStore()
    const proposal = await chat.propose({ name: 'Summaries', description: 'Recaps.', instructions: 'List goals.', keywords: [] })

    await Promise.all([
      settings.update(proposal.id, { name: 'Recap', description: 'When the owner asks.', instructions: 'List goals and decisions.', keywords: ['总结'] }),
      chat.approve(proposal.id),
      chat.setEnabled(proposal.id, true),
    ])

    await vi.waitFor(() => expect(settings.recipes.find(recipe => recipe.id === proposal.id)).toMatchObject({ name: 'Recap', approved: true, enabled: true }))

    await chat.remove(proposal.id)
    await settings.setEnabled(proposal.id, false)

    expect(await records.getItem(proposal.id)).toEqual({ id: proposal.id, updatedAt: expect.any(Number), deleted: true })
  })

  it('keeps the recipes across restarts and shows a change in every window', async () => {
    const chat = createStore()
    const settings = createStore()
    await settings.add({ name: 'Music', description: 'Plays music.', instructions: 'Play music.', keywords: [], enabled: true })
    const music = settings.recipes[0]!

    await vi.waitFor(() => expect(chat.usable.map(recipe => recipe.id)).toEqual([music.id]))
    const restarted = createStore()
    await vi.waitFor(() => expect(restarted.recipes.map(recipe => recipe.id)).toEqual([music.id]))

    await settings.remove(music.id)

    await vi.waitFor(() => expect(chat.recipes).toEqual([]))
    // The removal stays as a tombstone.
    expect(await records.getItem(music.id)).toEqual({ id: music.id, updatedAt: expect.any(Number), deleted: true })
  })

  it('moves the recipes from localStorage once, with their ids and order, before it is ready', async () => {
    const stored = [
      { id: 'user:b', name: 'Second added first', description: '', instructions: 'B.', keywords: [], source: 'user', enabled: true, approved: true },
      { id: 'model:a', name: 'Added later', description: '', instructions: 'A.', keywords: ['a'], source: 'model', enabled: false, approved: false },
    ]
    localStorage.setItem('recipes/custom', JSON.stringify(stored))

    const recipes = createStore()
    await recipes.ready()

    expect(recipes.recipes).toEqual(stored)
    expect(localStorage.getItem('recipes/custom')).toBeNull()
  })
})
