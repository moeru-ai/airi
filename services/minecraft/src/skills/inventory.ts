import type { Mineflayer } from '../libs/mineflayer'

import { ActionError } from '../utils/errors'
import { log } from './base'
import { goToPlayer, goToPosition } from './movement'
import { getNearestBlock } from './world'

export async function equip(mineflayer: Mineflayer, itemName: string): Promise<boolean> {
  const item = mineflayer.bot.inventory.slots.find(slot => slot && slot.name === itemName)
  if (!item) {
    log(mineflayer, `You do not have any ${itemName} to equip.`)
    return false
  }

  if (itemName.includes('leggings')) {
    await mineflayer.bot.equip(item, 'legs')
  }
  else if (itemName.includes('boots')) {
    await mineflayer.bot.equip(item, 'feet')
  }
  else if (itemName.includes('helmet')) {
    await mineflayer.bot.equip(item, 'head')
  }
  else if (itemName.includes('chestplate') || itemName.includes('elytra')) {
    await mineflayer.bot.equip(item, 'torso')
  }
  else if (itemName.includes('shield')) {
    await mineflayer.bot.equip(item, 'off-hand')
  }
  else {
    await mineflayer.bot.equip(item, 'hand')
  }

  log(mineflayer, `Equipped ${itemName}.`)
  return true
}

export async function discard(mineflayer: Mineflayer, itemName: string, num = -1): Promise<boolean> {
  let discarded = 0

  while (true) {
    const item = mineflayer.bot.inventory.items().find(item => item.name === itemName)
    if (!item) {
      break
    }

    const toDiscard = num === -1 ? item.count : Math.min(num - discarded, item.count)
    await mineflayer.bot.toss(item.type, null, toDiscard)
    discarded += toDiscard

    if (num !== -1 && discarded >= num) {
      break
    }
  }

  if (discarded === 0) {
    log(mineflayer, `You do not have any ${itemName} to discard.`)
    return false
  }

  log(mineflayer, `Discarded ${discarded} ${itemName}.`)
  return true
}

export async function putInChest(mineflayer: Mineflayer, itemName: string, num = -1): Promise<boolean> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    log(mineflayer, 'Could not find a chest nearby.')
    return false
  }

  const item = mineflayer.bot.inventory.items().find(item => item.name === itemName)
  if (!item) {
    log(mineflayer, `You do not have any ${itemName} to put in the chest.`)
    return false
  }

  const toPut = num === -1 ? item.count : Math.min(num, item.count)
  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z, 2)

  const chestContainer = await mineflayer.bot.openContainer(chest)
  await chestContainer.deposit(item.type, null, toPut)
  await chestContainer.close()

  log(mineflayer, `Successfully put ${toPut} ${itemName} in the chest.`)
  return true
}

export async function takeFromChest(mineflayer: Mineflayer, itemName: string, num = -1): Promise<boolean> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    log(mineflayer, 'Could not find a chest nearby.')
    return false
  }

  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z, 2)
  const chestContainer = await mineflayer.bot.openContainer(chest)

  const item = chestContainer.containerItems().find(item => item.name === itemName)
  if (!item) {
    log(mineflayer, `Could not find any ${itemName} in the chest.`)
    await chestContainer.close()
    return false
  }

  const toTake = num === -1 ? item.count : Math.min(num, item.count)
  await chestContainer.withdraw(item.type, null, toTake)
  await chestContainer.close()

  log(mineflayer, `Successfully took ${toTake} ${itemName} from the chest.`)
  return true
}

export async function viewChest(mineflayer: Mineflayer): Promise<boolean> {
  const chest = getNearestBlock(mineflayer, 'chest', 32)
  if (!chest) {
    log(mineflayer, 'Could not find a chest nearby.')
    return false
  }

  await goToPosition(mineflayer, chest.position.x, chest.position.y, chest.position.z, 2)
  const chestContainer = await mineflayer.bot.openContainer(chest)
  const items = chestContainer.containerItems()

  if (items.length === 0) {
    log(mineflayer, 'The chest is empty.')
  }
  else {
    log(mineflayer, 'The chest contains:')
    for (const item of items) {
      log(mineflayer, `${item.count} ${item.name}`)
    }
  }

  await chestContainer.close()
  return true
}

/**
 * Consume (eat/drink) an item from the bot's inventory.
 * @param mineflayer The mineflayer instance.
 * @param itemName The name of the item to consume.
 * @throws {ActionError} When the item is not found in inventory.
 */
export async function consume(mineflayer: Mineflayer, itemName = ''): Promise<void> {
  const item = mineflayer.bot.inventory.items().find(item => itemName ? item.name === itemName : item.name.includes('food'))

  if (!item) {
    const name = itemName || 'food'
    log(mineflayer, `You do not have any ${name} to eat.`)
    throw new ActionError('ITEM_NOT_FOUND', `You do not have any ${name} to eat`, { item: name })
  }

  await mineflayer.bot.equip(item, 'hand')
  await mineflayer.bot.consume()
  log(mineflayer, `Consumed ${item.name}.`)
}

export async function giveToPlayer(
  mineflayer: Mineflayer,
  itemType: string,
  username: string,
  num = 1,
): Promise<void> {
  const player = mineflayer.bot.players[username]?.entity
  if (!player) {
    log(mineflayer, `Could not find ${username}.`)
    throw new ActionError('TARGET_NOT_FOUND', `Could not find ${username}`, { target: username })
  }

  // Move to player position
  await goToPlayer(mineflayer, username, 3)

  // Look at player before dropping items
  await mineflayer.bot.lookAt(player.position)

  // Drop items and wait for collection
  await dropItemsAndWaitForCollection(mineflayer, itemType, username, num)
}

async function dropItemsAndWaitForCollection(
  mineflayer: Mineflayer,
  itemType: string,
  username: string,
  num: number,
): Promise<void> {
  if (!await discard(mineflayer, itemType, num)) {
    throw new ActionError('ITEM_NOT_FOUND', `You do not have any ${itemType} to give`, { item: itemType })
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      mineflayer.bot.removeListener('playerCollect', onCollect)
      mineflayer.removeListener('interrupt', onInterrupt)
    }

    const finishResolve = () => {
      if (settled)
        return
      settled = true
      cleanup()
      resolve()
    }

    const finishReject = (error: unknown) => {
      if (settled)
        return
      settled = true
      cleanup()
      reject(error)
    }

    const timeout = setTimeout(() => {
      clearTimeout(timeout)
      finishReject(new ActionError('INTERRUPTED', `Failed to give ${itemType} to ${username}, it was never received`, { item: itemType }))
    }, 3000)

    const onCollect = (collector: any, _collected: any) => {
      if (collector.username === username) {
        log(mineflayer, `${username} received ${itemType}.`)
        clearTimeout(timeout)
        finishResolve()
      }
    }

    const onInterrupt = () => {
      clearTimeout(timeout)
      finishReject(new ActionError('INTERRUPTED', `Failed to give ${itemType} to ${username}, action was cancelled`, { item: itemType }))
    }

    mineflayer.bot.once('playerCollect', onCollect)
    mineflayer.once('interrupt', onInterrupt)
  })
}
