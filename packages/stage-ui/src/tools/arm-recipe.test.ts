import type { Recipe } from '@proj-airi/core-agent'

import { describe, expect, it, vi } from 'vitest'

import { createArmRecipeTool } from './arm-recipe'

function recipe(overrides: Partial<Recipe>): Recipe {
  return { id: 'user:recipe', name: 'Recipe', description: '', instructions: '', keywords: ['提醒我'], source: 'user', enabled: true, approved: true, ...overrides }
}

const remind = recipe({ id: 'user:remind', name: 'Remind me', instructions: 'Remind the owner.', modelTimed: true })
const watch = recipe({ id: 'user:watch', name: 'Watch me', instructions: 'Look at the owner.', modelTimed: true })

const at = (time: string) => ({ source: 'clock', event: 'at', time, days: null, minutes: null, afterIdleMinutes: null, module: null })

function run(overrides: Record<string, unknown>) {
  return { name: 'Remind me', repeat: false, triggers: [at('15:00')], conditions: [], cooldownMinutes: null, note: 'Drink water.', ...overrides }
}

async function arm(runs: Record<string, unknown>[], propose: boolean | undefined = true) {
  const armed = vi.fn(async () => ({ status: 'armed' as const }))
  const proposed = vi.fn()
  const [tool] = await createArmRecipeTool({ recipes: [remind, watch], arm: armed, ...(propose ? { propose: proposed } : {}) })
  const result = String(await tool!.execute({ runs }, { messages: [], toolCallId: 'call' }))
  return { result, armed, proposed }
}

describe('arming tool', () => {
  // "Remind me at 3, and look at my screen at 4" sets two runs that each happen once, without approval.
  it('arms each run that happens once', async () => {
    const { result, armed, proposed } = await arm([run({}), run({ name: 'Watch me', triggers: [at('16:00')], note: 'Look at the screen.' })])

    expect(armed).toHaveBeenNthCalledWith(1, remind, { automation: { triggers: [{ source: 'clock', event: 'at', time: '15:00' }], conditions: [] }, note: 'Drink water.' })
    expect(armed).toHaveBeenNthCalledWith(2, watch, { automation: { triggers: [{ source: 'clock', event: 'at', time: '16:00' }], conditions: [] }, note: 'Look at the screen.' })
    expect(proposed).not.toHaveBeenCalled()
    expect(result).toBe('Set "Remind me". It runs once when a trigger fires and its conditions hold.\nSet "Watch me". It runs once when a trigger fires and its conditions hold.')
  })

  // A run that fires again and again needs the owner's approval, so it never arms.
  it('saves a repeating run as a proposal, and refuses it when proposals are off', async () => {
    const { result, armed, proposed } = await arm([run({ repeat: true, cooldownMinutes: 60 })])

    expect(armed).not.toHaveBeenCalled()
    expect(proposed).toHaveBeenCalledWith({
      name: 'Remind me: Drink water.',
      description: 'Drink water.',
      instructions: 'Remind the owner.\n\nThis run: Drink water.',
      keywords: [],
      automation: { triggers: [{ source: 'clock', event: 'at', time: '15:00' }], conditions: [], cooldownMinutes: 60 },
    })
    expect(result).toContain('Saved "Remind me" as a repeating proposal.')

    expect((await arm([run({ repeat: true })], false)).result).toBe('Not set: runs[0].repeat: the owner turned recipe proposals off, so a repeating run cannot be saved. Tell the owner.')
  })

  // Every run is checked first, so the model fixes one field and resends without setting a run twice.
  it('names the path of a wrong field and sets nothing', async () => {
    const { result, armed } = await arm([run({}), run({ name: 'Watch me', triggers: [at('25:00')] })])

    expect(result).toBe('Not set: runs[1]: A clock trigger is at an HH:MM time or every some minutes.')
    expect(armed).not.toHaveBeenCalled()
    expect((await arm([run({ name: 'Nap' })])).result).toBe('Not set: runs[0].name: no invoked recipe has that name. Invoked recipes: Remind me, Watch me.')
  })
})
