import type { Automation, AutomationState } from './automation'
import type { Recipe } from './recipe'

import { describe, expect, it } from 'vitest'

import { checkAutomations } from './automation'

const minute = 60_000
/** A local time on a day of October 2026. The 5th is a Monday. */
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 9, day, hours, minutes).getTime()

function automated(automation: Partial<Automation>, id = 'user:auto'): Recipe {
  return {
    id,
    name: 'Auto',
    description: '',
    instructions: 'Say something.',
    keywords: [],
    source: 'user',
    enabled: true,
    approved: true,
    automation: { triggers: [], conditions: [], ...automation },
  }
}

function check(recipe: Recipe, state: Partial<AutomationState> & { now: number }) {
  return checkAutomations([recipe], { startedAt: at(5, 0), firedAt: {}, ranAt: {}, ...state })
}

const due = (recipe: Recipe, state: Partial<AutomationState> & { now: number }) => check(recipe, state).due.map(entry => entry.trigger)

describe('automations', () => {
  it('fires at a local time on the chosen weekdays, once a day, and never for a time before the recipe was seen', () => {
    const morning = automated({ triggers: [{ source: 'clock', event: 'at', time: '07:30', days: [1, 2, 3, 4, 5] }] })

    expect(due(morning, { now: at(5, 7, 29) })).toEqual([])
    expect(due(morning, { now: at(5, 7, 31) })).toHaveLength(1)
    expect(due(morning, { now: at(5, 9), firedAt: { 'user:auto': { 0: at(5, 7, 31) } } })).toEqual([])
    // The 10th is a Saturday.
    expect(due(morning, { now: at(10, 7, 31), firedAt: { 'user:auto': { 0: at(9, 7, 31) } } })).toEqual([])
    expect(due(morning, { now: at(5, 9), seenAt: { 'user:auto': at(5, 8) } })).toEqual([])
  })

  it('fires every period, counted from when the recipe was seen or last fired', () => {
    const hourly = automated({ triggers: [{ source: 'clock', event: 'every', minutes: 60 }] })

    expect(due(hourly, { now: at(5, 1), seenAt: { 'user:auto': at(5, 0, 30) } })).toEqual([])
    expect(due(hourly, { now: at(5, 1, 30), seenAt: { 'user:auto': at(5, 0, 30) } })).toHaveLength(1)
    // An automation that the model set counts from when it was set, also after the host restarted.
    expect(due(hourly, { now: at(5, 9, 35), startedAt: at(5, 9), seenAt: { 'user:auto': at(5, 8, 30) } })).toHaveLength(1)
    // A recipe that became usable again counts from then, also when it fired before.
    expect(due(hourly, { now: at(5, 9, 10), seenAt: { 'user:auto': at(5, 9) }, firedAt: { 'user:auto': { 0: at(5, 1) } } })).toEqual([])
    // A recipe without instructions never runs.
    expect(due({ ...hourly, instructions: '' }, { now: at(5, 1, 30), seenAt: { 'user:auto': at(5, 0, 30) } })).toEqual([])
  })

  it('fires once per idle time of a source, and waits for the next use', () => {
    const quiet = automated({ triggers: [{ source: 'chat', event: 'idle', minutes: 30 }] })

    expect(due(quiet, { now: at(5, 1, 29), lastOwnerMessageAt: at(5, 1) })).toEqual([])
    expect(due(quiet, { now: at(5, 1, 30), lastOwnerMessageAt: at(5, 1) })).toHaveLength(1)
    expect(due(quiet, { now: at(5, 3), lastOwnerMessageAt: at(5, 1), firedAt: { 'user:auto': { 0: at(5, 1, 30) } } })).toEqual([])
  })

  // A message fires its trigger at once. The silence after it still fires the idle trigger.
  it('keeps the time of each trigger apart', () => {
    const chatty = automated({ triggers: [{ source: 'chat', event: 'message' }, { source: 'chat', event: 'idle', minutes: 30 }] })

    expect(due(chatty, { now: at(5, 1, 31), lastOwnerMessageAt: at(5, 1), firedAt: { 'user:auto': { 0: at(5, 1, 1) } } })).toEqual([{ source: 'chat', event: 'idle', minutes: 30 }])
    expect(check(chatty, { now: at(5, 1, 31), lastOwnerMessageAt: at(5, 1) }).fired).toEqual({ 'user:auto': [0, 1] })
  })

  // The owner left the computer for an hour, then moved the mouse.
  it('fires on the first use of a device after an idle time that long', () => {
    const welcome = automated({ triggers: [{ source: 'mouse', event: 'active', afterIdleMinutes: 60 }] })
    const inputs = (idleMs: number) => ({ mouse: { lastAt: at(5, 3), lastReturn: { at: at(5, 3), idleMs } } })

    expect(due(welcome, { now: at(5, 3, 1), inputs: inputs(70 * minute) })).toHaveLength(1)
    expect(due(welcome, { now: at(5, 3, 1), inputs: inputs(5 * minute) })).toEqual([])
  })

  it('fires on a newer observation of a registered module and passes it on', () => {
    const watch = automated({ triggers: [{ source: 'module', event: 'observation', module: 'minecraft' }] })
    const result = check(watch, { now: at(5, 2), observations: { minecraft: { createdAt: at(5, 1), text: 'A creeper is near.' } } })

    expect(result.due[0]?.observation).toEqual({ source: 'minecraft', text: 'A creeper is near.' })
  })

  // Late at night, the owner starts typing again.
  it('runs only when every condition holds, and spends an event whose conditions fail', () => {
    const lateCoding = automated({
      triggers: [{ source: 'keyboard', event: 'active' }],
      conditions: [{ kind: 'time', from: '22:00', to: '04:00' }, { kind: 'state', source: 'chat', state: 'idle', minutes: 10 }],
    })
    const typing = (now: number) => ({ now, inputs: { keyboard: { lastAt: now - 1_000 } }, lastOwnerMessageAt: at(5, 20) })

    expect(due(lateCoding, typing(at(5, 23, 30)))).toHaveLength(1)
    expect(due(lateCoding, typing(at(6, 1)))).toHaveLength(1)
    const early = check(lateCoding, typing(at(5, 21)))
    expect(early).toEqual({ fired: { 'user:auto': [0] }, due: [] })
  })

  it('skips a run in its cooldown or while an earlier run still runs', () => {
    const typing = automated({ triggers: [{ source: 'keyboard', event: 'active' }], cooldownMinutes: 120 })
    const state = { now: at(5, 23), inputs: { keyboard: { lastAt: at(5, 23) - 1_000 } } }

    expect(check(typing, { ...state, ranAt: { 'user:auto': at(5, 22) } })).toEqual({ fired: { 'user:auto': [0] }, due: [] })
    expect(check(typing, { ...state, running: new Set(['user:auto']) })).toEqual({ fired: { 'user:auto': [0] }, due: [] })
    expect(due(typing, { ...state, ranAt: { 'user:auto': at(5, 20) } })).toHaveLength(1)
  })
})
