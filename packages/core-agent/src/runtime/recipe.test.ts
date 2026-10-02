import type { Recipe } from './recipe'

import { describe, expect, it } from 'vitest'

import { applyRecipeDecisions, BUILTIN_RECIPES, decisionAnswerKey, decisionRecipes, dueTriggeredRecipes, isAutoRunRecipe, matchKeywordRecipes, passGates, recipeDecisionRequest, recipeGateRequest, recipeTools, STAY_QUIET_RECIPE_ID, usableRecipes } from './recipe'

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
  // Every auto-run recipe is the owner's own. No built-in recipe runs on a trigger.
  it('offers only read-without-replying as a built-in recipe', () => {
    expect(usableRecipes(BUILTIN_RECIPES).map(entry => entry.id)).toEqual([STAY_QUIET_RECIPE_ID])
    expect(BUILTIN_RECIPES.filter(isAutoRunRecipe)).toEqual([])
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
  describe('auto-run triggers', () => {
    const minute = 60_000
    const greet = recipe({ id: 'user:greet', style: { kind: 'instructions', instructions: 'Greet the owner softly.' }, triggers: [{ kind: 'idle', afterMinutes: 30 }] })
    const hourly = recipe({ id: 'user:hourly', style: { kind: 'instructions', instructions: 'Check the weather.' }, triggers: [{ kind: 'schedule', everyMinutes: 60 }] })
    const due = (state: { now: number, lastOwnerMessageAt?: number, firedAt?: Record<string, number> }) =>
      dueTriggeredRecipes([greet, hourly], { startedAt: 0, firedAt: {}, ...state }).map(entry => entry.recipe.id)

    it('greets once per owner silence and waits for the owner before greeting again', () => {
      expect(due({ now: 29 * minute, lastOwnerMessageAt: 0 })).toEqual([])
      expect(due({ now: 30 * minute, lastOwnerMessageAt: 0 })).toEqual(['user:greet'])
      expect(due({ now: 90 * minute, lastOwnerMessageAt: 0, firedAt: { 'user:greet': 30 * minute, 'user:hourly': 60 * minute } })).toEqual([])
      expect(due({ now: 130 * minute, lastOwnerMessageAt: 100 * minute, firedAt: { 'user:greet': 30 * minute, 'user:hourly': 120 * minute } })).toEqual(['user:greet'])
    })

    it('runs a schedule each period, counted from start or the last run', () => {
      expect(due({ now: 60 * minute, lastOwnerMessageAt: 59 * minute })).toEqual(['user:hourly'])
      expect(due({ now: 100 * minute, lastOwnerMessageAt: 99 * minute, firedAt: { 'user:hourly': 60 * minute } })).toEqual([])
    })

    it('skips recipes that are off, unapproved, keyword-only, or without steps', () => {
      const recipes = [{ ...greet, enabled: false }, { ...greet, id: 'model:x', approved: false }, recipe({}), { ...greet, id: 'user:empty', style: { kind: 'instructions' as const, instructions: ' ' } }]
      expect(dueTriggeredRecipes(recipes, { now: 1_000 * minute, startedAt: 0, firedAt: {} })).toEqual([])
    })

    // An event trigger follows a registered source, such as a module's pointer or metric slot, and its cooldown limits a busy source.
    it('fires an event trigger on a newer observation from its source, once per cooldown', () => {
      const pointer = recipe({ id: 'user:pointer', style: { kind: 'instructions', instructions: 'Notice where the owner works.' }, triggers: [{ kind: 'event', source: 'desktop:pointer', cooldownMinutes: 10 }] })
      const due = (now: number, observedAt: number, firedAt?: number) =>
        dueTriggeredRecipes([pointer], { now, startedAt: 0, firedAt: firedAt === undefined ? {} : { 'user:pointer': firedAt }, observations: { 'desktop:pointer': { createdAt: observedAt, text: 'Pointer over the code editor.' } } })

      expect(due(minute, 30_000)).toEqual([{ recipe: pointer, trigger: pointer.triggers[0], observation: { source: 'desktop:pointer', text: 'Pointer over the code editor.' } }])
      // A newer observation inside the cooldown waits. After the cooldown it fires once.
      expect(due(5 * minute, 4 * minute, minute)).toEqual([])
      expect(due(11 * minute, 4 * minute, minute)).toHaveLength(1)
      // Nothing new since the last start: no run.
      expect(due(30 * minute, 4 * minute, 11 * minute)).toEqual([])
      // Observations from before the scheduler started never fire.
      expect(dueTriggeredRecipes([pointer], { now: 2 * minute, startedAt: minute, firedAt: {}, observations: { 'desktop:pointer': { createdAt: 30_000, text: 'old' } } })).toEqual([])
    })

    // A gate is a nested decision: the classifier answers whether a due recipe should run, so a needless run costs no reply.
    it('asks the gate of each due recipe once, and runs only on a confident yes', () => {
      const lateNight = { ...greet, gate: 'Is it late at night?' }
      const request = recipeGateRequest([lateNight, hourly], 'Local time: 23:40.')

      expect(Object.keys(request.questions)).toEqual(['user:greet'])
      expect(request.state.scene).toBe('Local time: 23:40.')
      expect(passGates([lateNight, hourly], { 'user:greet': { type: 'noul', noul: 0.95 } }, 0.8).map(entry => entry.id)).toEqual(['user:greet', 'user:hourly'])
      expect(passGates([lateNight, hourly], { 'user:greet': { type: 'noul', noul: 0.6 } }, 0.8).map(entry => entry.id)).toEqual(['user:hourly'])
      expect(passGates([lateNight, hourly], { 'user:greet': { type: 'noul', noul: 0.05 } }, 0.8).map(entry => entry.id)).toEqual(['user:hourly'])
      // Without a classifier the owner's trigger stands.
      expect(passGates([lateNight], undefined, 0.8).map(entry => entry.id)).toEqual(['user:greet'])
    })
  })
})
