import { STAY_QUIET_RECIPE_ID } from '@proj-airi/core-agent'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRecipesStore } from './recipes'

describe('recipes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with read-without-replying usable, and lets the owner turn it off', () => {
    const recipes = useRecipesStore()
    expect(recipes.isUsable(STAY_QUIET_RECIPE_ID)).toBe(true)

    recipes.setEnabled(STAY_QUIET_RECIPE_ID, false)

    expect(recipes.isUsable(STAY_QUIET_RECIPE_ID)).toBe(false)
  })

  // A model proposal waits for the owner. After one approval it runs without asking again.
  it('keeps a model proposal unusable until the owner approves and enables it', () => {
    const recipes = useRecipesStore()
    const proposal = recipes.propose({ name: 'Game night', description: 'Starts a game.', style: { kind: 'run', instructions: 'Open the game.' }, triggers: [{ kind: 'keyword', keywords: ['想玩粥了'] }] })
    expect(recipes.isUsable(proposal.id)).toBe(false)

    recipes.approve(proposal.id)
    recipes.setEnabled(proposal.id, true)

    expect(recipes.isUsable(proposal.id)).toBe(true)
  })

  it('approves the owner own recipes as they are added', () => {
    const recipes = useRecipesStore()
    recipes.add({ name: 'Music', description: 'Plays music.', style: { kind: 'mcp', server: 'music', tool: 'play' }, triggers: [], enabled: true })

    expect(recipes.usable.map(recipe => recipe.name)).toEqual(['Read without replying', 'Music'])
  })
})
