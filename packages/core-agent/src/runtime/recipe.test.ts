import type { Recipe, RecipeDecision } from './recipe'

import { describe, expect, it } from 'vitest'

import { decisionOptions, isBackgroundRecipe, judgeDecision, matchKeywordRecipes, usableRecipes } from './recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'user:play',
    name: 'Play a game',
    description: 'Starts a game when the owner wants to play.',
    instructions: 'Open the requested game.',
    keywords: ['想玩粥了'],
    source: 'user',
    enabled: true,
    approved: true,
    ...overrides,
  }
}

describe('recipes', () => {
  // A model proposal waits for the owner's first approval. Disabled recipes never run.
  it('runs only enabled and approved recipes', () => {
    const proposals = [recipe({ id: 'model:new', source: 'model', approved: false }), recipe({ id: 'user:off', enabled: false }), recipe({})]

    expect(usableRecipes(proposals).map(entry => entry.id)).toEqual(['user:play'])
  })

  it('matches keywords in the owner text, ignoring letter case', () => {
    const recipes = [
      recipe({}),
      recipe({ id: 'user:music', keywords: ['Play Music'] }),
      // A keyword once started an idle reminder at once, before its silence.
      recipe({ id: 'user:remind', keywords: ['提醒'], automation: { triggers: [{ source: 'chat', event: 'idle', minutes: 10 }], conditions: [] } }),
      // A keyword invokes a model-timed recipe, so the model can set when it runs.
      recipe({ id: 'user:later', keywords: ['待会'], modelTimed: true }),
    ]

    expect(matchKeywordRecipes(recipes, '今天想玩粥了').map(entry => entry.id)).toEqual(['user:play'])
    expect(matchKeywordRecipes(recipes, 'please play music').map(entry => entry.id)).toEqual(['user:music'])
    expect(matchKeywordRecipes(recipes, 'hello')).toEqual([])
    expect(matchKeywordRecipes(recipes, '十分钟后提醒我')).toEqual([])
    expect(matchKeywordRecipes(recipes, '待会叫我喝水').map(entry => entry.id)).toEqual(['user:later'])
  })

  // A recipe joins the conversation unless it runs a task with a result. An auto-run recipe has no message to join.
  it('runs a recipe in the background when it says so or starts on its own', () => {
    expect(isBackgroundRecipe(recipe({}))).toBe(false)
    expect(isBackgroundRecipe(recipe({ background: true }))).toBe(true)
    expect(isBackgroundRecipe(recipe({ automation: { triggers: [{ source: 'chat', event: 'idle', minutes: 30 }], conditions: [] } }))).toBe(true)
  })

  // The character only says which answer fits. Code picks what follows.
  describe('decisions', () => {
    const annoyed: RecipeDecision = {
      question: { type: 'noul', instructions: 'Is the owner annoyed?', criteria: { true: 'Annoyed', false: 'Not annoyed' } },
      actions: { true: { kind: 'stay-quiet' }, false: { kind: 'recipe', recipeId: 'user:remind' } },
    }

    it('numbers the answers of each question type in order', () => {
      expect(decisionOptions(annoyed.question).map(option => option.id)).toEqual(['yes', 'no'])
      expect(decisionOptions({ type: 'choice', instructions: 'Mood?', criteria: { option_1: 'Tired', option_2: 'Excited' } })).toEqual([
        { id: '1', key: 'option_1', meaning: 'Tired' },
        { id: '2', key: 'option_2', meaning: 'Excited' },
      ])
    })

    // A judgment always commits to one answer, so every answer leads to its action.
    it('runs the action of the answer that the character picked', () => {
      expect(judgeDecision(annoyed, 'yes')).toEqual({ option: { id: 'yes', key: 'true', meaning: 'Annoyed' }, action: { kind: 'stay-quiet' } })
      expect(judgeDecision(annoyed, 'no')).toMatchObject({ action: { kind: 'recipe', recipeId: 'user:remind' } })
    })

    it('names what an answer got wrong, so the character can fix its call', () => {
      expect(judgeDecision(annoyed, 'maybe')).toBe('The answer must be one of: yes, no.')
    })
  })
})
