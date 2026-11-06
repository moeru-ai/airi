import type { Bot } from 'mineflayer'
import type { Item as InventoryItem } from 'prismarine-item'

import prismarineItem from 'prismarine-item'
import prismarineRegistry from 'prismarine-registry'

import { describe, expect, it } from 'vitest'

import { cookedVariantOf, hasReadyFood, isCookableToHigherSaturation, selectReadyFood } from './foods'

const registry = prismarineRegistry('1.21.4')
const Item = prismarineItem(registry)

function item(name: string): InventoryItem {
  return new Item(registry.itemsByName[name].id, 1)
}

function botWith(items: InventoryItem[]): Bot {
  return { registry, inventory: { items: () => items } } as Bot
}

describe('food classification', () => {
  it('flags raw cookable foods and maps them to their cooked variant', () => {
    expect(isCookableToHigherSaturation('beef')).toBe(true)
    expect(isCookableToHigherSaturation('potato')).toBe(true)
    expect(cookedVariantOf('beef')).toBe('cooked_beef')
    expect(cookedVariantOf('potato')).toBe('baked_potato')
  })

  it('treats already-edible foods as not cookable', () => {
    expect(isCookableToHigherSaturation('bread')).toBe(false)
    expect(isCookableToHigherSaturation('cooked_beef')).toBe(false)
    expect(cookedVariantOf('bread')).toBe(null)
  })
})

describe('selectReadyFood', () => {
  // ROOT CAUSE:
  // Prismarine items do not carry foodPoints. The bot registry owns these values.
  // Real inventory items must remain edible without test-only item properties.
  // Food IDs can differ from item IDs across data versions, so look up food by name.
  it('picks the highest-foodPoints ready food from real inventory items', () => {
    const best = selectReadyFood(botWith([item('bread'), item('cooked_beef'), item('apple')]))
    expect(best?.name).toBe('cooked_beef')
  })

  it('skips raw cookable food, leaving it for the cook-then-eat path', () => {
    // bread is ready; beef is raw cookable and must be excluded
    const best = selectReadyFood(botWith([item('beef'), item('bread')]))
    expect(best?.name).toBe('bread')
  })

  it('returns null when the only food is raw cookable', () => {
    expect(selectReadyFood(botWith([item('beef'), item('porkchop')]))).toBe(null)
    expect(hasReadyFood(botWith([item('beef')]))).toBe(false)
  })

  it('returns null when there is no food at all', () => {
    expect(selectReadyFood(botWith([item('stone'), item('iron_pickaxe')]))).toBe(null)
    expect(hasReadyFood(botWith([item('cooked_cod')]))).toBe(true)
  })

  it('ignores item IDs absent from the food registry', () => {
    const unknown = new Item(999999, 1)
    expect(selectReadyFood(botWith([unknown]))).toBe(null)
  })

  it.each(['1.20.4', '1.21.4'])('finds ready food by name in the %s registry', (version) => {
    const versionRegistry = prismarineRegistry(version)
    const VersionItem = prismarineItem(versionRegistry)
    const bread = new VersionItem(versionRegistry.itemsByName.bread.id, 1)
    const bot = { registry: versionRegistry, inventory: { items: () => [bread] } } as Bot

    expect(bread).not.toHaveProperty('foodPoints')
    expect(selectReadyFood(bot)).toBe(bread)
    expect(hasReadyFood(bot)).toBe(true)
  })
})
