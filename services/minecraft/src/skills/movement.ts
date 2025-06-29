import type { Entity } from 'prismarine-entity'

import type { Mineflayer } from '../libs/mineflayer'

import pathfinder from 'mineflayer-pathfinder'

import { sleep } from '@moeru/std'
import { randomInt } from 'es-toolkit'
import { Vec3 } from 'vec3'

import { useLogger } from '../utils/logger'
import { log } from './base'
import { getNearestBlock, getNearestEntityWhere } from './world'

const logger = useLogger()
const { goals, Movements } = pathfinder

export async function goToPosition(
  mineflayer: Mineflayer,
  x: number,
  y: number,
  z: number,
  minDistance = 2,
): Promise<boolean> {
  if (x == null || y == null || z == null) {
    log(mineflayer, `Missing coordinates, given x:${x} y:${y} z:${z}`)
    return false
  }

  if (mineflayer.allowCheats) {
    mineflayer.bot.chat(`/tp @s ${x} ${y} ${z}`)
    log(mineflayer, `Teleported to ${x}, ${y}, ${z}.`)
    return true
  }

  await mineflayer.bot.pathfinder.goto(new goals.GoalNear(x, y, z, minDistance))
  log(mineflayer, `You have reached ${x}, ${y}, ${z}.`)
  return true
}

export async function goToNearestBlock(
  mineflayer: Mineflayer,
  blockType: string,
  minDistance = 2,
  range = 64,
): Promise<boolean> {
  const MAX_RANGE = 512
  if (range > MAX_RANGE) {
    log(mineflayer, `Maximum search range capped at ${MAX_RANGE}.`)
    range = MAX_RANGE
  }

  const block = getNearestBlock(mineflayer, blockType, range)
  if (!block) {
    log(mineflayer, `Could not find any ${blockType} in ${range} blocks.`)
    return false
  }

  log(mineflayer, `Found ${blockType} at ${block.position}.`)
  await goToPosition(mineflayer, block.position.x, block.position.y, block.position.z, minDistance)
  return true
}

export async function goToNearestEntity(
  mineflayer: Mineflayer,
  entityType: string,
  minDistance = 2,
  range = 64,
): Promise<boolean> {
  const entity = getNearestEntityWhere(
    mineflayer,
    entity => entity.name === entityType,
    range,
  )

  if (!entity) {
    log(mineflayer, `Could not find any ${entityType} in ${range} blocks.`)
    return false
  }

  const distance = mineflayer.bot.entity.position.distanceTo(entity.position)
  log(mineflayer, `Found ${entityType} ${distance} blocks away.`)
  await goToPosition(
    mineflayer,
    entity.position.x,
    entity.position.y,
    entity.position.z,
    minDistance,
  )
  return true
}

export async function goToPlayer(
  mineflayer: Mineflayer,
  username: string,
  distance = 3,
): Promise<boolean> {
  if (mineflayer.allowCheats) {
    mineflayer.bot.chat(`/tp @s ${username}`)
    log(mineflayer, `Teleported to ${username}.`)
    return true
  }

  const player = mineflayer.bot.players[username]?.entity
  if (!player) {
    log(mineflayer, `Could not find ${username}.`)
    return false
  }

  await mineflayer.bot.pathfinder.goto(new goals.GoalFollow(player, distance))
  log(mineflayer, `You have reached ${username}.`)
  return true
}

export async function followPlayer(
  mineflayer: Mineflayer,
  username: string,
  distance = 4,
): Promise<boolean> {
  const player = mineflayer.bot.players[username]?.entity
  if (!player) {
    return false
  }

  log(mineflayer, `I am now actively following player ${username}.`)

  const movements = new Movements(mineflayer.bot)
  mineflayer.bot.pathfinder.setMovements(movements)
  mineflayer.bot.pathfinder.setGoal(new goals.GoalFollow(player, distance), true)

  mineflayer.once('interrupt', () => {
    mineflayer.bot.pathfinder.stop()
  })

  return true
}

export async function moveAway(mineflayer: Mineflayer, distance: number): Promise<boolean> {
  try {
    const pos = mineflayer.bot.entity.position
    let newX: number = 0
    let newZ: number = 0
    let suitableGoal = false

    while (!suitableGoal) {
      const rand1 = randomInt(0, 2)
      const rand2 = randomInt(0, 2)
      const bigRand1 = randomInt(0, 101)
      const bigRand2 = randomInt(0, 101)

      newX = Math.floor(
        pos.x + ((distance * bigRand1) / 100) * (rand1 ? 1 : -1),
      )
      newZ = Math.floor(
        pos.z + ((distance * bigRand2) / 100) * (rand2 ? 1 : -1),
      )

      const block = mineflayer.bot.blockAt(new Vec3(newX, pos.y - 1, newZ))

      if (block?.name !== 'water' && block?.name !== 'lava') {
        suitableGoal = true
      }
    }

    const farGoal = new pathfinder.goals.GoalXZ(newX, newZ)

    await mineflayer.bot.pathfinder.goto(farGoal)
    const newPos = mineflayer.bot.entity.position
    logger.log(`I moved away from nearest entity to ${newPos}.`)
    await sleep(500)
    return true
  }
  catch (err) {
    logger.log(`I failed to move away: ${(err as Error).message}`)
    return false
  }
}

export async function moveAwayFromEntity(
  mineflayer: Mineflayer,
  entity: Entity,
  distance = 16,
): Promise<boolean> {
  const goal = new goals.GoalFollow(entity, distance)
  const invertedGoal = new goals.GoalInvert(goal)
  await mineflayer.bot.pathfinder.goto(invertedGoal)
  return true
}

export async function stay(mineflayer: Mineflayer, seconds = 30): Promise<boolean> {
  const start = Date.now()
  const targetTime = seconds === -1 ? Infinity : start + seconds * 1000

  while (Date.now() < targetTime) {
    await sleep(500)
  }

  log(mineflayer, `I stayed for ${(Date.now() - start) / 1000} seconds.`)
  return true
}

export async function goToBed(mineflayer: Mineflayer): Promise<boolean> {
  const beds = mineflayer.bot.findBlocks({
    matching: block => block.name.includes('bed'),
    maxDistance: 32,
    count: 1,
  })

  if (beds.length === 0) {
    log(mineflayer, 'I could not find a bed to sleep in.')
    return false
  }

  const loc = beds[0]
  await goToPosition(mineflayer, loc.x, loc.y, loc.z)

  const bed = mineflayer.bot.blockAt(loc)
  if (!bed) {
    log(mineflayer, 'I could not find a bed to sleep in.')
    return false
  }

  await mineflayer.bot.sleep(bed)
  log(mineflayer, 'I am in bed.')

  while (mineflayer.bot.isSleeping) {
    await sleep(500)
  }

  log(mineflayer, 'I have woken up.')
  return true
}
