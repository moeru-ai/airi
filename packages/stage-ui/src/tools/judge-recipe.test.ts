import type { Recipe } from '@proj-airi/core-agent'

import { describe, expect, it, vi } from 'vitest'

import { createJudgeRecipeTool, judgmentSkillText } from './judge-recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return { id: 'user:recipe', name: 'Recipe', description: '', instructions: '', keywords: ['烦'], source: 'user', enabled: true, approved: true, ...overrides }
}

const remind = recipe({ id: 'user:remind', name: 'Remind me', instructions: 'Remind the owner.', modelTimed: true })
const research = recipe({ id: 'user:research', name: 'Research', instructions: 'Compare options.', background: true })
const mood = recipe({
  id: 'user:mood',
  name: 'Mood',
  decision: {
    question: { type: 'choice', instructions: 'What is the owner doing?', criteria: { option_1: 'Watching a video', option_2: 'Coding' } },
    actions: { option_1: { kind: 'stay-quiet' }, option_2: { kind: 'recipe', recipeId: 'user:research' } },
  },
})
const annoyed = recipe({
  id: 'user:annoyed',
  name: 'Annoyed',
  decision: {
    question: { type: 'noul', instructions: 'Is the owner annoyed?', criteria: { true: 'Annoyed', false: 'Not annoyed' } },
    actions: { true: { kind: 'hint', text: 'Keep it short.' }, false: { kind: 'recipe', recipeId: 'user:mood' } },
  },
})
const later = recipe({
  id: 'user:later',
  name: 'Later',
  decision: {
    question: { type: 'noul', instructions: 'Does the owner want a reminder?', criteria: { true: 'Yes', false: 'No' } },
    actions: { true: { kind: 'recipe', recipeId: 'user:remind' } },
  },
})

async function judge(input: Record<string, unknown>) {
  const start = vi.fn(async () => ({ status: 'started' as const }))
  const [tool] = await createJudgeRecipeTool({ decisions: [annoyed, mood, later], recipes: [remind, research, mood, annoyed, later], start })
  const result = JSON.parse(String(await tool!.execute(input, { messages: [], toolCallId: 'call' })))
  return { result, start }
}

describe('judgment tool', () => {
  // The character judges without seeing what each answer leads to.
  it('gives only the question and the answers, never what follows them', () => {
    const text = judgmentSkillText(annoyed)

    expect(text).toContain('Is the owner annoyed?')
    expect(text).toContain('- yes: Annoyed')
    expect(text).toContain('- no: Not annoyed')
    expect(text).not.toContain('Keep it short.')
    expect(text).not.toContain('Mood')
  })

  // A judgment always commits to one answer, so the next step always follows the answer that the character picked.
  it('feeds the next step of the answer that the character picked', async () => {
    expect((await judge({ name: 'Annoyed', answer: 'yes' })).result).toEqual({ status: 'judged', name: 'Annoyed', answer: 'Annoyed', next: 'Reply, and keep this in mind: Keep it short.' })
    expect((await judge({ name: 'Later', answer: 'yes' })).result.next).toContain('Set when "Remind me" runs with builtIn_armRecipe')
    expect((await judge({ name: 'Later', answer: 'no' })).result.next).toBe('Reply as usual.')
  })

  // An answer can lead to another judgment, so decisions chain. A background recipe starts from code.
  it('chains into the next judgment, and starts a background recipe', async () => {
    const chained = (await judge({ name: 'Annoyed', answer: 'no' })).result.next as string
    expect(chained).toContain('What is the owner doing?')
    expect(chained).toContain('- 2: Coding')

    const { result, start } = await judge({ name: 'Mood', answer: '2' })
    expect(start).toHaveBeenCalledWith(research)
    expect(result.next).toContain('"Research" runs in the background')
    expect((await judge({ name: 'Mood', answer: '1' })).result.next).toBe('Do not reply to this message. End this turn with no text.')
  })

  it('names what a call got wrong, so the character can fix it', async () => {
    expect((await judge({ name: 'Annoyed', answer: 'maybe' })).result).toEqual({ status: 'invalid', reason: 'The answer must be one of: yes, no.' })
    expect((await judge({ name: 'Unknown', answer: 'yes' })).result.reason).toContain('No invoked decision recipe has that name.')
    expect((await judge({ name: 'Annoyed' })).result.reason).toContain('→ at answer')
  })
})
