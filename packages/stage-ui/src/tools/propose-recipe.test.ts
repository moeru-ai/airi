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
      autoRun: null,
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
      instructions: null,
      keywords: null,
      question: 'How does the owner seem?',
      answerType: 'choice',
      answers: [
        { meaning: 'Tired', action: 'hint', hint: 'Keep it short.' },
        { meaning: 'Fine', action: 'reply', hint: null },
      ],
      autoRun: null,
    })

    expect(proposals[0]?.style).toEqual({
      kind: 'decision',
      question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Fine' } },
      actions: { option_1: { kind: 'hint', text: 'Keep it short.' }, option_2: { kind: 'reply' } },
    })
  })

  it('explains what is missing instead of saving an incomplete recipe', async () => {
    const nulls = { instructions: null, keywords: null, question: null, answerType: null, answers: null, autoRun: null }
    expect((await proposeWith({ ...nulls, name: 'Empty', description: '', style: 'instructions' })).result).toBe('Recipe not saved: An instructions recipe needs instructions.')
    expect((await proposeWith({ ...nulls, name: 'Odd', description: '', style: 'decision', question: 'Yes?', answerType: 'noul', answers: [{ meaning: 'a', action: 'reply', hint: null }, { meaning: 'b', action: 'reply', hint: null }, { meaning: 'c', action: 'reply', hint: null }] })).result)
      .toBe('Recipe not saved: A yes-or-no decision needs exactly two answers, yes first.')
    expect((await proposeWith({ ...nulls, name: 'Spam', description: '', style: 'instructions', instructions: 'Say hi.', autoRun: { when: 'schedule', minutes: 0.5, source: null, gate: null } })).result)
      .toBe('Recipe not saved: autoRun minutes must be a whole number from 1 to 10080.')
    expect((await proposeWith({ style: 'nonsense' })).proposals).toEqual([])
  })

  // The owner can ask for a greeting after a silence. The recipe then starts on its own.
  it('saves an auto-run recipe with an idle trigger', async () => {
    const { proposals } = await proposeWith({
      name: 'Check in',
      description: 'Greets the owner after a long silence.',
      style: 'instructions',
      instructions: 'Greet softly. Late at night, only remind the owner to rest.',
      keywords: null,
      question: null,
      answerType: null,
      answers: null,
      autoRun: { when: 'idle', minutes: 60, source: null, gate: 'Is the owner likely still awake?' },
    })

    expect(proposals[0]?.triggers).toEqual([{ kind: 'idle', afterMinutes: 60 }])
    expect(proposals[0]?.gate).toBe('Is the owner likely still awake?')
  })

  it('saves an event trigger on a registered source, and refuses one without a source', async () => {
    const base = { name: 'Game watch', description: '', style: 'instructions', instructions: 'Comment on the game.', keywords: null, question: null, answerType: null, answers: null }
    expect((await proposeWith({ ...base, autoRun: { when: 'event', minutes: 10, source: 'minecraft', gate: null } })).proposals[0]?.triggers)
      .toEqual([{ kind: 'event', source: 'minecraft', cooldownMinutes: 10 }])
    expect((await proposeWith({ ...base, autoRun: { when: 'event', minutes: 10, source: null, gate: null } })).result).toBe('Recipe not saved: An event trigger needs its source.')
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every property as required, with null for values that do not apply', async () => {
    const { tool } = await proposeWith({})
    const parameters = tool.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }
    const answerItems = (parameters.properties.answers as { anyOf: Array<{ items?: { required: string[], properties: Record<string, unknown> } }> }).anyOf[0]!.items!

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
    expect(answerItems.required.sort()).toEqual(Object.keys(answerItems.properties).sort())
    const autoRun = (parameters.properties.autoRun as { anyOf: Array<{ required?: string[], properties?: Record<string, unknown>, additionalProperties?: boolean }> }).anyOf[0]!
    expect(autoRun.required?.sort()).toEqual(Object.keys(autoRun.properties ?? {}).sort())
    expect(autoRun.additionalProperties).toBe(false)
  })
})
