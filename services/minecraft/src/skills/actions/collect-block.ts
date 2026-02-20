import type { Block } from 'prismarine-block'

import type { Mineflayer } from '../../libs/mineflayer'

import pathfinder from 'mineflayer-pathfinder'

import { ActionError } from '../../utils/errors'
import { useLogger } from '../../utils/logger'
import { breakBlockAt } from '../blocks'
import { patchedGoto } from '../patched-goto'
import { getNearestBlocks } from '../world'
import { expandBlockAliases } from './block-type-normalizer'
import { ensurePickaxe } from './ensure'
import { pickupNearbyItems } from './world-interactions'

const logger = useLogger()

function isMessagable(err: unknown): err is { message: string } {
  return (err instanceof Error || (typeof err === 'object' && !!err && 'message' in err && typeof err.message === 'string'))
}

export async function collectBlock(
  mineflayer: Mineflayer,
  blockType: string,
  num = 1,
  range = 16,
): Promise<number> {
  if (num < 1) {
    logger.log(`Invalid number of blocks to collect: ${num}.`)
    return 0
  }

  const normalizedBlockType = blockType.trim().toLowerCase()
  const blockTypes = new Set(expandBlockAliases(normalizedBlockType))

  // Add block variants
  if (
    [
      'coal',
      'diamond',
      'emerald',
      'iron',
      'gold',
      'lapis_lazuli',
      'redstone',
      'copper',
    ].includes(normalizedBlockType)
  ) {
    blockTypes.add(`${normalizedBlockType}_ore`)
    blockTypes.add(`deepslate_${normalizedBlockType}_ore`)
  }
  if (normalizedBlockType.endsWith('ore')) {
    blockTypes.add(`deepslate_${normalizedBlockType}`)
  }
  if (normalizedBlockType === 'dirt') {
    blockTypes.add('grass_block')
  }

  let collected = 0

  while (collected < num) {
    const blocks = getNearestBlocks(mineflayer, [...blockTypes], range)

    if (blocks.length === 0) {
      if (collected === 0)
        logger.log(`No ${blockType} nearby to collect.`)
      else logger.log(`No more ${blockType} nearby to collect.`)
      break
    }

    const block = blocks[0]

    try {
      // Equip appropriate tool
      if (mineflayer.bot.game.gameMode !== 'creative') {
        await mineflayer.bot.tool.equipForBlock(block)
        let itemId = mineflayer.bot.heldItem ? mineflayer.bot.heldItem.type : null
        if (!block.canHarvest(itemId)) {
          logger.log(`Don't have right tools to harvest ${block.name}.`)
          if (block.name.includes('ore') || block.name.includes('stone')) {
            await ensurePickaxe(mineflayer)
            // Re-equip after crafting/ensuring tool and re-check harvestability.
            await mineflayer.bot.tool.equipForBlock(block)
            itemId = mineflayer.bot.heldItem ? mineflayer.bot.heldItem.type : null
          }
          if (!block.canHarvest(itemId)) {
            throw new ActionError(
              'RESOURCE_MISSING',
              `Don't have right tools to harvest ${block.name}`,
              { blockType: block.name },
            )
          }
        }
      }

      // Implement vein mining
      const veinBlocks = findVeinBlocks(mineflayer, block, 100, range, 1)

      for (const veinBlock of veinBlocks) {
        if (collected >= num)
          break

        // Move to the block using pathfinder
        const goal = new pathfinder.goals.GoalGetToBlock(
          veinBlock.position.x,
          veinBlock.position.y,
          veinBlock.position.z,
        )
        const navResult = await patchedGoto(mineflayer.bot, goal)
        if (!navResult.ok) {
          logger.log(`Failed to reach ${blockType} block: ${navResult.reason} — ${navResult.message}`)
          continue
        }

        // Break the block and collect drops
        await mineAndCollect(mineflayer, veinBlock)

        collected++

        // Check if inventory is full
        if (mineflayer.bot.inventory.emptySlotCount() === 0) {
          logger.log('Inventory is full, cannot collect more items.')
          break
        }
      }
    }
    catch (err) {
      logger.log(`Failed to collect ${blockType}: ${err}.`)
      if (isMessagable(err) && err.message.includes('Digging aborted')) {
        break
      }

      if (err instanceof ActionError && (err.code === 'CRAFTING_FAILED' || err.code === 'RESOURCE_MISSING')) {
        // Don't get stuck in retry loop
        throw err
      }

      continue
    }
  }

  logger.log(`Collected ${collected} ${blockType}(s).`)
  return collected
}

// Helper function to mine a block and collect drops
async function mineAndCollect(mineflayer: Mineflayer, block: Block): Promise<void> {
  // Break the block
  await breakBlockAt(mineflayer, block.position.x, block.position.y, block.position.z)
  // Use your existing function to pick up nearby items
  await pickupNearbyItems(mineflayer, 5)
}

// Function to find connected blocks (vein mining)
function findVeinBlocks(
  mineflayer: Mineflayer,
  startBlock: Block,
  maxBlocks = 100,
  maxDistance = 16,
  floodRadius = 1,
): Block[] {
  const veinBlocks: Block[] = []
  const visited = new Set<string>()
  const queue: Block[] = [startBlock]

  while (queue.length > 0 && veinBlocks.length < maxBlocks) {
    const block = queue.shift()
    if (!block)
      continue
    const key = block.position.toString()

    if (visited.has(key))
      continue
    visited.add(key)

    if (block.name !== startBlock.name)
      continue
    if (block.position.distanceTo(startBlock.position) > maxDistance)
      continue

    veinBlocks.push(block)

    // Check neighboring blocks within floodRadius
    for (let dx = -floodRadius; dx <= floodRadius; dx++) {
      for (let dy = -floodRadius; dy <= floodRadius; dy++) {
        for (let dz = -floodRadius; dz <= floodRadius; dz++) {
          if (dx === 0 && dy === 0 && dz === 0)
            continue // Skip the current block
          const neighborPos = block.position.offset(dx, dy, dz)
          const neighborBlock = mineflayer.bot.blockAt(neighborPos)
          if (neighborBlock && !visited.has(neighborPos.toString())) {
            queue.push(neighborBlock)
          }
        }
      }
    }
  }

  return veinBlocks
}
