import type { Bot } from 'mineflayer'
import type { Item } from 'prismarine-item'

/**
 * Raw foods that smelt into a strictly higher-saturation cooked variant. Eating these raw is
 * wasteful, so the auto-eat reflex leaves them alone and the conscious brain cooks them first.
 *
 * NOTICE: a fixed table rather than a minecraft-data smelting-recipe lookup. The cookable-food set
 * is small and stable across versions, every cooked variant here has strictly higher food/saturation
 * than its raw form, and this keeps the helper free of an mcData dependency so it is trivially
 * testable. Add an entry if a new cookable food needs covering.
 */
const RAW_TO_COOKED: Record<string, string> = {
  beef: 'cooked_beef',
  porkchop: 'cooked_porkchop',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
  rabbit: 'cooked_rabbit',
  cod: 'cooked_cod',
  salmon: 'cooked_salmon',
  potato: 'baked_potato',
  kelp: 'dried_kelp',
}

/** prismarine-item enriches inventory items with `foodPoints` at runtime; it is absent from its types. */
type MaybeFood = Item & { foodPoints?: number }

function foodPointsOf(item: Item): number {
  return (item as MaybeFood).foodPoints ?? 0
}

/**
 * The cooked item id a raw food smelts into, or null if the item is not a raw cookable food.
 *
 * Before: "beef"
 * After:  "cooked_beef"
 */
export function cookedVariantOf(rawName: string): string | null {
  return RAW_TO_COOKED[rawName] ?? null
}

/**
 * Whether eating this item should be deferred so it can be cooked into a higher-saturation food
 * first. True only for raw foods with a strictly better cooked form.
 */
export function isCookableToHigherSaturation(itemName: string): boolean {
  return itemName in RAW_TO_COOKED
}

/**
 * Pick the best food the bot can eat right now WITHOUT cooking.
 *
 * Use when:
 * - The auto-eat reflex needs an instantly-edible item (0 token), or the low-health perception event
 *   needs to know whether the reflex can handle recovery on its own.
 *
 * Expects:
 * - `bot` is a live mineflayer Bot whose inventory items carry runtime `foodPoints`.
 *
 * Returns:
 * - The highest-`foodPoints` edible item that is NOT a raw cookable food, or null when the only food
 *   on hand is still-raw cookable food (left for the conscious cook-then-eat path) or there is no
 *   food at all.
 */
export function selectReadyFood(bot: Bot): Item | null {
  let best: Item | null = null
  let bestPoints = -1
  for (const item of bot.inventory.items()) {
    const points = foodPointsOf(item)
    if (points <= 0)
      continue
    if (isCookableToHigherSaturation(item.name))
      continue
    if (points > bestPoints) {
      best = item
      bestPoints = points
    }
  }
  return best
}

/** Whether the bot has any food it can eat right now without cooking. See {@link selectReadyFood}. */
export function hasReadyFood(bot: Bot): boolean {
  return selectReadyFood(bot) !== null
}
