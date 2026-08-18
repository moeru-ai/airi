import type { Item } from 'prismarine-item'

import type { Mineflayer } from '../../libs/mineflayer'

import { ActionError } from '../../utils/errors'
import { useLogger } from '../../utils/logger'
import { goToPlayer, goToPosition } from '../movement'
import { getNearestBlock } from '../world'

const logger = useLogger()

/**
 * Equip an item from the bot's inventory.
 * @param mineflayer The mineflayer instance.
 * @param itemName The name of the item to equip.
 * @throws {ActionError} When the item is not in inventory.
 */
export async function equip(mineflayer: Mineflayer, itemName: string): Promise<void> {
  const item = mineflayer.bot.inventory
    .items()
    .find(item => item.name.includes(itemName))
  if (!item) {
    logger.log(`You do not have any ${itemName} to equip.`)
    throw new ActionError('ITEM_NOT_FOUND', `You do not have any ${itemName} to equip`, { item: itemName })
  }
  let destination: 'hand' | 'head' | 'torso' | 'legs' | 'feet' = 'hand'
  if (itemName.includes('leggings'))
    destination = 'legs'
  else if (itemName.includes('boots'))
    destination = 'feet'
  else if (itemName.includes('helmet'))
    destination = 'head'
  else if (itemName.includes('chestplate'))
    destination = 'torso'

  await mineflayer.bot.equip(item, destination)
  logger.log(`Equipped ${itemName}.`)
}

/**
 * Discard an item from the bot's inventory.
 * @param mineflayer The mineflayer instance.
 * @param itemName The name of the item to discard.
 * @param num The number of items to discard. Default is -1 for all.
 * @throws {ActionError} When the item is not in inventory.
 */
export async function discard(mineflayer: Mineflayer, itemName: string, num = -1): Promise<void> {
  let discarded = 0
  while (true) {
    const item = mineflayer.bot.inventory
      .items()
      .find(item => item.name.includes(itemName))
    if (!item) {
      break
    }
    const toDiscard
      = num === -1 ? item.count : Math.min(num - discarded, item.count)
    await mineflayer.bot.toss(item.type, null, toDiscard)
    discarded += toDiscard
    if (num !== -1 && discarded >= num) {
      break
    }
  }
  if (discarded === 0) {
    logger.log(`You do not have any ${itemName} to discard.`)
    throw new ActionError('ITEM_NOT_FOUND', `You do not have any ${itemName} to discard`, { item: itemName })
  }
  logger.log(`Successfully discarded ${discarded} ${itemName}.`)
}

/**
 * Put an item in a chest.
 * @param mineflayer The mineflayer instance.
 * @param itemName The name of the item to put in the chest.
 * @param num The number of items to put in the chest. Default is -1 for all.
 * @throws {ActionError} When no chest is nearby or the item is not in inventory.
 */
export async function putInChest(mineflayer: Mineflayer, itemName: string, num = -1): Promise<void> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    logger.log(`Could not find a chest nearby.`)
    throw new ActionError('TARGET_NOT_FOUND', 'Could not find a chest nearby', { blockType: 'chest' })
  }
  const item = mineflayer.bot.inventory
    .items()
    .find(item => item.name.includes(itemName))
  if (!item) {
    logger.log(`You do not have any ${itemName} to put in the chest.`)
    throw new ActionError('ITEM_NOT_FOUND', `You do not have any ${itemName} to put in the chest`, { item: itemName })
  }
  const toPut = num === -1 ? item.count : Math.min(num, item.count)
  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z)
  const chestContainer = await mineflayer.bot.openContainer(chest)
  await chestContainer.deposit(item.type, null, toPut)
  await chestContainer.close()
  logger.log(`Successfully put ${toPut} ${itemName} in the chest.`)
}

/**
 * Take an item from a chest.
 * @param mineflayer The mineflayer instance.
 * @param itemName The name of the item to take.
 * @param num The number of items to take. Default is -1 for all.
 * @throws {ActionError} When no chest is nearby or the item is not in the chest.
 */
export async function takeFromChest(
  mineflayer: Mineflayer,
  itemName: string,
  num = -1,
): Promise<void> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    logger.log(`Could not find a chest nearby.`)
    throw new ActionError('TARGET_NOT_FOUND', 'Could not find a chest nearby', { blockType: 'chest' })
  }
  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z)
  const chestContainer = await mineflayer.bot.openContainer(chest)
  const item = chestContainer
    .containerItems()
    .find(item => item.name.includes(itemName))
  if (!item) {
    logger.log(`Could not find any ${itemName} in the chest.`)
    await chestContainer.close()
    throw new ActionError('ITEM_NOT_FOUND', `Could not find any ${itemName} in the chest`, { item: itemName })
  }
  const toTake = num === -1 ? item.count : Math.min(num, item.count)
  await chestContainer.withdraw(item.type, null, toTake)
  await chestContainer.close()
  logger.log(`Successfully took ${toTake} ${itemName} from the chest.`)
}

/**
 * View the contents of a chest near the bot.
 * @param mineflayer The mineflayer instance.
 * @throws {ActionError} When no chest is nearby.
 */
export async function viewChest(mineflayer: Mineflayer): Promise<void> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    logger.log(`Could not find a chest nearby.`)
    throw new ActionError('TARGET_NOT_FOUND', 'Could not find a chest nearby', { blockType: 'chest' })
  }
  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z)
  const chestContainer = await mineflayer.bot.openContainer(chest)
  const items = chestContainer.containerItems()
  if (items.length === 0) {
    logger.log(`The chest is empty.`)
  }
  else {
    logger.log(`The chest contains:`)
    for (const item of items) {
      logger.log(`${item.count} ${item.name}`)
    }
  }
  await chestContainer.close()
}

/**
 * Ask to bot to eat a food item from its inventory.
 * @param mineflayer The mineflayer instance.
 * @param foodName The name of the food item to eat.
 * @throws {ActionError} When no food is found in inventory.
 */
export async function eat(mineflayer: Mineflayer, foodName = ''): Promise<void> {
  let item: Item | undefined
  let name: string
  if (foodName) {
    item = mineflayer.bot.inventory.items().find(item => item.name.includes(foodName))
    name = foodName
  }
  else {
    // @ts-expect-error -- ?
    item = mineflayer.bot.inventory.items().find(item => item.foodPoints > 0)
    name = 'food'
  }
  if (!item) {
    logger.log(`You do not have any ${name} to eat.`)
    throw new ActionError('ITEM_NOT_FOUND', `You do not have any ${name} to eat`, { item: name })
  }
  await mineflayer.bot.equip(item, 'hand')
  await mineflayer.bot.consume()
  logger.log(`Successfully ate ${item.name}.`)
}

/**
 * Give an item to a player.
 * @param mineflayer The mineflayer instance.
 * @param itemType The name of the item to give.
 * @param username The username of the player to give the item to.
 * @param num The number of items to give.
 * @throws {ActionError} When the player is not found.
 */
export async function giveToPlayer(
  mineflayer: Mineflayer,
  itemType: string,
  username: string,
  num = 1,
): Promise<void> {
  const player = mineflayer.bot.players[username]?.entity
  if (!player) {
    logger.log(`Could not find a player with username: ${username}.`)
    throw new ActionError('TARGET_NOT_FOUND', `Could not find a player with username: ${username}`, { playerName: username })
  }
  await goToPlayer(mineflayer, username)
  await mineflayer.bot.lookAt(player.position)
  await discard(mineflayer, itemType, num)
  logger.log(`Gave ${num} ${itemType} to ${username}.`)
}

/**
 * List the items in the bot's inventory.
 * @param mineflayer The mineflayer instance.
 * @returns An array of items in the bot's inventory.
 */
export async function listInventory(mineflayer: Mineflayer): Promise<{ name: string, count: number }[]> {
  const items = await mineflayer.bot.inventory.items()
  // sayItems(mineflayer, items)

  return items.map(item => ({
    name: item.name,
    count: item.count,
  }))
}

// === we probably won't need this ===
// export async function checkForItem(mineflayer: Mineflayer, itemName: string): Promise<void> {
//   const items = await mineflayer.bot.inventory.items()
//   const searchableItems = items.filter(item => item.name.includes(itemName))
//   sayItems(mineflayer, searchableItems)
// }

// export async function sayItems(mineflayer: Mineflayer, items: Array<Item> | null = null) {
//   if (!items) {
//     items = mineflayer.bot.inventory.items()
//     if (mineflayer.bot.registry.isNewerOrEqualTo('1.9') && mineflayer.bot.inventory.slots[45])
//       items.push(mineflayer.bot.inventory.slots[45])
//   }
//   const output = items.map(item => `${item.name} x ${item.count}`).join(', ')
//   if (output) {
//     mineflayer.bot.chat(`My inventory contains: ${output}`)
//   }
//   else {
//     mineflayer.bot.chat('My inventory is empty.')
//   }
// }

/**
 * Find the number of free slots in the bot's inventory.
 * @param mineflayer The mineflayer instance.
 * @returns The number of free slots in the bot's inventory.
 */
export function checkFreeSpace(mineflayer: Mineflayer): number {
  const totalSlots = mineflayer.bot.inventory.slots.length
  const usedSlots = mineflayer.bot.inventory.items().length
  const freeSlots = totalSlots - usedSlots
  logger.log(`You have ${freeSlots} free slots in your inventory.`)
  return freeSlots
}

/**
 * Transfer all items from the bot's inventory to a chest.
 * @param mineflayer The mineflayer instance.
 * @throws {ActionError} When no chest is nearby.
 */
export async function transferAllToChest(mineflayer: Mineflayer): Promise<void> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    logger.log(`Could not find a chest nearby.`)
    throw new ActionError('TARGET_NOT_FOUND', 'Could not find a chest nearby', { blockType: 'chest' })
  }
  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z)
  const chestContainer = await mineflayer.bot.openContainer(chest)

  for (const item of mineflayer.bot.inventory.items()) {
    await chestContainer.deposit(item.type, null, item.count)
    logger.log(`Put ${item.count} ${item.name} in the chest.`)
  }

  await chestContainer.close()
}

/**
 * Utility function to get item count in inventory
 * @param mineflayer The mineflayer instance.
 * @param itemName - The name of the item to count.
 * @returns number of items in inventory
 */
export function getItemCount(mineflayer: Mineflayer, itemName: string): number {
  return mineflayer.bot.inventory
    .items()
    .filter(item => item.name.includes(itemName))
    .reduce((acc, item) => acc + item.count, 0)
}

/**
 * Organize the bot's inventory.
 * @param mineflayer The mineflayer instance.
 */
export async function organizeInventory(mineflayer: Mineflayer): Promise<void> {
  const items = mineflayer.bot.inventory.items()
  if (items.length === 0) {
    logger.log(`Inventory is empty, nothing to organize.`)
    return
  }

  for (const item of items) {
    await mineflayer.bot.moveSlotItem(
      item.slot,
      mineflayer.bot.inventory.findInventoryItem(item.type, null, false)?.slot ?? item.slot,
    )
  }
  logger.log(`Inventory has been organized.`)
}
