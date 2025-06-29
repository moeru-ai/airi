import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'

import type { Mineflayer } from '../libs/mineflayer'

import pathfinderModel from 'mineflayer-pathfinder'

import { sleep } from '@moeru/std'

import { isHostile } from '../utils/mcdata'
import { log } from './base'
import { getNearbyEntities, getNearestEntityWhere } from './world'

const { goals } = pathfinderModel

interface WeaponItem extends Item {
  attackDamage: number
}

async function equipHighestAttack(mineflayer: Mineflayer): Promise<void> {
  const weapons = mineflayer.bot.inventory.items().filter(item =>
    item.name.includes('sword')
    || (item.name.includes('axe') && !item.name.includes('pickaxe')),
  ) as WeaponItem[]

  if (weapons.length === 0) {
    const tools = mineflayer.bot.inventory.items().filter(item =>
      item.name.includes('pickaxe')
      || item.name.includes('shovel'),
    ) as WeaponItem[]

    if (tools.length === 0)
      return

    tools.sort((a, b) => b.attackDamage - a.attackDamage)
    const tool = tools[0]
    if (tool)
      await mineflayer.bot.equip(tool, 'hand')
    return
  }

  weapons.sort((a, b) => b.attackDamage - a.attackDamage)
  const weapon = weapons[0]
  if (weapon)
    await mineflayer.bot.equip(weapon, 'hand')
}

export async function attackNearest(
  mineflayer: Mineflayer,
  mobType: string,
  kill = true,
): Promise<boolean> {
  const mob = getNearbyEntities(mineflayer, 24).find(entity => entity.name === mobType)

  if (mob) {
    return await attackEntity(mineflayer, mob, kill)
  }

  log(mineflayer, `Could not find any ${mobType} to attack.`)
  return false
}

export async function attackEntity(
  mineflayer: Mineflayer,
  entity: Entity,
  kill = true,
): Promise<boolean> {
  const pos = entity.position
  await equipHighestAttack(mineflayer)

  if (!kill) {
    if (mineflayer.bot.entity.position.distanceTo(pos) > 5) {
      const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 4)
      await mineflayer.bot.pathfinder.goto(goal)
    }
    await mineflayer.bot.attack(entity)
    return true
  }

  mineflayer.once('interrupt', () => {
    mineflayer.bot.pvp.stop()
  })

  mineflayer.bot.pvp.attack(entity)
  while (getNearbyEntities(mineflayer, 24).includes(entity)) {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  log(mineflayer, `Successfully killed ${entity.name}.`)
  return true
}

export async function defendSelf(mineflayer: Mineflayer, range = 9): Promise<boolean> {
  let attacked = false
  let enemy = getNearestEntityWhere(mineflayer, entity => isHostile(entity), range)

  while (enemy) {
    await equipHighestAttack(mineflayer)

    if (mineflayer.bot.entity.position.distanceTo(enemy.position) >= 4
      && enemy.name !== 'creeper' && enemy.name !== 'phantom') {
      try {
        const goal = new goals.GoalFollow(enemy, 3.5)
        await mineflayer.bot.pathfinder.goto(goal)
      }
      catch { /* might error if entity dies, ignore */ }
    }

    if (mineflayer.bot.entity.position.distanceTo(enemy.position) <= 2) {
      try {
        const followGoal = new goals.GoalFollow(enemy, 2)
        const invertedGoal = new goals.GoalInvert(followGoal)
        await mineflayer.bot.pathfinder.goto(invertedGoal)
      }
      catch { /* might error if entity dies, ignore */ }
    }

    mineflayer.bot.pvp.attack(enemy)
    attacked = true
    await sleep(500)
    enemy = getNearestEntityWhere(mineflayer, entity => isHostile(entity), range)

    mineflayer.once('interrupt', () => {
      mineflayer.bot.pvp.stop()
      return false
    })
  }

  mineflayer.bot.pvp.stop()
  if (attacked) {
    log(mineflayer, 'Successfully defended self.')
  }
  else {
    log(mineflayer, 'No enemies nearby to defend self from.')
  }
  return attacked
}
