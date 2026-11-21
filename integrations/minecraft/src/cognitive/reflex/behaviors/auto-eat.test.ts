import type { Bot } from 'mineflayer'
import type { Item as InventoryItem } from 'prismarine-item'

import type { ReflexApi } from '../types/behavior'

import prismarineItem from 'prismarine-item'
import prismarineRegistry from 'prismarine-registry'

import { describe, expect, it } from 'vitest'

import { ReflexContext } from '../context'
import { autoEatBehavior } from './auto-eat'

const registry = prismarineRegistry('1.21.4')
const Item = prismarineItem(registry)
const bread = new Item(registry.itemsByName.bread.id, 1)
const rawBeef = new Item(registry.itemsByName.beef.id, 1)

function snapshot(health: number, food: number, reflexEngaged = false) {
  const context = new ReflexContext()
  context.updateSelf({ health, food })
  context.updateAutonomy({ reflexEngaged })
  return context.getSnapshot()
}

function apiWith(items: InventoryItem[]): ReflexApi {
  const bot = { registry, inventory: { items: () => items } } as Bot
  return { bot: { bot } as ReflexApi['bot'], context: new ReflexContext() }
}

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

function runApi(opts: { onEquip?: () => void, onConsume?: () => void | Promise<void> }) {
  const api = apiWith([bread])
  const { context } = api
  const seen: boolean[] = []
  api.bot.bot.equip = async () => {
    seen.push(context.autonomy().reflexEngaged)
    opts.onEquip?.()
  }
  api.bot.bot.consume = async () => {
    seen.push(context.autonomy().reflexEngaged)
    await opts.onConsume?.()
  }
  return { api, context, seen }
}

describe('autoEatBehavior.run', () => {
  // Regression: the bite must hold reflexEngaged across equip+consume so the defend reflex (which
  // yields on reflexEngaged) cannot re-equip a weapon and cancel it mid-animation.
  it('holds reflexEngaged across equip and consume, then releases it', async () => {
    const { api, context, seen } = runApi({})
    await autoEatBehavior.run(api)
    expect(seen).toEqual([true, true]) // reflexEngaged was set during both equip and consume
    expect(context.autonomy().reflexEngaged).toBe(false) // released afterward
  })

  it('releases reflexEngaged even when consume throws', async () => {
    const { api, context } = runApi({ onConsume: () => Promise.reject(new Error('interrupted')) })
    await expect(autoEatBehavior.run(api)).rejects.toThrow('interrupted')
    expect(context.autonomy().reflexEngaged).toBe(false)
  })
})
