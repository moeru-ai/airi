import { describe, expect, it } from 'vitest'

import { defendBehavior, isEngageableMob } from './defend'

// The defense reflex must fight hostile mobs but NEVER players — the master (or any player) attacking
// the bot is handled by the master-identity rules / brain, not by the reflex swinging back.
describe('isEngageableMob', () => {
  it('engages hostile mobs', () => {
    expect(isEngageableMob({ type: 'hostile', name: 'zombie' })).toBe(true)
    expect(isEngageableMob({ type: 'mob', name: 'skeleton' })).toBe(true)
    expect(isEngageableMob({ type: 'hostile', name: 'pillager' })).toBe(true)
  })

  it('never engages a player (master or otherwise)', () => {
    expect(isEngageableMob({ type: 'player', name: 'dssadg' })).toBe(false)
  })

  it('does not engage friendly/passive entities', () => {
    expect(isEngageableMob({ type: 'mob', name: 'iron_golem' })).toBe(false)
    expect(isEngageableMob({ type: 'animal', name: 'cow' })).toBe(false)
  })

  it('ignores no/environmental attacker', () => {
    expect(isEngageableMob(null)).toBe(false)
    expect(isEngageableMob(undefined)).toBe(false)
  })
})

describe('defendBehavior.when', () => {
  // Regression: while another reflex owns the body (reflexEngaged) — e.g. an in-progress auto-eat
  // survival bite — defend must yield. Otherwise its attackEntity re-equips a weapon and cancels the
  // bite mid-animation in the low-health-in-combat case auto-eat is meant to handle.
  it('yields while another reflex holds reflexEngaged', () => {
    expect(defendBehavior.when({ autonomy: { reflexEngaged: true } } as any, undefined as any)).toBe(false)
  })
})
