import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'

import type { Mineflayer } from '../../libs/mineflayer'

import pathfinder from 'mineflayer-pathfinder'

import { sleep } from '@moeru/std'
import { Vec3 } from 'vec3'

import { ActionError } from '../../utils/errors'
import { useLogger } from '../../utils/logger'
import { McData } from '../../utils/mcdata'
import { goToPosition } from '../movement'
import { patchedGoto } from '../patched-goto'

const logger = useLogger()

/**
 * Place a block at the given position.
 * @param mineflayer The mineflayer instance.
 * @param blockType The type of block to place.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @param z The z coordinate.
 * @param placeOn The side to place the block on.
 * @throws {ActionError} When the block is not in inventory or cannot be placed.
 */
export async function placeBlock(
  mineflayer: Mineflayer,
  blockType: string,
  x: number,
  y: number,
  z: number,
  placeOn: string = 'bottom',
): Promise<void> {
  // if (!gameData.getBlockId(blockType)) {
  //   logger.log(`Invalid block type: ${blockType}.`);
  //   return false;
  // }

  const targetDest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z))

  let block = mineflayer.bot.inventory
    .items()
    .find(item => item.name.includes(blockType))
  if (!block && mineflayer.bot.game.gameMode === 'creative') {
    const mcData = McData.fromBot(mineflayer.bot)
    const itemId = mcData.getItemId(blockType)
    if (itemId) {
      const item = await import('prismarine-item')
      const Item = item.default(mineflayer.bot.version)
      await mineflayer.bot.creative.setInventorySlot(36, new Item(itemId, 1)) // 36 is first hotbar slot
    }
    block = mineflayer.bot.inventory.items().find(item => item.name.includes(blockType))
  }
  if (!block) {
    logger.log(`Don't have any ${blockType} to place.`)
    throw new ActionError('ITEM_NOT_FOUND', `Don't have any ${blockType} to place`, { item: blockType })
  }

  const targetBlock = mineflayer.bot.blockAt(targetDest)
  if (!targetBlock) {
    logger.log(`No block found at ${targetDest}.`)
    throw new ActionError('TARGET_NOT_FOUND', `No block found at ${targetDest}`, { position: targetDest })
  }

  if (targetBlock.name === blockType) {
    logger.log(`${blockType} already at ${targetBlock.position}.`)
    throw new ActionError('PLACEMENT_FAILED', `${blockType} already at ${targetBlock.position}`, { blockType, position: targetBlock.position })
  }

  const emptyBlocks = [
    'air',
    'water',
    'lava',
    'grass',
    'tall_grass',
    'snow',
    'dead_bush',
    'fern',
  ]
  if (!emptyBlocks.includes(targetBlock.name)) {
    logger.log(
      `${targetBlock.name} is in the way at ${targetBlock.position}.`,
    )
    await breakBlockAt(mineflayer, x, y, z)
    await sleep(200) // Wait for block to break
  }

  // Determine the build-off block and face vector
  const dirMap: { [key: string]: Vec3 } = {
    top: new Vec3(0, 1, 0),
    bottom: new Vec3(0, -1, 0),
    north: new Vec3(0, 0, -1),
    south: new Vec3(0, 0, 1),
    east: new Vec3(1, 0, 0),
    west: new Vec3(-1, 0, 0),
  }

  const dirs: Vec3[] = []
  if (placeOn === 'side') {
    dirs.push(dirMap.north, dirMap.south, dirMap.east, dirMap.west)
  }
  else if (dirMap[placeOn]) {
    dirs.push(dirMap[placeOn])
  }
  else {
    dirs.push(dirMap.bottom)
    logger.log(`Unknown placeOn value "${placeOn}". Defaulting to bottom.`)
  }

  // Add remaining directions
  dirs.push(...Object.values(dirMap).filter(d => !dirs.includes(d)))

  let buildOffBlock: Block | null = null
  let faceVec: Vec3 | null = null

  for (const d of dirs) {
    const adjacentBlock = mineflayer.bot.blockAt(targetDest.plus(d))
    if (adjacentBlock && !emptyBlocks.includes(adjacentBlock.name)) {
      buildOffBlock = adjacentBlock
      faceVec = d.scaled(-1) // Invert direction
      break
    }
  }

  if (!buildOffBlock || !faceVec) {
    logger.log(
      `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`,
    )
    throw new ActionError('PLACEMENT_FAILED', `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on`, { blockType, position: targetBlock.position })
  }

  // Move away if too close
  const pos = mineflayer.bot.entity.position
  const posAbove = pos.offset(0, 1, 0)
  const dontMoveFor = [
    'torch',
    'redstone_torch',
    'redstone',
    'lever',
    'button',
    'rail',
    'detector_rail',
    'powered_rail',
    'activator_rail',
    'tripwire_hook',
    'tripwire',
    'water_bucket',
  ]
  if (
    !dontMoveFor.includes(blockType)
    && (pos.distanceTo(targetBlock.position) < 1
      || posAbove.distanceTo(targetBlock.position) < 1)
  ) {
    const goal = new pathfinder.goals.GoalInvert(
      new pathfinder.goals.GoalNear(
        targetBlock.position.x,
        targetBlock.position.y,
        targetBlock.position.z,
        2,
      ),
    )
    // bot.pathfinder.setMovements(new pf.Movements(bot));
    await patchedGoto(mineflayer.bot, goal)
  }

  // Move closer if too far
  if (mineflayer.bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
    await goToPosition(
      mineflayer,
      targetBlock.position.x,
      targetBlock.position.y,
      targetBlock.position.z,
      4,
    )
  }

  await mineflayer.bot.equip(block, 'hand')
  await mineflayer.bot.lookAt(buildOffBlock.position)
  await sleep(500)

  try {
    await mineflayer.bot.placeBlock(buildOffBlock, faceVec)
    logger.log(`Placed ${blockType} at ${targetDest}.`)
    await sleep(200)
  }
  catch (err) {
    if (err instanceof Error) {
      logger.log(
        `Failed to place ${blockType} at ${targetDest}: ${err.message}`,
      )
      throw new ActionError('PLACEMENT_FAILED', `Failed to place ${blockType} at ${targetDest}: ${err.message}`, { blockType, position: targetDest, error: err.message })
    }
    else {
      logger.log(
        `Failed to place ${blockType} at ${targetDest}: ${String(err)}`,
      )
      throw new ActionError('PLACEMENT_FAILED', `Failed to place ${blockType} at ${targetDest}: ${String(err)}`, { blockType, position: targetDest, error: String(err) })
    }
  }
}

/**
 * Break a block at the given position.
 * @param mineflayer The mineflayer instance.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @param z The z coordinate.
 * @throws {ActionError} When the block is unbreakable or missing tools.
 */
export async function breakBlockAt(
  mineflayer: Mineflayer,
  x: number,
  y: number,
  z: number,
): Promise<void> {
  if (x == null || y == null || z == null) {
    throw new ActionError('UNKNOWN', 'Invalid position to break block at')
  }

  // Calculate the block position by rounding down the coordinates
  const blockPos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z))
  logger.log(`Attempting to break block at ${blockPos}`)

  // Log bot position
  const botPos = mineflayer.bot.entity.position
  logger.log(`Bot position: ${botPos.x.toFixed(1)}, ${botPos.y.toFixed(1)}, ${botPos.z.toFixed(1)}`)

  // Calculate the actual block under the bot's feet
  const feetPos = new Vec3(Math.floor(botPos.x), Math.floor(botPos.y - 1), Math.floor(botPos.z))
  logger.log(`Actual block under feet: ${feetPos}`)

  // Use the provided position directly
  const targetPos = blockPos

  const block = mineflayer.bot.blockAt(targetPos)
  if (!block) {
    logger.log(`No block found at position ${targetPos}.`)
    throw new ActionError('TARGET_NOT_FOUND', `No block found at position ${targetPos}`, { position: targetPos })
  }

  logger.log(`Found block: ${block.name} at ${block.position}`)

  if (block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
    const distance = mineflayer.bot.entity.position.distanceTo(block.position)
    logger.log(`Distance to block: ${distance.toFixed(2)}`)

    // Log game mode
    logger.log(`Game mode: ${mineflayer.bot.game.gameMode}`)

    if (distance > 4.5) {
      logger.log(`Moving to block position ${targetPos}`)
      await goToPosition(mineflayer, targetPos.x, targetPos.y, targetPos.z)
    }

    if (mineflayer.bot.game.gameMode !== 'creative') {
      logger.log(`Equipping tool for block: ${block.name}`)
      await mineflayer.bot.tool.equipForBlock(block)
      const heldItem = mineflayer.bot.heldItem
      logger.log(`Held item: ${heldItem?.name || 'none'}`)
      const itemId = heldItem ? heldItem.type : null
      logger.log(`Can harvest block: ${block.canHarvest(itemId)}`)
      if (!block.canHarvest(itemId)) {
        logger.log(`Don't have right tools to break ${block.name}.`)
        throw new ActionError('RESOURCE_MISSING', `Don't have right tools to break ${block.name}`, { blockType: block.name })
      }
    }

    logger.log(`Can dig block: ${mineflayer.bot.canDigBlock(block)}`)
    if (!mineflayer.bot.canDigBlock(block)) {
      logger.log(`Cannot break ${block.name} at ${targetPos}.`)
      throw new ActionError('UNKNOWN', `Cannot break ${block.name} at ${targetPos}`, { blockType: block.name, position: targetPos })
    }

    logger.log(`Looking at block ${block.position}`)
    await mineflayer.bot.lookAt(block.position, true) // Ensure the bot has finished turning
    await sleep(500)

    try {
      logger.log(`Starting to dig block ${block.name} at ${block.position}`)
      // Increase digging time to ensure block is fully broken
      await mineflayer.bot.dig(block, true)
      await sleep(1000) // Wait for block to break
      logger.log(
        `Successfully broke ${block.name} at x:${targetPos.x.toFixed(1)}, y:${targetPos.y.toFixed(
          1,
        )}, z:${targetPos.z.toFixed(1)}.`,
      )

      // Verify block is actually broken
      const afterBlock = mineflayer.bot.blockAt(targetPos)
      logger.log(`Block after digging: ${afterBlock?.name || 'air'}`)

      // If block is still there, try again
      if (afterBlock && afterBlock.name !== 'air') {
        logger.log(`Block still exists, trying again...`)
        await mineflayer.bot.lookAt(afterBlock.position, true)
        await sleep(500)
        await mineflayer.bot.dig(afterBlock, true)
        await sleep(1000)
        const afterBlock2 = mineflayer.bot.blockAt(targetPos)
        logger.log(`Block after second attempt: ${afterBlock2?.name || 'air'}`)
      }
    }
    catch (err) {
      console.error(`Failed to dig the block: ${err}`)
      throw new ActionError('UNKNOWN', `Failed to dig the block: ${String(err)}`, { blockType: block.name, position: targetPos, error: String(err) })
    }
  }
  else {
    logger.log(
      `Skipping block at x:${targetPos.x.toFixed(1)}, y:${targetPos.y.toFixed(1)}, z:${targetPos.z.toFixed(
        1,
      )} because it is ${block.name}.`,
    )
    throw new ActionError('UNKNOWN', `Cannot break ${block.name} block`, { blockType: block.name, position: targetPos })
  }
}

/**
 * Activate the nearest block of the given type.
 * @param mineflayer The mineflayer instance.
 * @param type The type of block to activate.
 * @throws {ActionError} When the block is not found or cannot be activated.
 */
export async function activateNearestBlock(mineflayer: Mineflayer, type: string): Promise<void> {
  const block = mineflayer.bot.findBlock({
    matching: b => b.name === type,
    maxDistance: 16,
  })
  if (!block) {
    logger.log(`Could not find any ${type} to activate.`)
    throw new ActionError('TARGET_NOT_FOUND', `Could not find any ${type} to activate`, { blockType: type })
  }
  if (mineflayer.bot.entity.position.distanceTo(block.position) > 4.5) {
    const pos = block.position
    // bot.pathfinder.setMovements(new pf.Movements(bot));
    await patchedGoto(mineflayer.bot, new pathfinder.goals.GoalNear(pos.x, pos.y, pos.z, 4))
  }
  await mineflayer.bot.activateBlock(block)
  logger.log(
    `Activated ${type} at x:${block.position.x.toFixed(
      1,
    )}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}.`,
  )
}

/**
 * Till the soil and sow seeds at the given position.
 * @param mineflayer The mineflayer instance.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @param z The z coordinate.
 * @param seedType The type of seed to sow.
 * @throws {ActionError} When the block cannot be tilled or seeds are missing.
 */
export async function tillAndSow(
  mineflayer: Mineflayer,
  x: number,
  y: number,
  z: number,
  seedType: string | null = null,
): Promise<void> {
  x = Math.round(x)
  y = Math.round(y)
  z = Math.round(z)
  const blockPos = new Vec3(x, y, z)
  const block = mineflayer.bot.blockAt(blockPos)
  if (!block) {
    logger.log(`No block found at ${blockPos}.`)
    throw new ActionError('TARGET_NOT_FOUND', `No block found at ${blockPos}`, { position: blockPos })
  }
  if (
    block.name !== 'grass_block'
    && block.name !== 'dirt'
    && block.name !== 'farmland'
  ) {
    logger.log(`Cannot till ${block.name}, must be grass_block or dirt.`)
    throw new ActionError('UNKNOWN', `Cannot till ${block.name}, must be grass_block or dirt`, { blockType: block.name })
  }
  const above = mineflayer.bot.blockAt(blockPos.offset(0, 1, 0))
  if (above && above.name !== 'air') {
    logger.log(`Cannot till, there is ${above.name} above the block.`)
    throw new ActionError('UNKNOWN', `Cannot till, there is ${above.name} above the block`, { blockType: above.name })
  }
  // Move closer if too far
  if (mineflayer.bot.entity.position.distanceTo(block.position) > 4.5) {
    await goToPosition(mineflayer, x, y, z, 4)
  }
  if (block.name !== 'farmland') {
    const hoe = mineflayer.bot.inventory.items().find(item => item.name.includes('hoe'))
    if (!hoe) {
      logger.log(`Cannot till, no hoes.`)
      throw new ActionError('RESOURCE_MISSING', 'Cannot till, no hoes', { item: 'hoe' })
    }
    await mineflayer.bot.equip(hoe, 'hand')
    await mineflayer.bot.activateBlock(block)
    logger.log(
      `Tilled block x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`,
    )
  }

  if (seedType) {
    if (seedType.endsWith('seed') && !seedType.endsWith('seeds'))
      seedType += 's' // Fixes common mistake
    const seeds = mineflayer.bot.inventory
      .items()
      .find(item => item.name.includes(seedType || 'seed'))
    if (!seeds) {
      logger.log(`No ${seedType} to plant.`)
      throw new ActionError('ITEM_NOT_FOUND', `No ${seedType} to plant`, { item: seedType })
    }
    await mineflayer.bot.equip(seeds, 'hand')
    await mineflayer.bot.placeBlock(block, new Vec3(0, -1, 0))
    logger.log(
      `Planted ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(
        1,
      )}, z:${z.toFixed(1)}.`,
    )
  }
}

/**
 * Pick up nearby items.
 * @param mineflayer The mineflayer instance.
 * @param distance The maximum distance to pick up items. Default is 8.
 */
export async function pickupNearbyItems(
  mineflayer: Mineflayer,
  distance = 8,
): Promise<void> {
  const getNearestItem = (bot: Bot) =>
    bot.nearestEntity(
      entity =>
        entity.name === 'item'
        && entity.onGround
        && bot.entity.position.distanceTo(entity.position) < distance,
    )
  let nearestItem = getNearestItem(mineflayer.bot)

  let pickedUp = 0
  while (nearestItem) {
    // bot.pathfinder.setMovements(new pf.Movements(bot));
    await patchedGoto(mineflayer.bot, new pathfinder.goals.GoalFollow(nearestItem, 0.8))
    await sleep(500)
    const prev = nearestItem
    nearestItem = getNearestItem(mineflayer.bot)
    if (prev === nearestItem) {
      break
    }
    pickedUp++
  }
  logger.log(`Picked up ${pickedUp} items.`)
}
