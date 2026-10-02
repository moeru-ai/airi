import type { Recipe } from './recipe'

import { describe, expect, it } from 'vitest'

import { BUILTIN_RECIPES, matchKeywordRecipes, recipeTools, STAY_QUIET_RECIPE_ID, usableRecipes } from './recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'user:play',
    name: 'Play a game',
    description: 'Starts a game when the owner wants to play.',
    style: { kind: 'run', instructions: 'Open the requested game.', tools: ['launch_game', 'delete_files'] },
    triggers: [{ kind: 'keyword', keywords: ['想玩粥了'] }],
    source: 'user',
    enabled: true,
    approved: true,
    ...overrides,
  }
}

describe('recipes', () => {
  it('offers read-without-replying as an enabled built-in recipe', () => {
    expect(usableRecipes(BUILTIN_RECIPES).map(entry => entry.id)).toEqual([STAY_QUIET_RECIPE_ID])
  })

  // A recipe never grants itself a capability. It only narrows the tools the host granted.
  it('keeps only the tools that the host granted', () => {
    expect(recipeTools(recipe({}), ['launch_game'])).toEqual(['launch_game'])
  })

  // A model proposal waits for the owner's first approval. Disabled recipes never run.
  it('runs only enabled and approved recipes', () => {
    const proposals = [recipe({ id: 'model:new', source: 'model', approved: false }), recipe({ id: 'user:off', enabled: false }), recipe({})]

    expect(usableRecipes(proposals).map(entry => entry.id)).toEqual(['user:play'])
  })

  it('matches keyword triggers in the owner text, ignoring letter case', () => {
    const recipes = [recipe({}), recipe({ id: 'user:music', triggers: [{ kind: 'keyword', keywords: ['Play Music'] }] })]

    expect(matchKeywordRecipes(recipes, '今天想玩粥了').map(entry => entry.id)).toEqual(['user:play'])
    expect(matchKeywordRecipes(recipes, 'please play music').map(entry => entry.id)).toEqual(['user:music'])
    expect(matchKeywordRecipes(recipes, 'hello')).toEqual([])
  })
})
