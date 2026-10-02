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
    })

    expect(tool.function.name).toBe(PROPOSE_RECIPE_TOOL_NAME)
    expect(proposals).toEqual([{
      name: 'Summarize context',
      description: 'When the owner asks for a recap.',
      style: { kind: 'instructions', instructions: 'Collect the relevant turns, drop small talk, and list goals, decisions, and open questions.' },
      triggers: [{ kind: 'keyword', keywords: ['总结一下'] }],
    }])
    expect(result).toContain('waits for the owner\'s approval')
  })

  it('saves a choice decision with one action per answer', async () => {
    const { proposals } = await proposeWith({
      name: 'Owner energy',
      description: 'Adjusts replies to how the owner seems.',
      style: 'decision',
      question: 'How does the owner seem?',
      answerType: 'choice',
      answers: [
        { meaning: 'Tired', action: 'hint', hint: 'Keep it short.' },
        { meaning: 'Fine', action: 'reply' },
      ],
    })

    expect(proposals[0]?.style).toEqual({
      kind: 'decision',
      question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Fine' } },
      actions: { option_1: { kind: 'hint', text: 'Keep it short.' }, option_2: { kind: 'reply' } },
    })
  })

  it('explains what is missing instead of saving an incomplete recipe', async () => {
    expect((await proposeWith({ name: 'Empty', description: '', style: 'instructions' })).result).toBe('Recipe not saved: An instructions recipe needs instructions.')
    expect((await proposeWith({ name: 'Odd', description: '', style: 'decision', question: 'Yes?', answerType: 'noul', answers: [{ meaning: 'a', action: 'reply' }, { meaning: 'b', action: 'reply' }, { meaning: 'c', action: 'reply' }] })).result)
      .toBe('Recipe not saved: A yes-or-no decision needs exactly two answers, yes first.')
    expect((await proposeWith({ style: 'nonsense' })).proposals).toEqual([])
  })
})
