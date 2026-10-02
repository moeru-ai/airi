import type { Recipe } from './recipe'

import { describe, expect, it } from 'vitest'

import { applyRecipeDecisions, BUILTIN_RECIPES, decisionAnswerKey, decisionRecipes, matchKeywordRecipes, recipeDecisionRequest, recipeTools, STAY_QUIET_RECIPE_ID, usableRecipes } from './recipe'

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

  describe('decision recipes', () => {
    const ack = recipe({ id: 'user:ack', name: 'Acknowledgements', style: { kind: 'decision', question: { type: 'noul', instructions: 'Is this only an acknowledgement?', criteria: { true: 'It needs no answer.', false: 'It asks something.' } }, actions: { true: { kind: 'stay-quiet' } } }, triggers: [] })
    const mood = recipe({
      id: 'user:mood',
      name: 'Owner mood',
      style: {
        kind: 'decision',
        question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { tired: 'Tired', excited: 'Excited', neutral: 'Neutral' } },
        actions: { tired: { kind: 'hint', text: 'The owner seems tired. Keep it short.' }, excited: { kind: 'recipe', recipeId: 'user:play' }, neutral: { kind: 'reply' } },
      },
      triggers: [],
    })
    const urgency = recipe({ id: 'user:urgency', style: { kind: 'decision', question: { type: 'score', instructions: 'How urgent?', criteria: ['Low', 'Medium', 'High'] }, actions: { 2: { kind: 'hint', text: 'Answer first, chat later.' } } }, triggers: [] })

    it('asks every decision recipe in one request, with any question type', () => {
      const request = recipeDecisionRequest(decisionRecipes([ack, mood, urgency, recipe({})]), 'ok')

      expect(Object.keys(request.questions)).toEqual(['user:ack', 'user:mood', 'user:urgency'])
      expect(request.questions['user:mood']?.type).toBe('choice')
      expect(request.untrusted).toBe('ok')
    })

    it('keys a confident answer by its type, and an unsure answer by nothing', () => {
      expect(decisionAnswerKey({ type: 'noul', noul: 0.95 }, 0.8)).toBe('true')
      expect(decisionAnswerKey({ type: 'noul', noul: 0.7 }, 0.8)).toBeUndefined()
      expect(decisionAnswerKey({ type: 'choice', choice: 'tired', confidence: 0.9 }, 0.8)).toBe('tired')
      expect(decisionAnswerKey({ type: 'score', score: 1.7, confidence: 0.9 }, 0.8)).toBe('2')
      expect(decisionAnswerKey({ type: 'score', score: 1.7, confidence: 0.5 }, 0.8)).toBeUndefined()
    })

    it('applies the action of each confident answer, and silence wins', () => {
      const outcome = applyRecipeDecisions([mood, urgency], {
        'user:mood': { type: 'choice', choice: 'tired', confidence: 0.9 },
        'user:urgency': { type: 'score', score: 2, confidence: 0.85 },
      }, 0.8)
      expect(outcome).toEqual({ hints: ['The owner seems tired. Keep it short.', 'Answer first, chat later.'], recipeIds: [], applied: ['Owner mood', 'Play a game'] })

      expect(applyRecipeDecisions([ack, mood], { 'user:ack': { type: 'noul', noul: 0.97 }, 'user:mood': { type: 'choice', choice: 'excited', confidence: 0.9 } }, 0.8))
        .toEqual({ silent: { reason: 'Acknowledgements' }, hints: [], recipeIds: ['user:play'], applied: ['Acknowledgements', 'Owner mood'] })
      expect(applyRecipeDecisions([ack], undefined, 0.8)).toEqual({ hints: [], recipeIds: [], applied: [] })
      // A reply answer changes nothing, so the reply does not name its recipe.
      expect(applyRecipeDecisions([mood], { 'user:mood': { type: 'choice', choice: 'neutral', confidence: 0.9 } }, 0.8).applied).toEqual([])
    })
  })
})
