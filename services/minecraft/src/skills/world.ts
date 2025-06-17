import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'
import type { Vec3 } from 'vec3'

import type { Mineflayer } from '../libs/mineflayer'

import pf from 'mineflayer-pathfinder'

import * as mc from '../utils/mcdata'

export function getNearestFreeSpace(
  mineflayer: Mineflayer,
  size: number = 1,
  distance: number = 8,
): Vec3 | undefined {
  /**
   * Get the nearest empty space with solid blocks beneath it of the given size.
   * @param {number} size - The (size x size) of the space to find, default 1.
   * @param {number} distance - The maximum distance to search, default 8.
   * @returns {Vec3} - The south west corner position of the nearest free space.
   * @example
   * let position = world.getNearestFreeSpace( 1, 8);
   */
  const empty_pos = mineflayer.bot.findBlocks({
    matching: (block: Block | null) => {
      return block !== null && block.name === 'air'
    },
    maxDistance: distance,
    count: 1000,
  })

  for (let i = 0; i < empty_pos.length; i++) {
    let empty = true
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const top = mineflayer.bot.blockAt(empty_pos[i].offset(x, 0, z))
        const bottom = mineflayer.bot.blockAt(empty_pos[i].offset(x, -1, z))
        if (
          !top
          || top.name !== 'air'
          || !bottom
          || (bottom.drops?.length ?? 0) === 0
          || !bottom.diggable
        ) {
          empty = false
          break
        }
      }
      if (!empty)
        break
    }
    if (empty) {
      return empty_pos[i]
    }
  }
  return undefined
}

export function getNearestBlocks(mineflayer: Mineflayer, blockTypes: string[] | string | null = null, distance: number = 16, count: number = 10000): Block[] {
  const blockIds = blockTypes === null
    ? mc.getAllBlockIds(['air'])
    : (Array.isArray(blockTypes) ? blockTypes : [blockTypes]).map(mc.getBlockId).filter((id): id is number => id !== null)

  const positions = mineflayer.bot.findBlocks({ matching: blockIds, maxDistance: distance, count })

  return positions
    .map((pos) => {
      const block = mineflayer.bot.blockAt(pos)
      const dist = pos.distanceTo(mineflayer.bot.entity.position)
      return block ? { block, distance: dist } : null
    })
    .filter((item): item is { block: Block, distance: number } => item !== null)
    .sort((a, b) => a.distance - b.distance)
    .map(item => item.block)
}

export function getNearestBlock(mineflayer: Mineflayer, blockType: string, distance: number = 16): Block | null {
  const blocks = getNearestBlocks(mineflayer, blockType, distance, 1)
  return blocks[0] || null
}

export function getNearbyEntities(mineflayer: Mineflayer, maxDistance: number = 16): Entity[] {
  return Object.values(mineflayer.bot.entities)
    .filter((entity): entity is Entity =>
      entity !== null
      && entity.position.distanceTo(mineflayer.bot.entity.position) <= maxDistance,
    )
    .sort((a, b) =>
      a.position.distanceTo(mineflayer.bot.entity.position)
      - b.position.distanceTo(mineflayer.bot.entity.position),
    )
}

export function getNearestEntityWhere(mineflayer: Mineflayer, predicate: (entity: Entity) => boolean, maxDistance: number = 16): Entity | null {
  return mineflayer.bot.nearestEntity(entity =>
    predicate(entity)
    && mineflayer.bot.entity.position.distanceTo(entity.position) < maxDistance,
  )
}

export function getNearbyPlayers(mineflayer: Mineflayer, maxDistance: number = 16): Entity[] {
  return getNearbyEntities(mineflayer, maxDistance)
    .filter(entity =>
      entity.type === 'player'
      && entity.username !== mineflayer.bot.username,
    )
}

export function getInventoryStacks(mineflayer: Mineflayer): Item[] {
  return mineflayer.bot.inventory.items().filter((item): item is Item => item !== null)
}

export function getInventoryCounts(mineflayer: Mineflayer): Record<string, number> {
  return getInventoryStacks(mineflayer).reduce((counts, item) => {
    counts[item.name] = (counts[item.name] || 0) + item.count
    return counts
  }, {} as Record<string, number>)
}

export function getCraftableItems(mineflayer: Mineflayer): string[] {
  const table = getNearestBlock(mineflayer, 'crafting_table')
    || getInventoryStacks(mineflayer).find(item => item.name === 'crafting_table')
  return mc.getAllItems()
    .filter(item => mineflayer.bot.recipesFor(item.id, null, 1, table as Block | null).length > 0)
    .map(item => item.name)
}

export function getPosition(mineflayer: Mineflayer): Vec3 {
  return mineflayer.bot.entity.position
}

export function getNearbyEntityTypes(mineflayer: Mineflayer): string[] {
  return [...new Set(
    getNearbyEntities(mineflayer, 16)
      .map(mob => mob.name)
      .filter((name): name is string => name !== undefined),
  )]
}

export function getNearbyPlayerNames(mineflayer: Mineflayer): string[] {
  return [...new Set(
    getNearbyPlayers(mineflayer, 64)
      .map(player => player.username)
      .filter((name): name is string =>
        name !== undefined
        && name !== mineflayer.bot.username,
      ),
  )]
}

export function getNearbyBlockTypes(mineflayer: Mineflayer, distance: number = 16): string[] {
  return [...new Set(
    getNearestBlocks(mineflayer, null, distance)
      .map(block => block.name),
  )]
}

export async function isClearPath(mineflayer: Mineflayer, target: Entity): Promise<boolean> {
  const movements = new pf.Movements(mineflayer.bot)
  movements.canDig = false
  // movements.canPlaceOn = false // TODO: fix this

  const goal = new pf.goals.GoalNear(
    target.position.x,
    target.position.y,
    target.position.z,
    1,
  )

  const path = await mineflayer.bot.pathfinder.getPathTo(movements, goal, 100)
  return path.status === 'success'
}

export function shouldPlaceTorch(mineflayer: Mineflayer): boolean {
  // if (!mineflayer.bot.modes.isOn('torch_placing') || mineflayer.bot.interrupt_code) {
  //   return false
  // }

  const pos = getPosition(mineflayer)
  const nearestTorch = getNearestBlock(mineflayer, 'torch', 6)
    || getNearestBlock(mineflayer, 'wall_torch', 6)

  if (nearestTorch) {
    return false
  }

  const block = mineflayer.bot.blockAt(pos)
  const hasTorch = mineflayer.bot.inventory.items().some(item => item?.name === 'torch')

  return Boolean(hasTorch && block?.name === 'air')
}

export function getBiomeName(mineflayer: Mineflayer): string {
  const biomeId = mineflayer.bot.world.getBiome(mineflayer.bot.entity.position)
  return mc.getAllBiomes()[biomeId].name
}
