import type { Recipe } from '@proj-airi/core-agent'

import { describe, expect, it } from 'vitest'

import { createUseRecipeTool, describeRecipesForRun, readRecipeUse, resolveRecipeUse, USE_RECIPE_TOOL_NAME } from './use-recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'model:adhd',
    name: 'i-have-adhd',
    description: 'ADHD-friendly answers.',
    style: { kind: 'instructions', instructions: 'Start with the next step.' },
    triggers: [],
    source: 'model',
    enabled: true,
    approved: true,
    ...overrides,
  }
}

const quiet = recipe({ id: 'builtin:stay-quiet', name: 'Read without replying', style: { kind: 'instructions', instructions: '' }, source: 'builtin' })
const decision = recipe({ id: 'user:ack', name: 'Acknowledgements', style: { kind: 'decision', question: { type: 'noul', instructions: 'Only thanks?', criteria: { true: 'Yes', false: 'No' } }, actions: {} } })

describe('recipe use tool', () => {
  it('returns the steps of a usable recipe, matched by name without letter case', async () => {
    const [tool] = await createUseRecipeTool({ recipes: () => [recipe({})] })
    const result = JSON.parse(String(await tool!.execute({ name: 'I-Have-ADHD ' }, { messages: [], toolCallId: 'call' })))

    expect(tool!.function.name).toBe(USE_RECIPE_TOOL_NAME)
    expect(result).toEqual({ status: 'used', name: 'i-have-adhd', steps: 'Start with the next step.' })
  })

  // The model must learn the real state, not guess from an older proposal message.
  it('tells the model when a recipe waits, is off, or does not exist', () => {
    expect(resolveRecipeUse([recipe({ approved: false, enabled: false })], 'i-have-adhd')).toEqual({ status: 'pending', name: 'i-have-adhd', usable: [] })
    expect(resolveRecipeUse([recipe({ enabled: false })], 'i-have-adhd')).toEqual({ status: 'disabled', name: 'i-have-adhd', usable: [] })
    expect(resolveRecipeUse([recipe({}), quiet], 'Read without replying')).toEqual({ status: 'unknown', name: 'Read without replying', usable: ['i-have-adhd'] })
  })

  it('lists usable recipes, self-running decisions, and waiting proposals as the current state', () => {
    const prompt = describeRecipesForRun([recipe({}), quiet, decision, recipe({ id: 'model:new', name: 'Summaries', approved: false, enabled: false })])

    expect(prompt).toContain('- i-have-adhd: ADHD-friendly answers.')
    expect(prompt).not.toContain('Read without replying')
    expect(prompt).not.toContain('Start with the next step.')
    expect(prompt).toContain('run by themselves before you reply: Acknowledgements.')
    expect(prompt).toContain('wait for the owner\'s approval, so you cannot use them yet: Summaries.')
    expect(prompt).toContain('overrides earlier messages about approval')
    expect(describeRecipesForRun([])).toContain('You have no usable recipes now.')
  })
  it('reads a recorded call for the chat, before and after its result', () => {
    expect(readRecipeUse('{"name":"i-have-adhd"}', undefined)).toEqual({ name: 'i-have-adhd', outcome: undefined })
    expect(readRecipeUse('{"name":"adhd"}', JSON.stringify({ status: 'used', name: 'i-have-adhd', steps: 'Start.' })))
      .toEqual({ name: 'i-have-adhd', outcome: { status: 'used', name: 'i-have-adhd', steps: 'Start.' } })
    expect(readRecipeUse('{"name', 'not json')).toEqual({ name: '', outcome: undefined })
  })
})
