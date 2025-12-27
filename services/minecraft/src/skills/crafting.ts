import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Recipe } from 'prismarine-recipe'

import type { Mineflayer } from '../libs/mineflayer'

import { ActionError } from '../utils/errors'
import { useLogger } from '../utils/logger'
import { getItemId, getItemName } from '../utils/mcdata'
import { ensureCraftingTable } from './actions/ensure'
import { collectBlock, placeBlock } from './blocks'
import { goToNearestBlock, goToPosition, moveAway } from './movement'
import { getInventoryCounts, getNearestBlock, getNearestFreeSpace } from './world'

const logger = useLogger()

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
    throw new ActionError('UNKNOWN', `Invalid item name: ${itemName}`)
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
        throw new ActionError('CRAFTING_FAILED', `Failed to craft ${itemName}`, { error: err })
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
        if (!recipes || recipes.length === 0) {
            // If we have a crafting table but still no recipes, we are missing materials
            return false // Let the caller decide or fall through
        }
        success = await attemptCraft(recipes, craftingTable)
      }
      catch (err) {
        logger.log(
          `Attempt ${attempts + 1} to move to crafting table failed: ${
            (err as Error).message
          }`,
        )
        if (err instanceof ActionError) throw err
      }
      attempts++
    }

    if (!success) {
         throw new ActionError('NAVIGATION_FAILED', 'Could not reach crafting table')
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
    // valid: ensureCraftingTable now throws ActionError if it fails
    await ensureCraftingTable(mineflayer)

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
      throw new ActionError('CRAFTING_FAILED', 'No suitable position found to place the crafting table')
    }

    return false
  }

  // Step 1: Try to craft without a crafting table
  logger.log(`Step 1: Try to craft without a crafting table`)
  const recipes = mineflayer.bot.recipesFor(itemId, null, 1, null)
  if (recipes && recipes.length > 0) {
      // We have recipes without table
      if (await attemptCraft(recipes)) {
        return true
      }
  }

  // RECURSION GUARD:
  // If we failed to craft basic items (planks, sticks) without a table, 
  // do NOT try to find a table. These items do not need a table.
  // Seeking a table often triggers "ensureCraftingTable" -> "ensurePlanks" -> infinite loop.
  if (itemName.includes('planks') || itemName === 'stick' || itemName === 'crafting_table') {
     logger.log(`Recursion Guard: Skipping crafting table search for basic item: ${itemName}`)
     throw new ActionError('RESOURCE_MISSING', `Cannot craft ${itemName} - missing ingredients`, { item: itemName })
  }

  // Step 2: Find and use a crafting table
  // This will throw if it fails hard
  logger.log(`Step 2: Find and use a crafting table`)
  const craftingTableRange = 32
  if (await findAndUseCraftingTable(craftingTableRange)) {
    return true
  }
  
  // If we got here, maybe we didn't have recipes even with a table?
  // Let's verify if resources are missing
  // We can check recipes again assuming table is available (which we tried to ensure)
  // Simple fallback:
  throw new ActionError('RESOURCE_MISSING', `Cannot craft ${itemName}, possibly missing resources`, { item: itemName })
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
    throw new ActionError('CRAFTING_FAILED', `Cannot smelt ${itemName}, must be a "raw" item`)
  } 

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
        throw new ActionError('CRAFTING_FAILED', 'No suitable position found to place the furnace')
      }
      furnaceBlock = getNearestBlock(mineflayer, 'furnace', 32)
      placedFurnace = true
    }
  }
  if (!furnaceBlock) {
     throw new ActionError('RESOURCE_MISSING', 'There is no furnace nearby and I have no furnace to place')
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
    if (placedFurnace) await collectBlock(mineflayer, 'furnace', 1)
    throw new ActionError('CRAFTING_FAILED', `The furnace is currently smelting ${getItemName(inputItem.type)}`)
  }
  
  // Check if the bot has enough items to smelt
  const invCounts = getInventoryCounts(mineflayer)
  if (!invCounts[itemName] || invCounts[itemName] < num) {
    if (placedFurnace) await collectBlock(mineflayer, 'furnace', 1)
    throw new ActionError('RESOURCE_MISSING', `I do not have enough ${itemName} to smelt`, { required: num })
  }

  // Fuel the furnace
  if (!furnace.fuelItem()) {
    const fuel = mineflayer.bot.inventory
      .items()
      .find(item => item.name === 'coal' || item.name === 'charcoal')
    const putFuel = Math.ceil(num / 8)
    if (!fuel || fuel.count < putFuel) {
      if (placedFurnace) await collectBlock(mineflayer, 'furnace', 1)
      throw new ActionError('RESOURCE_MISSING', `I do not have enough coal or charcoal to smelt`, { required: putFuel })
    }
    await furnace.putFuel(fuel.type, null, putFuel)
  }
  
  // Put the items in the furnace
  const itemId = getItemId(itemName)
  if (itemId === null) {
      if (placedFurnace) await collectBlock(mineflayer, 'furnace', 1)
      throw new ActionError('UNKNOWN', `Invalid item name: ${itemName}`)
  }
  await furnace.putInput(itemId, null, num)
  
  // Wait for the items to smelt
  let total = 0
  let collectedLast = true
  let smeltedItem: Item | null = null
  await new Promise(resolve => setTimeout(resolve, 200))
  // Wait limit 30s per item?
  const maxWait = num * 12000 // approx 10s per item + buffer
  let waited = 0
  
  while (total < num) {
    await new Promise(resolve => setTimeout(resolve, 5000))
    waited += 5000
    
    // Safety break
    if (waited > maxWait) {
        break
    }
    
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
      // If we didn't collect anything twice in a row, maybe it stopped?
      // Check input
      if (!furnace.inputItem() && !furnace.outputItem()) {
          break // empty?
      }
    }
    collectedLast = collected
  }
  await mineflayer.bot.closeWindow(furnace)

  if (placedFurnace) {
    await collectBlock(mineflayer, 'furnace', 1)
  }
  
  if (total < num) {
      throw new ActionError('CRAFTING_FAILED', `Failed to smelt all items, only got ${total}/${num}`)
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
    throw new ActionError('NAVIGATION_FAILED', 'No furnace nearby to clear')
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
    
  await mineflayer.bot.closeWindow(furnace)
  return true
}
