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

/** An automation input with one trigger. The other trigger fields are null, as strict function calling sends them. */
function automation(trigger: Record<string, unknown>) {
  return {
    triggers: [{ source: null, event: null, time: null, days: null, minutes: null, afterIdleMinutes: null, module: null, ...trigger }],
    conditions: [],
    cooldownMinutes: null,
  }
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
      automation: null,
      modelTimed: false,
    })

    expect(tool.function.name).toBe(PROPOSE_RECIPE_TOOL_NAME)
    expect(proposals).toEqual([{
      name: 'Summarize context',
      description: 'When the owner asks for a recap.',
      instructions: 'Collect the relevant turns, drop small talk, and list goals, decisions, and open questions.',
      triggers: [{ kind: 'keyword', keywords: ['总结一下'] }],
    }])
    expect(result).toContain('waits for the owner\'s approval')
  })

  it('explains what is missing instead of saving an incomplete recipe', async () => {
    const nulls = { instructions: null, keywords: null, question: null, answerType: null, answers: null, background: false, automation: null, modelTimed: false }
    expect((await proposeWith({ ...nulls, name: 'Empty', description: '', style: 'instructions' })).result).toBe('Recipe not saved: An instructions recipe needs instructions.')
    expect((await proposeWith({ ...nulls, name: 'Odd', description: '', style: 'decision', keywords: ['ok'], question: 'Yes?', answerType: 'noul', answers: [{ meaning: 'a', action: 'reply', hint: null }, { meaning: 'b', action: 'reply', hint: null }, { meaning: 'c', action: 'reply', hint: null }] })).result)
      .toBe('Recipe not saved: A yes-or-no decision needs exactly two answers, yes first.')
    expect((await proposeWith({ ...nulls, name: 'Spam', description: '', style: 'instructions', instructions: 'Say hi.', automation: automation({ source: 'clock', event: 'every', minutes: 0.5 }) })).result)
      .toBe('Recipe not saved: A clock every trigger needs whole minutes from 1 to 10080.')
    expect((await proposeWith({ ...nulls, name: 'Mixed', description: '', style: 'instructions', instructions: 'Remind the owner.', keywords: ['提醒'], automation: automation({ source: 'chat', event: 'idle', minutes: 10 }) })).result)
      .toBe('Recipe not saved: A recipe with an automation runs only on it, so it takes no keywords.')
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
      automation: null,
      modelTimed: false,
    }
    const { proposals } = await proposeWith(input)

    expect(proposals[0]?.decision).toEqual({
      question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Fine' } },
      actions: { option_1: { kind: 'hint', text: 'Keep it short.' }, option_2: { kind: 'reply' } },
    })
    expect(proposals[0]?.triggers).toEqual([{ kind: 'keyword', keywords: ['累'] }])
    expect((await proposeWith({ ...input, keywords: null })).result).toBe('Recipe not saved: A decision runs only after a keyword matches, so it needs keywords.')
  })

  // The owner can ask for a greeting after an hour away, but not in the middle of the night.
  it('saves an automation with its triggers, conditions, and cooldown', async () => {
    const { proposals } = await proposeWith({
      name: 'Welcome back',
      description: 'Greets the owner back at the computer.',
      style: 'instructions',
      instructions: 'Greet softly.',
      keywords: null,
      question: null,
      answerType: null,
      answers: null,
      background: false,
      modelTimed: false,
      automation: {
        ...automation({ source: 'mouse', event: 'active', afterIdleMinutes: 60 }),
        conditions: [{ kind: 'time', from: '08:00', to: '23:00', days: null, source: null, state: null, minutes: null }],
        cooldownMinutes: 120,
      },
    })

    expect(proposals[0]?.automation).toEqual({
      triggers: [{ source: 'mouse', event: 'active', afterIdleMinutes: 60 }],
      conditions: [{ kind: 'time', from: '08:00', to: '23:00' }],
      cooldownMinutes: 120,
    })
  })

  it('names what an automation misses, so the model can fix its call', async () => {
    const base = { name: 'Good morning', description: '', style: 'instructions', instructions: 'Say good morning.', keywords: null, question: null, answerType: null, answers: null, background: false, modelTimed: false }
    expect((await proposeWith({ ...base, automation: automation({ source: 'clock', event: 'at', time: '25:00', days: [1, 2, 3, 4, 5] }) })).result)
      .toBe('Recipe not saved: A clock trigger is at an HH:MM time or every some minutes.')
    expect((await proposeWith({ ...base, automation: automation({ source: 'module', event: 'observation' }) })).result)
      .toBe('Recipe not saved: A module trigger needs the module name.')
  })

  // A reminder that the owner can reuse: a keyword invokes it, and the model sets when it runs each time.
  it('saves a model-timed recipe behind its keywords, with no automation of its own', async () => {
    const base = { name: 'Remind me', description: 'Reminds the owner later.', style: 'instructions', instructions: 'Remind the owner of the note.', keywords: ['提醒我'], question: null, answerType: null, answers: null, background: false, automation: null, modelTimed: true }
    expect((await proposeWith(base)).proposals).toEqual([{
      name: 'Remind me',
      description: 'Reminds the owner later.',
      instructions: 'Remind the owner of the note.',
      triggers: [{ kind: 'keyword', keywords: ['提醒我'] }],
      modelTimed: true,
    }])
    expect((await proposeWith({ ...base, keywords: null })).result)
      .toBe('Recipe not saved: A modelTimed recipe needs keywords and no automation. You set when it runs each time a keyword invokes it.')
  })

  // A task with a result runs in the background. An automated recipe always runs in its own space, so it never sets the flag.
  it('marks a task as a background recipe, and never an automated recipe', async () => {
    const base = { name: 'Research', description: 'Researches a purchase.', style: 'instructions', instructions: 'Compare three options.', keywords: null, question: null, answerType: null, answers: null, background: true, modelTimed: false }
    expect((await proposeWith({ ...base, automation: null })).proposals[0]?.background).toBe(true)
    expect((await proposeWith({ ...base, automation: automation({ source: 'clock', event: 'every', minutes: 60 }) })).proposals[0]?.background).toBeUndefined()
  })

  // Strict function calling rejects a schema whose objects leave a property out of `required`.
  it('declares every property as required, with null for values that do not apply', async () => {
    const { tool } = await proposeWith({})
    const parameters = tool.function.parameters as { required: string[], properties: Record<string, unknown>, additionalProperties: boolean }

    expect(parameters.required.sort()).toEqual(Object.keys(parameters.properties).sort())
    expect(parameters.additionalProperties).toBe(false)
    const automationSchema = (parameters.properties.automation as { anyOf: Array<{ required?: string[], properties?: Record<string, unknown>, additionalProperties?: boolean }> }).anyOf[0]!
    expect(automationSchema.required?.sort()).toEqual(Object.keys(automationSchema.properties ?? {}).sort())
    expect(automationSchema.additionalProperties).toBe(false)
  })
})
