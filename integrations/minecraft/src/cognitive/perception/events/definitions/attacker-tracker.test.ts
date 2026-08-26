import { describe, expect, it } from 'vitest'

import { recentAttacker, recordAttacker } from './attacker-tracker'
import { damageTakenEvent } from './damage-taken'

// ROOT CAUSE:
//
// inferDamageSource attributed damage to the NEAREST entity. When a skeleton shot the bot with a
// crossbow/bow while the master (dssadg) stood next to it, the nearest entity was the master, so the
// bot reported "主人你又打我!" and tried to retaliate against its own master instead of the mob.
//
// Fix: mineflayer emits entityHurt(victim, source) from the 1.20+ damage_event packet, where source
// is the REAL attacker. recordAttacker captures it; inferDamageSource prefers it over the nearest-
// entity guess.

/** Minimal PerceptionContext stub mirroring the damage-taken harness. */
function makeCtx(health: number, entity: Record<string, any>, nearby: Record<string, any> = {}): any {
  return {
    bot: { entities: nearby, entity, health },
    distanceTo: (e: any) => (typeof e?._distance === 'number' ? e._distance : null),
    distanceToPos: () => null,
    entityId: (e: any) => String(e?.id ?? 'unknown'),
    isSelf: (e: any) => e?.username === 'Airi',
    maxDistance: 32,
    selfUsername: 'Airi',
  }
}

function primeDamage(entity: Record<string, any>, to: number, nearby: Record<string, any> = {}): any {
  damageTakenEvent.mineflayer.filter!(makeCtx(20, entity, nearby)) // sets lastHealth = 20
  const hurt = makeCtx(to, entity, nearby)
  expect(damageTakenEvent.mineflayer.filter!(hurt)).toBe(true)
  return hurt
}

const groundedSelf = { id: 1, isInLava: false, isInWater: false, onGround: true, velocity: { y: 0 } }

describe('recentAttacker', () => {
  it('returns the recorded attacker within the recency window, null once stale', () => {
    recordAttacker({ id: 9, name: 'skeleton', type: 'mob' }, 1000)
    expect(recentAttacker(1100)?.name).toBe('skeleton')
    expect(recentAttacker(2000)).toBe(null) // 1000ms elapsed > 600ms window
  })

  it('ignores a null source (environmental damage reports no entity)', () => {
    recordAttacker({ id: 5, name: 'zombie', type: 'mob' }, 5000)
    recordAttacker(null, 5001) // must not overwrite with nothing
    expect(recentAttacker(5050)?.name).toBe('zombie')
  })
})

describe('damage attribution via the real attacker', () => {
  it('blames the skeleton, not the nearer master player (the crossbow bug)', () => {
    const master = { _distance: 1, id: 7, name: 'player', type: 'player', username: 'dssadg' }
    const skeleton = { _distance: 20, id: 9, name: 'skeleton', type: 'mob' }
    // entityHurt fired with the REAL source = the skeleton, even though the master stands closer
    recordAttacker(skeleton, Date.now())

    const hurt = primeDamage(groundedSelf, 18, { 7: master, 9: skeleton })
    const extracted = damageTakenEvent.mineflayer.extract(hurt) as { attacker: string, damageSource: { cause: string, name?: string } }
    expect(extracted.damageSource.cause).toBe('mob')
    expect(extracted.damageSource.name).toBe('skeleton')
    expect(extracted.attacker).toBe('skeleton')
  })

  it('still attributes a genuine master melee hit to the master', () => {
    const master = { _distance: 1, id: 7, name: 'player', type: 'player', username: 'dssadg' }
    recordAttacker(master, Date.now())

    const hurt = primeDamage(groundedSelf, 18, { 7: master })
    const extracted = damageTakenEvent.mineflayer.extract(hurt) as { attacker: string, damageSource: { cause: string } }
    expect(extracted.damageSource.cause).toBe('player')
    expect(extracted.attacker).toBe('dssadg')
  })
})
