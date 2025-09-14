import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Recipe } from 'prismarine-recipe'

import type { Mineflayer } from '../libs/mineflayer'

import { useLogger } from '../utils/logger'
import { getItemId, getItemName } from '../utils/mcdata'
import { ensureCraftingTable } from './actions/ensure'
import { collectBlock, placeBlock } from './blocks'
import { goToNearestBlock, goToPosition, moveAway } from './movement'
import { getInventoryCounts, getNearestBlock, getNearestFreeSpace } from './world'

const logger = useLogger()

/*
Possible Scenarios:

1. **Successful Craft Without Crafting Table**:
   - The bot attempts to craft the item without a crafting table and succeeds. The function returns `true`.

2. **Crafting Table Nearby**:
   - The bot tries to craft without a crafting table but fails.
   - The bot then checks for a nearby crafting table.
   - If a crafting table is found, the bot moves to it and successfully crafts the item, returning `true`.

3. **No Crafting Table Nearby, Place Crafting Table**:
   - The bot fails to craft without a crafting table and does not find a nearby crafting table.
   - The bot checks inventory for a crafting table, places it at a suitable location, and attempts crafting again.
   - If successful, the function returns `true`. If the bot cannot find a suitable position or fails to craft, it returns `false`.

4. **Insufficient Resources**:
   - At any point, if the bot does not have the required resources to craft the item, it logs an appropriate message and returns `false`.

5. **No Crafting Table and No Suitable Position**:
   - If the bot does not find a crafting table and cannot find a suitable position to place one, it moves away and returns `false`.

6. **Invalid Item Name**:
   - If the provided item name is invalid, the function logs the error and returns `false`.
*/
export async function craftRecipe(
  mineflayer: Mineflayer,
  incomingItemName: string,
  num = 1,
): Promise<boolean> {
  let itemName = incomingItemName.replace(' ', '_').toLowerCase()

  if (itemName.endsWith('plank'))
    itemName += 's' // Correct common mistakes

  const itemId = getItemId(itemName)
  if (itemId === null) {
    logger.log(`Invalid item name: ${itemName}`)
    return false
  }

  // Helper function to attempt crafting
  async function attemptCraft(
    recipes: Recipe[] | null,
    craftingTable: Block | null = null,
  ): Promise<boolean> {
    if (recipes && recipes.length > 0) {
      const recipe = recipes[0]
      try {
        await mineflayer.bot.craft(recipe, num, craftingTable ?? undefined)
        logger.log(
          `Successfully crafted ${num} ${itemName}${
            craftingTable ? ' using crafting table' : ''
          }.`,
        )
        return true
      }
      catch (err) {
        logger.log(`Failed to craft ${itemName}: ${(err as Error).message}`)
        return false
      }
    }
    return false
  }

  // Helper function to move to a crafting table and attempt crafting with retry logic
  async function moveToAndCraft(craftingTable: Block): Promise<boolean> {
    logger.log(`Crafting table found, moving to it.`)
    const maxRetries = 2
    let attempts = 0
    let success = false

    while (attempts < maxRetries && !success) {
      try {
        await goToPosition(
          mineflayer,
          craftingTable.position.x,
          craftingTable.position.y,
          craftingTable.position.z,
          1,
        )
        const recipes = mineflayer.bot.recipesFor(itemId, null, 1, craftingTable)
        success = await attemptCraft(recipes, craftingTable)
      }
      catch (err) {
        logger.log(
          `Attempt ${attempts + 1} to move to crafting table failed: ${
            (err as Error).message
          }`,
        )
      }
      attempts++
    }

    return success
  }

  // Helper function to find and use or place a crafting table
  async function findAndUseCraftingTable(
    craftingTableRange: number,
  ): Promise<boolean> {
    let craftingTable = getNearestBlock(mineflayer, 'crafting_table', craftingTableRange)
    if (craftingTable) {
      return await moveToAndCraft(craftingTable)
    }

    logger.log(`No crafting table nearby, attempting to place one.`)
    const hasCraftingTable = await ensureCraftingTable(mineflayer)
    if (!hasCraftingTable) {
      logger.log(`Failed to ensure a crafting table to craft ${itemName}.`)
      return false
    }

    const pos = getNearestFreeSpace(mineflayer, 1, 10)
    if (pos) {
      moveAway(mineflayer, 4)
      logger.log(
        `Placing crafting table at position (${pos.x}, ${pos.y}, ${pos.z}).`,
      )
      await placeBlock(mineflayer, 'crafting_table', pos.x, pos.y, pos.z)
      craftingTable = getNearestBlock(mineflayer, 'crafting_table', craftingTableRange)
      if (craftingTable) {
        return await moveToAndCraft(craftingTable)
      }
    }
    else {
      logger.log('No suitable position found to place the crafting table.')
      moveAway(mineflayer, 5)
      return false
    }

    return false
  }

  // Step 1: Try to craft without a crafting table
  logger.log(`Step 1: Try to craft without a crafting table`)
  const recipes = mineflayer.bot.recipesFor(itemId, null, 1, null)
  if (recipes && (await attemptCraft(recipes))) {
    return true
  }

  // Step 2: Find and use a crafting table
  logger.log(`Step 2: Find and use a crafting table`)
  const craftingTableRange = 32
  if (await findAndUseCraftingTable(craftingTableRange)) {
    return true
  }

  return false
}

export async function smeltItem(mineflayer: Mineflayer, itemName: string, num = 1): Promise<boolean> {
  const foods = [
    'beef',
    'chicken',
    'cod',
    'mutton',
    'porkchop',
    'rabbit',
    'salmon',
    'tropical_fish',
  ]
  if (!itemName.includes('raw') && !foods.includes(itemName)) {
    logger.log(
      `Cannot smelt ${itemName}, must be a "raw" item, like "raw_iron".`,
    )
    return false
  } // TODO: allow cobblestone, sand, clay, etc.

  let placedFurnace = false
  let furnaceBlock = getNearestBlock(mineflayer, 'furnace', 32)
  if (!furnaceBlock) {
    // Try to place furnace
    const hasFurnace = getInventoryCounts(mineflayer).furnace > 0
    if (hasFurnace) {
      const pos = getNearestFreeSpace(mineflayer, 1, 32)
      if (pos) {
        await placeBlock(mineflayer, 'furnace', pos.x, pos.y, pos.z)
      }
      else {
        logger.log('No suitable position found to place the furnace.')
        return false
      }
      furnaceBlock = getNearestBlock(mineflayer, 'furnace', 32)
      placedFurnace = true
    }
  }
  if (!furnaceBlock) {
    logger.log(`There is no furnace nearby and I have no furnace.`)
    return false
  }
  if (mineflayer.bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
    await goToNearestBlock(mineflayer, 'furnace', 4, 32)
  }
  await mineflayer.bot.lookAt(furnaceBlock.position)

  logger.log('smelting...')
  const furnace = await mineflayer.bot.openFurnace(furnaceBlock)
  // Check if the furnace is already smelting something
  const inputItem = furnace.inputItem()
  if (
    inputItem
    && inputItem.type !== getItemId(itemName)
    && inputItem.count > 0
  ) {
    logger.log(
      `The furnace is currently smelting ${getItemName(
        inputItem.type,
      )}.`,
    )
    if (placedFurnace)
      await collectBlock(mineflayer, 'furnace', 1)
    return false
  }
  // Check if the bot has enough items to smelt
  const invCounts = getInventoryCounts(mineflayer)
  if (!invCounts[itemName] || invCounts[itemName] < num) {
    logger.log(`I do not have enough ${itemName} to smelt.`)
    if (placedFurnace)
      await collectBlock(mineflayer, 'furnace', 1)
    return false
  }

  // Fuel the furnace
  if (!furnace.fuelItem()) {
    const fuel = mineflayer.bot.inventory
      .items()
      .find(item => item.name === 'coal' || item.name === 'charcoal')
    const putFuel = Math.ceil(num / 8)
    if (!fuel || fuel.count < putFuel) {
      logger.log(
        `I do not have enough coal or charcoal to smelt ${num} ${itemName}, I need ${putFuel} coal or charcoal`,
      )
      if (placedFurnace)
        await collectBlock(mineflayer, 'furnace', 1)
      return false
    }
    await furnace.putFuel(fuel.type, null, putFuel)
    logger.log(
      `Added ${putFuel} ${getItemName(fuel.type)} to furnace fuel.`,
    )
  }
  // Put the items in the furnace
  const itemId = getItemId(itemName)
  if (itemId === null) {
    logger.log(`Invalid item name: ${itemName}`)
    return false
  }
  await furnace.putInput(itemId, null, num)
  // Wait for the items to smelt
  let total = 0
  let collectedLast = true
  let smeltedItem: Item | null = null
  await new Promise(resolve => setTimeout(resolve, 200))
  while (total < num) {
    await new Promise(resolve => setTimeout(resolve, 10000))
    logger.log('checking...')
    let collected = false
    if (furnace.outputItem()) {
      smeltedItem = await furnace.takeOutput()
      if (smeltedItem) {
        total += smeltedItem.count
        collected = true
      }
    }
    if (!collected && !collectedLast) {
      break // if nothing was collected this time or last time
    }
    collectedLast = collected
  }
  await mineflayer.bot.closeWindow(furnace)

  if (placedFurnace) {
    await collectBlock(mineflayer, 'furnace', 1)
  }
  if (total === 0) {
    logger.log(`Failed to smelt ${itemName}.`)
    return false
  }
  if (total < num) {
    logger.log(
      `Only smelted ${total} ${getItemName(smeltedItem?.type || 0)}.`,
    )
    return false
  }
  logger.log(
    `Successfully smelted ${itemName}, got ${total} ${getItemName(
      smeltedItem?.type || 0,
    )}.`,
  )
  return true
}

export async function clearNearestFurnace(mineflayer: Mineflayer): Promise<boolean> {
  const furnaceBlock = getNearestBlock(mineflayer, 'furnace', 6)
  if (!furnaceBlock) {
    logger.log(`There is no furnace nearby.`)
    return false
  }

  logger.log('clearing furnace...')
  const furnace = await mineflayer.bot.openFurnace(furnaceBlock)
  logger.log('opened furnace...')
  // Take the items out of the furnace
  let smeltedItem: Item | null = null
  let inputItem: Item | null = null
  let fuelItem: Item | null = null
  if (furnace.outputItem())
    smeltedItem = await furnace.takeOutput()
  if (furnace.inputItem())
    inputItem = await furnace.takeInput()
  if (furnace.fuelItem())
    fuelItem = await furnace.takeFuel()
  logger.log(smeltedItem, inputItem, fuelItem)
  const smeltedName = smeltedItem
    ? `${smeltedItem.count} ${smeltedItem.name}`
    : `0 smelted items`
  const inputName = inputItem
    ? `${inputItem.count} ${inputItem.name}`
    : `0 input items`
  const fuelName = fuelItem
    ? `${fuelItem.count} ${fuelItem.name}`
    : `0 fuel items`
  logger.log(
    `Cleared furnace, received ${smeltedName}, ${inputName}, and ${fuelName}.`,
  )
  await mineflayer.bot.closeWindow(furnace)
  return true
}
