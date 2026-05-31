import { describe, expect, it } from 'vitest'

import { autoEatBehavior } from './auto-eat'

/** Minimal reflex snapshot stub: the self fields + autonomy.reflexEngaged auto-eat reads. */
function snapshot(health: number, food: number, reflexEngaged = false): any {
  // @example snapshot(6, 10) -> critical health, hungry enough to benefit from eating
  return { self: { health, food }, autonomy: { reflexEngaged } }
}

/** Minimal ReflexApi stub exposing an inventory for selectReadyFood. */
function apiWith(items: Array<{ name: string, foodPoints?: number }>): any {
  return { bot: { bot: { inventory: { items: () => items } } } }
}

const bread = { name: 'bread', foodPoints: 5 }
const rawBeef = { name: 'beef', foodPoints: 3 }

describe('autoEatBehavior.when', () => {
  it('triggers when critically hurt, hungry, and holding ready food', () => {
    expect(autoEatBehavior.when(snapshot(6, 10), apiWith([bread]))).toBe(true)
  })

  it('does not trigger above the critical health threshold', () => {
    expect(autoEatBehavior.when(snapshot(7, 10), apiWith([bread]))).toBe(false)
  })

  it('does not trigger when food already sustains natural regeneration', () => {
    // food 18 -> passive regen; eating would only waste the item
    expect(autoEatBehavior.when(snapshot(6, 18), apiWith([bread]))).toBe(false)
  })

  it('does not trigger when the only food is raw cookable (left for the brain to cook)', () => {
    expect(autoEatBehavior.when(snapshot(6, 10), apiWith([rawBeef]))).toBe(false)
  })

  it('does not trigger mid-combat (eating would drop the weapon)', () => {
    expect(autoEatBehavior.when(snapshot(6, 10, true), apiWith([bread]))).toBe(false)
  })

  it('outscores passive behaviors', () => {
    expect(autoEatBehavior.score(snapshot(6, 10), apiWith([bread]))).toBe(1_000)
  })
})
