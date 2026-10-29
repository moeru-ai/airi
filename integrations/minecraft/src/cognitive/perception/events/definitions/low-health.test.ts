import type { Bot } from 'mineflayer'
import type { Item as InventoryItem } from 'prismarine-item'

import type { PerceptionContext } from '../types'

import prismarineItem from 'prismarine-item'
import prismarineRegistry from 'prismarine-registry'

import { describe, expect, it } from 'vitest'

import { lowHealthEvent } from './low-health'

const filter = lowHealthEvent.mineflayer.filter!
const extract = lowHealthEvent.mineflayer.extract

const registry = prismarineRegistry('1.21.4')
const Item = prismarineItem(registry)
const bread = new Item(registry.itemsByName.bread.id, 1)
const rawBeef = new Item(registry.itemsByName.beef.id, 1)

function ctx(health: number, items: InventoryItem[] = [], pvpTarget: unknown = null): PerceptionContext {
  const bot = { registry, health, inventory: { items: () => items }, pvp: { target: pvpTarget } } as Bot
  return {
    bot,
    selfUsername: 'Airi',
    maxDistance: 32,
    distanceTo: () => null,
    distanceToPos: () => null,
    isSelf: () => false,
    entityId: () => '',
  }
}

describe('low_health perception event', () => {
  it('fires once when entering critical health with no ready food, then re-arms above threshold', () => {
    filter(ctx(20)) // arm
    expect(filter(ctx(6))).toBe(true) // critical, no food -> wake brain (disarms)
    expect(filter(ctx(6))).toBe(false) // still critical but already fired this episode
    filter(ctx(20)) // recover -> re-arm
    expect(filter(ctx(4))).toBe(true) // dropped critical again -> fires
  })

  it('stays quiet when the bot has ready-to-eat food (the reflex handles it)', () => {
    filter(ctx(20)) // arm
    // critical, but bread is ready -> auto-eat reflex covers it, no brain wake, latch stays armed
    expect(filter(ctx(6, [bread]))).toBe(false)
    // raw-only food cannot be eaten by the reflex -> escalate to the brain to cook
    expect(filter(ctx(6, [rawBeef]))).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/1915 (Codex P1)
  it('escalates at critical health WITH ready food while mid-fight (auto-eat is suppressed in combat)', () => {
    // ROOT CAUSE:
    // During a defend engagement reflexEngaged disables auto-eat, and damage signals are suppressed
    // while attacking, so a critical bot holding ready food was never woken to retreat/eat — it kept
    // fighting at <=6 health. bot.pvp.target marks active combat; escalate even with ready food then.
    filter(ctx(20)) // arm
    expect(filter(ctx(6, [bread], { id: 1 }))).toBe(true) // critical + ready food + in combat -> wake brain
    filter(ctx(20)) // recover -> re-arm
    expect(filter(ctx(6, [bread]))).toBe(false) // same but NOT in combat -> reflex eats it, stay quiet
  })

  it('extracts the current health for the signal', () => {
    expect(extract(ctx(5))).toEqual({ health: 5 })
  })
})
