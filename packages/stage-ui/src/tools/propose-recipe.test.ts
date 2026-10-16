import type { Recipe } from '@proj-airi/core-agent'

import { describe, expect, it, vi } from 'vitest'

import { createProposeRecipeTool, PROPOSE_RECIPE_TOOL_NAME } from './propose-recipe'

async function proposeWith(input: unknown) {
  const proposals: Array<Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>> = []
  const propose = vi.fn((recipe: Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>): Recipe => {
    proposals.push(recipe)
    return { ...recipe, id: 'model:1', source: 'model', approved: false, enabled: false }
  })
  const [tool] = await createProposeRecipeTool({ propose })
  const result = await tool!.execute(input, { messages: [], toolCallId: 'call' })
  return { result: String(result), proposals, tool: tool! }
}

describe('recipe proposal tool', () => {
  it('saves an instruction recipe with its keywords, pending approval', async () => {
    const { result, proposals, tool } = await proposeWith({
      name: 'Summarize context',
      description: 'When the owner asks for a recap.',
      style: 'instructions',
      instructions: 'Collect the relevant turns, drop small talk, and list goals, decisions, and open questions.',
      keywords: ['总结一下'],
      question: null,
      answerType: null,
      answers: null,
      background: false,
    })

    expect(tool.function.name).toBe(PROPOSE_RECIPE_TOOL_NAME)
    expect(proposals).toEqual([{
      name: 'Summarize context',
      description: 'When the owner asks for a recap.',
      instructions: 'Collect the relevant turns, drop small talk, and list goals, decisions, and open questions.',
      keywords: ['总结一下'],
    }])
    expect(result).toContain('waits for the owner\'s approval')
  })

  it('explains what is missing instead of saving an incomplete recipe', async () => {
    const nulls = { instructions: null, keywords: null, question: null, answerType: null, answers: null, background: false }
    expect((await proposeWith({ ...nulls, name: 'Empty', description: '', style: 'instructions' })).result).toBe('Recipe not saved: An instructions recipe needs instructions.')
    expect((await proposeWith({ ...nulls, name: 'Odd', description: '', style: 'decision', keywords: ['ok'], question: 'Yes?', answerType: 'noul', answers: [{ meaning: 'a', action: 'reply', hint: null }, { meaning: 'b', action: 'reply', hint: null }, { meaning: 'c', action: 'reply', hint: null }] })).result)
      .toBe('Recipe not saved: A yes-or-no decision needs exactly two answers, yes first.')
    // A model once sent the string "null" and left fields out. A bare schema error made it retry nine times.
    const broken = await proposeWith({ ...nulls, name: 'Broken', description: '', style: 'instructions', instructions: 'Say hi.', answerType: 'null', question: undefined })
    expect(broken.proposals).toEqual([])
    expect(broken.result).toContain('→ at answerType')
    expect(broken.result).toContain('→ at question')
  })

  // A decision runs only after a keyword matches, so one without keywords is refused.
  it('saves a choice decision behind its keywords, with one action per answer', async () => {
    const input = {
      name: 'Owner energy',
      description: 'Adjusts replies to how the owner seems.',
      style: 'decision',
      instructions: null,
      keywords: ['累'],
      question: 'How does the owner seem?',
      answerType: 'choice',
      answers: [
        { meaning: 'Tired', action: 'hint', hint: 'Keep it short.' },
        { meaning: 'Fine', action: 'reply', hint: null },
      ],
      background: false,
    }
    const { proposals } = await proposeWith(input)

    expect(proposals[0]?.decision).toEqual({
      question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Fine' } },
      actions: { option_1: { kind: 'hint', text: 'Keep it short.' } },
    })
    expect(proposals[0]?.keywords).toEqual(['累'])
    expect((await proposeWith({ ...input, keywords: null })).result).toBe('Recipe not saved: A decision runs only after a keyword matches, so it needs keywords.')
  })

  // A task with a result runs in the background.
  it('marks a task as a background recipe', async () => {
    const base = { name: 'Research', description: 'Researches a purchase.', style: 'instructions', instructions: 'Compare three options.', keywords: null, question: null, answerType: null, answers: null, background: true }
    expect((await proposeWith(base)).proposals[0]?.background).toBe(true)
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every property as required, with null for values that do not apply', async () => {
    const { tool } = await proposeWith({})
    const parameters = tool.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
  })
})
