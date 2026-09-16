import { describe, expect, it } from 'vitest'

import { damageTakenEvent } from './damage-taken'
import { classifyRecentFall, recordPhysicsTick } from './fall-tracker'

// ROOT CAUSE:
//
// Fall damage was classified by the instantaneous velocity at the moment the `health` event fired:
//
//   if (velocityY < -0.2 && onGround === false) return { cause: 'gravity' }
//
// But the server applies fall damage on landing and the health packet arrives a few ticks later,
// by which point prismarine-physics has already set onGround=true and reset velocity.y≈0. So the
// check almost never matched: fall damage fell through to the nearest-entity branch and was
// mislabeled as 'player'/'mob' (or 'unknown'), e.g. blaming a nearby player for a self-inflicted
// fall.
//
// We fixed this by sampling vertical motion every physicsTick (recordPhysicsTick) and remembering
// the descent speed from just before landing, then classifying via classifyRecentFall at damage
// time. Each test below establishes its own landing so the shared module state is deterministic.

/** Build a vertical-motion snapshot for one sampled tick. */
function motion(velocityY: number, onGround: boolean): { velocity: { y: number }, onGround: boolean } {
  // @example motion(-0.9, false) -> airborne, descending fast
  return { velocity: { y: velocityY }, onGround }
}

describe('fall tracker', () => {
  it('classifies a fast descent that just landed as a fall', () => {
    // @example airborne fast -> land -> damage within the recency window
    recordPhysicsTick(motion(-0.9, false), 1000)
    recordPhysicsTick(motion(-1.1, false), 1050)
    recordPhysicsTick(motion(0, true), 1100) // landed
    expect(classifyRecentFall(motion(0, true), 1150)).toBe(true)
  })

  it('does not classify a gentle step-down as a fall', () => {
    // @example airborne but slow (one-block step) -> land -> not fall damage
    recordPhysicsTick(motion(-0.1, false), 2000)
    recordPhysicsTick(motion(0, true), 2050) // landed, peak only -0.1 (above threshold)
    expect(classifyRecentFall(motion(0, true), 2100)).toBe(false)
  })

  it('does not classify damage long after a fall (recency window elapsed)', () => {
    // @example fast fall + land, but the damage arrives a full second later -> stale -> not a fall
    recordPhysicsTick(motion(-0.9, false), 3000)
    recordPhysicsTick(motion(0, true), 3050) // landed
    expect(classifyRecentFall(motion(0, true), 3050 + 1000)).toBe(false)
  })

  it('classifies damage while still airborne and descending fast as a fall', () => {
    // @example took a hit mid-air (e.g. fell into a pit and clipped a second hit before landing)
    expect(classifyRecentFall(motion(-0.8, false), 4000)).toBe(true)
  })
})

describe('damage_taken cause inference', () => {
  // Minimal PerceptionContext stub: drives damageTakenEvent.filter/extract without a real bot.
  function makeCtx(health: number, entity: Record<string, any>, nearby: Record<string, any> = {}): any {
    return {
      bot: { health, entity, entities: nearby },
      selfUsername: 'Airi',
      maxDistance: 32,
      distanceTo: (e: any) => (typeof e?._distance === 'number' ? e._distance : null),
      distanceToPos: () => null,
      isSelf: (e: any) => e?.username === 'Airi',
      entityId: (e: any) => String(e?.id ?? 'unknown'),
    }
  }

  // Prime lastHealth to 20, then drop to `to`, returning the dropped-health ctx ready for extract().
  function primeDamage(entity: Record<string, any>, to: number, nearby: Record<string, any> = {}): any {
    const full = makeCtx(20, entity, nearby)
    damageTakenEvent.mineflayer.filter!(full) // sets lastHealth = 20, returns false
    const hurt = makeCtx(to, entity, nearby)
    expect(damageTakenEvent.mineflayer.filter!(hurt)).toBe(true)
    return hurt
  }

  it('labels post-landing fall damage as cause=fall', () => {
    // @example fast descent then land at real time, then a fall-damage health packet
    const now = 50_000
    recordPhysicsTick(motion(-0.9, false), now)
    recordPhysicsTick(motion(0, true), now + 50)
    // NOTICE: inferDamageSource calls Date.now() internally, so record landings with Date.now() so
    // they fall inside the recency window relative to extract().
    recordPhysicsTick(motion(-0.9, false), Date.now())
    recordPhysicsTick(motion(0, true), Date.now())

    const hurt = primeDamage(motion(0, true), 6.5)
    const extracted = damageTakenEvent.mineflayer.extract(hurt) as { amount: number, damageSource: { cause: string }, attacker: string }
    expect(extracted.amount).toBe(13.5)
    expect(extracted.damageSource.cause).toBe('fall')
    expect(extracted.attacker).toBe('') // environmental: no attacker name (rule renders "from=")
  })

  it('blames a nearby mob (not fall) when the bot was grounded', () => {
    // Overwrite tracker state with a gentle grounded landing so no stale fast fall leaks in.
    recordPhysicsTick(motion(-0.1, false), Date.now())
    recordPhysicsTick(motion(0, true), Date.now())

    const zombie = { type: 'mob', name: 'zombie', id: 42, _distance: 1.5 }
    const hurt = primeDamage(motion(0, true), 16, { 42: zombie })
    const extracted = damageTakenEvent.mineflayer.extract(hurt) as { damageSource: { cause: string, name?: string }, attacker: string }
    expect(extracted.damageSource.cause).toBe('mob')
    expect(extracted.damageSource.name).toBe('zombie')
    expect(extracted.attacker).toBe('zombie')
  })

  it('names a player attacker so the master can be recognised (not "someone")', () => {
    // The reported bug: the master (dssadg) punched the bot, but the signal said only cause=player
    // with no name, so the master-identity rule could not fire. The attacker name must be surfaced.
    recordPhysicsTick(motion(-0.1, false), Date.now())
    recordPhysicsTick(motion(0, true), Date.now()) // grounded, not a fall

    const master = { type: 'player', name: 'player', username: 'dssadg', id: 7, _distance: 1 }
    const hurt = primeDamage(motion(0, true), 16, { 7: master })
    const extracted = damageTakenEvent.mineflayer.extract(hurt) as { damageSource: { cause: string }, attacker: string }
    expect(extracted.damageSource.cause).toBe('player')
    expect(extracted.attacker).toBe('dssadg')
  })
})
