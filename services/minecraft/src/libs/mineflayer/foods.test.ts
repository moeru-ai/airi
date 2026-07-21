import type { Bot } from 'mineflayer'

import { describe, expect, it } from 'vitest'

import { cookedVariantOf, hasReadyFood, isCookableToHigherSaturation, selectReadyFood } from './foods'

/** Fake inventory item carrying the runtime `foodPoints` prismarine-item adds. */
function item(name: string, foodPoints?: number): { name: string, foodPoints?: number } {
  // @example item('bread', 5) -> ready-to-eat; item('beef', 3) -> raw cookable; item('stone') -> not food
  return foodPoints === undefined ? { name } : { name, foodPoints }
}

function botWith(items: Array<{ name: string, foodPoints?: number }>): Bot {
  return { inventory: { items: () => items } } as unknown as Bot
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
  it('picks the highest-foodPoints ready food', () => {
    const best = selectReadyFood(botWith([item('bread', 5), item('cooked_beef', 8), item('apple', 4)]))
    expect(best?.name).toBe('cooked_beef')
  })

  it('skips raw cookable food, leaving it for the cook-then-eat path', () => {
    // bread is ready; beef is raw cookable and must be excluded
    const best = selectReadyFood(botWith([item('beef', 3), item('bread', 5)]))
    expect(best?.name).toBe('bread')
  })

  it('returns null when the only food is raw cookable', () => {
    expect(selectReadyFood(botWith([item('beef', 3), item('porkchop', 3)]))).toBe(null)
    expect(hasReadyFood(botWith([item('beef', 3)]))).toBe(false)
  })

  it('returns null when there is no food at all', () => {
    expect(selectReadyFood(botWith([item('stone'), item('iron_pickaxe')]))).toBe(null)
    expect(hasReadyFood(botWith([item('cooked_cod', 5)]))).toBe(true)
  })
})
