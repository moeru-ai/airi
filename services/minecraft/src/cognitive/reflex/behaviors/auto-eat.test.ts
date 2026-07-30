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

/** ReflexApi stub that records reflexEngaged at each step + runs equip/consume hooks. */
function runApi(opts: { onEquip?: () => void, onConsume?: () => void | Promise<void> }) {
  const autonomy = { reflexEngaged: false }
  const seen: boolean[] = []
  const api: any = {
    bot: {
      bot: {
        inventory: { items: () => [bread] },
        equip: async () => {
          seen.push(autonomy.reflexEngaged)
          opts.onEquip?.()
        },
        consume: async () => {
          seen.push(autonomy.reflexEngaged)
          await opts.onConsume?.()
        },
      },
    },
    context: { updateAutonomy: (p: { reflexEngaged: boolean }) => { autonomy.reflexEngaged = p.reflexEngaged } },
  }
  return { api, autonomy, seen }
}

describe('autoEatBehavior.run', () => {
  // Regression: the bite must hold reflexEngaged across equip+consume so the defend reflex (which
  // yields on reflexEngaged) cannot re-equip a weapon and cancel it mid-animation.
  it('holds reflexEngaged across equip and consume, then releases it', async () => {
    const { api, autonomy, seen } = runApi({})
    await autoEatBehavior.run(api)
    expect(seen).toEqual([true, true]) // reflexEngaged was set during both equip and consume
    expect(autonomy.reflexEngaged).toBe(false) // released afterward
  })

  it('releases reflexEngaged even when consume throws', async () => {
    const { api, autonomy } = runApi({ onConsume: () => Promise.reject(new Error('interrupted')) })
    await expect(autoEatBehavior.run(api)).rejects.toThrow('interrupted')
    expect(autonomy.reflexEngaged).toBe(false)
  })
})
