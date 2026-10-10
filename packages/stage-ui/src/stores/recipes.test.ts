import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRecipesStore } from './recipes'

describe('recipes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // A model proposal waits for the owner. After one approval it runs without asking again.
  it('keeps a model proposal unusable until the owner approves and enables it', () => {
    const recipes = useRecipesStore()
    const proposal = recipes.propose({ name: 'Game night', description: 'Starts a game.', instructions: 'Open the game.', triggers: [{ kind: 'keyword', keywords: ['想玩粥了'] }] })
    expect(recipes.usable.some(recipe => recipe.id === proposal.id)).toBe(false)

    recipes.approve(proposal.id)
    recipes.setEnabled(proposal.id, true)

    expect(recipes.usable.some(recipe => recipe.id === proposal.id)).toBe(true)
  })

  it('approves the owner own recipes as they are added', () => {
    const recipes = useRecipesStore()
    recipes.add({ name: 'Music', description: 'Plays music.', instructions: 'Play music.', triggers: [], enabled: true })

    expect(recipes.usable.map(recipe => recipe.name)).toEqual(['Music'])
  })

  // Editing changes what a recipe does, never who wrote it or whether the owner approved it.
  it('edits a recipe and keeps its source, switch, and approval', () => {
    const recipes = useRecipesStore()
    const proposal = recipes.propose({ name: 'Summaries', description: 'Recaps.', instructions: 'List goals.', triggers: [] })

    recipes.update(proposal.id, { name: 'Recap', description: 'When the owner asks.', instructions: 'List goals and decisions.', triggers: [{ kind: 'keyword', keywords: ['总结'] }] })

    expect(recipes.recipes.find(recipe => recipe.id === proposal.id)).toEqual({
      id: proposal.id,
      name: 'Recap',
      description: 'When the owner asks.',
      instructions: 'List goals and decisions.',
      triggers: [{ kind: 'keyword', keywords: ['总结'] }],
      source: 'model',
      enabled: false,
      approved: false,
    })
  })
})
