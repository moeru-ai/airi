import type { Recipe } from '@proj-airi/core-agent'

import type { StartRecipe } from './use-recipe'

import { describe, expect, it, vi } from 'vitest'

import { createUseRecipeTool, describeRecipesForRun, readRecipeUse, resolveRecipeUse, USE_RECIPE_TOOL_NAME } from './use-recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'user:research',
    name: 'Research',
    description: 'Researches a purchase.',
    instructions: 'Compare three options with prices.',
    triggers: [],
    source: 'user',
    enabled: true,
    approved: true,
    ...overrides,
  }
}

const empty = recipe({ id: 'user:draft', name: 'Draft', instructions: '' })

async function call(recipes: Recipe[], input: unknown, start: StartRecipe = async () => ({ status: 'started' })) {
  const startSpy = vi.fn(start)
  const [tool] = await createUseRecipeTool({ recipes: () => recipes, start: startSpy })
  return { result: JSON.parse(String(await tool!.execute(input, { messages: [], toolCallId: 'call' }))), start: startSpy, tool: tool! }
}

describe('recipe tool', () => {
  // Like a skill in an agent, a recipe gives its steps to the conversation, which follows them itself.
  it('loads the steps of a usable recipe, matched by name without letter case', async () => {
    const { result, start, tool } = await call([recipe({})], { name: 'research ', task: '' })

    expect(tool.function.name).toBe(USE_RECIPE_TOOL_NAME)
    expect(start).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'loaded', name: 'Research', instructions: 'Compare three options with prices.' })
  })

  // A background recipe runs in its own space. The conversation hands over a task and never receives the steps.
  it('hands a task to a background recipe, and reports a refusal from the scheduler', async () => {
    const { result, start } = await call([recipe({ background: true })], { name: 'Research', task: 'A 3000 yuan PC build.' })

    expect(start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'user:research' }), 'A 3000 yuan PC build.')
    expect(result).toEqual({ status: 'started', name: 'Research', task: 'A 3000 yuan PC build.' })
    expect(JSON.stringify(result)).not.toContain('Compare three options')
    expect((await call([recipe({ background: true })], { name: 'Research', task: 'x' }, async () => ({ status: 'refused', reason: 'The recipe space could not open' }))).result)
      .toEqual({ status: 'refused', name: 'Research', usable: [], reason: 'The recipe space could not open' })
  })

  // The model must learn the real state, not guess from an older proposal message.
  it('tells the model when a recipe waits, is off, or does not exist, without starting it', async () => {
    expect(resolveRecipeUse([recipe({ approved: false, enabled: false })], 'Research')).toEqual({ status: 'pending', name: 'Research', usable: [] })
    expect(resolveRecipeUse([recipe({ enabled: false })], 'Research')).toEqual({ status: 'disabled', name: 'Research', usable: [] })
    const { result, start } = await call([recipe({}), empty], { name: 'Draft', task: '' })
    expect(result).toEqual({ status: 'unknown', name: 'Draft', usable: ['Research'] })
    expect(start).not.toHaveBeenCalled()
  })

  it('lists usable recipes by purpose only, with auto-run recipes, and waiting proposals as the current state', () => {
    const greet = recipe({ id: 'user:greet', name: 'Check in', instructions: 'Greet softly.', automation: { triggers: [{ source: 'chat', event: 'idle', minutes: 30 }], conditions: [] } })
    const prompt = describeRecipesForRun([recipe({}), recipe({ id: 'user:watch', name: 'Watch', description: 'Watches a page.', background: true }), empty, greet, recipe({ id: 'model:new', name: 'Summaries', approved: false, enabled: false })])

    expect(prompt).toContain('- Research: Researches a purchase.')
    expect(prompt).toContain('- Watch (background): Watches a page.')
    expect(prompt).not.toContain('Compare three options')
    expect(prompt).not.toContain('Draft')
    expect(prompt).toContain('start on their own when their trigger fires, for example after a silence: Check in.')
    expect(prompt).toContain('wait for the owner\'s approval, so you cannot start them yet: Summaries.')
    expect(prompt).toContain('overrides earlier messages about approval')
    expect(describeRecipesForRun([])).toContain('You have no recipes to use now.')
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
