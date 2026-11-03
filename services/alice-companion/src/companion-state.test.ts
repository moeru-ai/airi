import type { CompanionPolicy } from './companion-state'
import type { CompanionEvent, CompanionState } from './contracts'

import { merge } from '@moeru/std'
import { describe, expect, it } from 'vitest'

import { createInitialState, defaultPolicy, describeAffect, describeState, localDateOf, reduceCompanionState } from './companion-state'

const policy: CompanionPolicy = merge(defaultPolicy, { timeZone: 'America/Sao_Paulo' })

let sequence = 0

function initial(at = '2026-11-03T12:00:00Z'): CompanionState {
  return createInitialState({ personaId: 'alice', ownerProfileId: 'default', at: new Date(at) })
}

function interaction(at: string, eventId = `turn-${++sequence}`, interrupted = false): CompanionEvent {
  return { kind: 'interaction', eventId, at: new Date(at), site: 'mirror', origin: 'explicit', interrupted }
}

function mood(name: string, at = '2026-11-03T12:00:00Z', extra: Partial<Extract<CompanionEvent, { kind: 'mood' }>> = {}): CompanionEvent {
  return { kind: 'mood', eventId: `mood-${++sequence}`, at: new Date(at), site: 'mirror', mood: name, causes: [], ...extra }
}

function proposal(sourceEventId: string, deltas: Record<string, number>, at = '2026-11-03T12:01:00Z'): CompanionEvent {
  return { kind: 'proposal', eventId: `proposal-${++sequence}`, at: new Date(at), sourceEventId, deltas }
}

function run(state: CompanionState, events: CompanionEvent[]): CompanionState {
  return events.reduce((current, event) => reduceCompanionState(current, event, policy).state, state)
}

describe('localDateOf', () => {
  it('uses the local calendar date, not the UTC date', () => {
    expect(localDateOf(new Date('2026-11-04T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-11-03')
  })
})

describe('interactions', () => {
  it('counts a completed turn and starts the time record', () => {
    const state = run(initial(), [interaction('2026-11-03T12:00:00Z')])

    expect(state.time.totalInteractions).toBe(1)
    expect(state.time.firstMetAt).toBe('2026-11-03T12:00:00.000Z')
    expect(state.time.currentStreak).toBe(1)
    expect(state.revision).toBe(1)
  })

  it('ignores a repeated event ID', () => {
    const event = interaction('2026-11-03T12:00:00Z', 'same-turn')
    const once = reduceCompanionState(initial(), event, policy)
    const twice = reduceCompanionState(once.state, event, policy)

    expect(twice.outcome).toBe('duplicate')
    expect(twice.state).toBe(once.state)
    expect(twice.state.time.totalInteractions).toBe(1)
  })

  it('does not count an interrupted turn, and audits why', () => {
    const result = reduceCompanionState(initial(), interaction('2026-11-03T12:00:00Z', 'cut-turn', true), policy)

    expect(result.outcome).toBe('rejected')
    expect(result.audit?.reason).toBe('interrupted_turn')
    expect(result.state.time.totalInteractions).toBe(0)
    expect(result.state.processedEventIds).toHaveLength(1)
  })

  it('never changes a relationship metric by chat alone', () => {
    const events = Array.from({ length: 100 }, (_, index) => interaction(new Date(Date.parse('2026-11-03T12:00:00Z') + index * 60_000).toISOString()))
    const state = run(initial(), events)

    expect(state.time.totalInteractions).toBe(100)
    expect(state.metrics).toEqual({ affection: 0, trust: 0, intimacy: 0, comfort: 0, respect: 0 })
  })
})

describe('streaks', () => {
  it('extends on consecutive local dates across the UTC midnight', () => {
    const state = run(initial(), [
      interaction('2026-11-03T12:00:00Z'),
      // 23:30 on 2026-11-03 in Sao Paulo, already 2026-11-04 in UTC. Same local date.
      interaction('2026-11-04T02:30:00Z'),
      interaction('2026-11-04T15:00:00Z'),
      interaction('2026-11-05T15:00:00Z'),
    ])

    expect(state.time.currentStreak).toBe(3)
    expect(state.time.bestStreak).toBe(3)
  })

  it('starts again after a gap and keeps the best streak', () => {
    const state = run(initial(), [
      interaction('2026-11-03T12:00:00Z'),
      interaction('2026-11-04T12:00:00Z'),
      interaction('2026-11-07T12:00:00Z'),
    ])

    expect(state.time.currentStreak).toBe(1)
    expect(state.time.bestStreak).toBe(2)
  })

  it('does not inflate the streak or move the last interaction when the clock goes back', () => {
    const state = run(initial(), [
      interaction('2026-11-05T12:00:00Z'),
      interaction('2026-11-03T12:00:00Z'),
      interaction('2026-11-04T12:00:00Z'),
    ])

    expect(state.time.currentStreak).toBe(1)
    expect(state.time.lastInteractionAt).toBe('2026-11-05T12:00:00.000Z')
    expect(state.time.totalInteractions).toBe(3)
  })

  it('shows a broken streak as 0 without changing the stored value', () => {
    const state = run(initial(), [interaction('2026-11-03T12:00:00Z'), interaction('2026-11-04T12:00:00Z')])
    const snapshot = describeState(state, new Date('2026-11-08T12:00:00Z'), policy)

    expect(snapshot.time.currentStreak).toBe(0)
    expect(snapshot.time.bestStreak).toBe(2)
    expect(snapshot.time.daysTogether).toBe(6)
    expect(state.time.currentStreak).toBe(2)
  })
})

describe('energy', () => {
  it('costs energy per turn and recovers it over time up to 100', () => {
    const tired = run(initial('2026-11-03T12:00:00Z'), [
      interaction('2026-11-03T12:00:00Z'),
      interaction('2026-11-03T12:00:00Z'),
    ])

    expect(tired.energy.value).toBe(96)
    expect(describeState(tired, new Date('2026-11-03T12:12:00Z'), policy).energy.value).toBe(98)
    expect(describeState(tired, new Date('2026-11-04T12:00:00Z'), policy).energy.value).toBe(100)
  })

  it('follows the energy that the mood system reports and stops the simulation', () => {
    const state = run(initial(), [
      mood('calm', '2026-11-03T12:00:00Z', { energy: 40 }),
      interaction('2026-11-03T13:00:00Z'),
    ])

    expect(state.energy).toEqual({ value: 40, source: 'existing_ia', updatedAt: '2026-11-03T12:00:00.000Z' })
    expect(describeState(state, new Date('2026-11-04T12:00:00Z'), policy).energy.value).toBe(40)
  })
})

describe('mood', () => {
  it('stores the mood without inventing an intensity or a cause', () => {
    const result = reduceCompanionState(initial(), mood('love'), policy)

    expect(result.outcome).toBe('applied')
    expect(result.affectChanged).toBe(true)
    expect(result.state.mood?.intensity).toBeNull()
    expect(result.state.mood?.causes).toEqual([])
    expect(result.state.mood?.talkingheadMood).toBe('love')
  })

  it('keeps the revision for an identical mood', () => {
    const first = reduceCompanionState(initial(), mood('happy'), policy)
    const second = reduceCompanionState(first.state, mood('happy', '2026-11-03T12:05:00Z'), policy)

    expect(second.outcome).toBe('unchanged')
    expect(second.affectChanged).toBe(false)
    expect(second.state.revision).toBe(first.state.revision)
  })

  it('describes the affect event for the Motion Director', () => {
    const state = run(initial(), [mood('curious', '2026-11-03T12:00:00Z', { intensity: 63, causes: ['technical talk'] })])
    const affect = describeAffect(describeState(state, new Date('2026-11-03T12:00:00Z'), policy))

    expect(affect.eventType).toBe('companion.affect.updated')
    expect(affect.airiEmotion).toBe('curious')
    expect(affect.talkingheadMood).toBe('neutral')
    expect(affect.intensity).toBe(63)
    expect(affect.relationshipMode).toBe('companion')
  })
})

describe('proposals', () => {
  it('rejects a proposal that does not point to a counted turn', () => {
    const result = reduceCompanionState(initial(), proposal('never-happened', { trust: 2 }), policy)

    expect(result.outcome).toBe('rejected')
    expect(result.audit?.reason).toBe('unknown_source_interaction')
  })

  it('accepts one proposal per turn and clamps it', () => {
    const counted = run(initial(), [interaction('2026-11-03T12:00:00Z', 'turn-a')])
    const first = reduceCompanionState(counted, proposal('turn-a', { affection: 500, trust: -9 }), policy)
    const second = reduceCompanionState(first.state, proposal('turn-a', { affection: 10 }), policy)

    expect(first.state.metrics.affection).toBe(20)
    expect(first.state.metrics.trust).toBe(0)
    expect(second.outcome).toBe('rejected')
    expect(second.audit?.reason).toBe('source_already_used')
  })

  it('stops at the daily cap and continues on the next local date', () => {
    const turns = ['t1', 't2', 't3', 't4'].map(id => interaction('2026-11-03T12:00:00Z', id))
    const sameDay = run(initial(), [
      ...turns,
      ...['t1', 't2', 't3', 't4'].map(id => proposal(id, { affection: 20 })),
    ])

    expect(sameDay.metrics.affection).toBe(60)

    const nextDay = run(sameDay, [
      interaction('2026-11-04T12:00:00Z', 't5'),
      proposal('t5', { affection: 20 }, '2026-11-04T12:01:00Z'),
    ])

    expect(nextDay.metrics.affection).toBe(80)
  })

  it('does nothing while relationship tracking is off', () => {
    const state = run(initial(), [
      { kind: 'settings', eventId: 'settings-off', at: new Date('2026-11-03T11:00:00Z'), consent: { relationshipTracking: false } },
      interaction('2026-11-03T12:00:00Z', 'turn-b'),
    ])
    const result = reduceCompanionState(state, proposal('turn-b', { comfort: 2 }), policy)

    expect(result.outcome).toBe('rejected')
    expect(result.audit?.reason).toBe('relationship_tracking_disabled')
  })
})

describe('settings and reset', () => {
  it('refuses the dating sim mode without romantic consent', () => {
    const result = reduceCompanionState(initial(), { kind: 'settings', eventId: 's1', at: new Date('2026-11-03T12:00:00Z'), mode: 'dating_sim' }, policy)

    expect(result.outcome).toBe('rejected')
    expect(result.state.mode).toBe('companion')
  })

  it('accepts the dating sim mode with romantic consent in the same message', () => {
    const result = reduceCompanionState(initial(), {
      kind: 'settings',
      eventId: 's2',
      at: new Date('2026-11-03T12:00:00Z'),
      mode: 'dating_sim',
      consent: { romanticProgression: true },
    }, policy)

    expect(result.state.mode).toBe('dating_sim')
    expect(result.state.consent.romanticProgression).toBe(true)
  })

  it('resets only the selected scope and keeps mode and consent', () => {
    const state = run(initial(), [
      interaction('2026-11-03T12:00:00Z', 'turn-c'),
      proposal('turn-c', { trust: 2 }),
      mood('sad'),
    ])
    const reset = run(state, [{ kind: 'reset', eventId: 'r1', at: new Date('2026-11-03T13:00:00Z'), scope: 'relationship' }])

    expect(reset.metrics.trust).toBe(0)
    expect(reset.time.totalInteractions).toBe(1)
    expect(reset.mood?.primary).toBe('sad')
    expect(reset.consent.relationshipTracking).toBe(true)
  })

  it('audits every changed field with its old and new value', () => {
    const result = reduceCompanionState(initial(), interaction('2026-11-03T12:00:00Z'), policy)
    const paths = result.audit?.changes.map(change => change.path)

    expect(paths).toContain('time.totalInteractions')
    expect(paths).toContain('energy.value')
    expect(paths).not.toContain('processedEventIds')
  })
})
