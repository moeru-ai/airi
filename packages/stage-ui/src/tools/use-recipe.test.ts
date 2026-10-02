import type { Recipe } from '@proj-airi/core-agent'

import type { StartRecipe } from './use-recipe'

import { describe, expect, it, vi } from 'vitest'

import { createUseRecipeTool, describeRecipesForRun, readRecipeUse, resolveRecipeUse, USE_RECIPE_TOOL_NAME } from './use-recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'user:research',
    name: 'Research',
    description: 'Researches a purchase.',
    style: { kind: 'instructions', instructions: 'Compare three options with prices.' },
    triggers: [],
    source: 'user',
    enabled: true,
    approved: true,
    ...overrides,
  }
}

const quiet = recipe({ id: 'builtin:stay-quiet', name: 'Read without replying', style: { kind: 'instructions', instructions: '' }, source: 'builtin' })
const decision = recipe({ id: 'user:ack', name: 'Acknowledgements', style: { kind: 'decision', question: { type: 'noul', instructions: 'Only thanks?', criteria: { true: 'Yes', false: 'No' } }, actions: {} } })

async function call(recipes: Recipe[], input: unknown, start: StartRecipe = async () => ({ status: 'started' })) {
  const startSpy = vi.fn(start)
  const [tool] = await createUseRecipeTool({ recipes: () => recipes, start: startSpy })
  return { result: JSON.parse(String(await tool!.execute(input, { messages: [], toolCallId: 'call' }))), start: startSpy, tool: tool! }
}

describe('recipe tool', () => {
  // A recipe runs in its own space. The conversation hands over a task and never receives the steps.
  it('hands a task to a usable recipe, matched by name without letter case', async () => {
    const { result, start, tool } = await call([recipe({})], { name: 'research ', task: 'A 3000 yuan PC build.' })

    expect(tool.function.name).toBe(USE_RECIPE_TOOL_NAME)
    expect(start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'user:research' }), 'A 3000 yuan PC build.')
    expect(result).toEqual({ status: 'started', name: 'Research', task: 'A 3000 yuan PC build.' })
    expect(JSON.stringify(result)).not.toContain('Compare three options')
  })

  it('reports a handover and a refusal from the scheduler', async () => {
    expect((await call([recipe({ handover: true })], { name: 'Research', task: '' }, async () => ({ status: 'switched' }))).result).toEqual({ status: 'switched', name: 'Research' })
    expect((await call([recipe({})], { name: 'Research', task: 'x' }, async () => ({ status: 'refused', reason: 'The parent run has too many derived runs' }))).result)
      .toEqual({ status: 'refused', name: 'Research', usable: [], reason: 'The parent run has too many derived runs' })
  })

  // The model must learn the real state, not guess from an older proposal message.
  it('tells the model when a recipe waits, is off, or does not exist, without starting it', async () => {
    expect(resolveRecipeUse([recipe({ approved: false, enabled: false })], 'Research')).toEqual({ status: 'pending', name: 'Research', usable: [] })
    expect(resolveRecipeUse([recipe({ enabled: false })], 'Research')).toEqual({ status: 'disabled', name: 'Research', usable: [] })
    const { result, start } = await call([recipe({}), quiet], { name: 'Read without replying', task: '' })
    expect(result).toEqual({ status: 'unknown', name: 'Read without replying', usable: ['Research'] })
    expect(start).not.toHaveBeenCalled()
  })

  it('lists startable recipes by purpose only, with decisions, auto-run recipes, and waiting proposals as the current state', () => {
    const greet = recipe({ id: 'user:greet', name: 'Check in', style: { kind: 'instructions', instructions: 'Greet softly.' }, triggers: [{ kind: 'idle', afterMinutes: 30 }] })
    const mode = recipe({ id: 'user:adhd', name: 'i-have-adhd', description: 'ADHD-friendly answers.', handover: true })
    const prompt = describeRecipesForRun([recipe({}), mode, quiet, decision, greet, recipe({ id: 'model:new', name: 'Summaries', approved: false, enabled: false })])

    expect(prompt).toContain('- Research: Researches a purchase.')
    expect(prompt).toContain('- i-have-adhd (handover): ADHD-friendly answers.')
    expect(prompt).not.toContain('Compare three options')
    expect(prompt).not.toContain('Read without replying')
    expect(prompt).toContain('run by themselves before you reply: Acknowledgements.')
    expect(prompt).toContain('start on their own when their trigger fires, for example after a silence: Check in.')
    expect(prompt).toContain('wait for the owner\'s approval, so you cannot start them yet: Summaries.')
    expect(prompt).toContain('overrides earlier messages about approval')
    expect(describeRecipesForRun([])).toContain('You have no recipes to start now.')
  })

  it('reads a recorded call for the chat, before and after its result', () => {
    expect(readRecipeUse('{"name":"Research","task":"PC build"}', undefined)).toEqual({ name: 'Research', task: 'PC build', outcome: undefined })
    expect(readRecipeUse('{"name":"research","task":"PC build"}', JSON.stringify({ status: 'started', name: 'Research', task: 'PC build' })))
      .toEqual({ name: 'Research', task: 'PC build', outcome: { status: 'started', name: 'Research', task: 'PC build' } })
    expect(readRecipeUse('{"name', 'not json')).toEqual({ name: '', task: '', outcome: undefined })
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every property as required', async () => {
    const { tool } = await call([], {})
    const parameters = tool.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
  })
})
