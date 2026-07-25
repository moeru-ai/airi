import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'

import type { Mineflayer } from '../libs/mineflayer'

import pathfinderModel from 'mineflayer-pathfinder'

import { sleep } from '@moeru/std'

import { isHostile } from '../utils/mcdata'
import { log } from './base'
import { patchedGoto } from './patched-goto'
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
  // Search radius matches the bot's general scan radius (48) so "go hunt a cow/pig" can find targets
  // as far as it can otherwise perceive them, instead of the old hardcoded 24.
  const mob = getNearbyEntities(mineflayer, 48).find(entity => entity.name === mobType)

  if (mob) {
    return await attackEntity(mineflayer, mob, kill)
  }

  log(mineflayer, `Could not find any ${mobType} to attack.`)
  return false
}

/**
 * Whether {@link collectNearbyDrops} should keep polling after a scan that found no (new) drop.
 *
 * Use when:
 * - Deciding, on an empty scan, whether to wait for late-spawning drops or give up.
 *
 * Expects:
 * - `now`/`deadline`/`lastFoundAt` are ms timestamps; `idleGraceMs` is how long to keep waiting
 *   after the last collected drop before concluding nothing more will appear.
 *
 * Returns:
 * - true to keep polling, false to stop (hard deadline reached, or no new drop for the grace window).
 *
 * NOTICE:
 * Why: fixes "killed the animal but collected 0 loot". Drop entities (mutton/wool) spawn a few
 * hundred ms AFTER the kill, so the FIRST scan is almost always empty. The old loop did `break` on
 * that first empty scan and gave up before the drops existed. A short grace window lets the late
 * drops be collected while still terminating promptly when there is genuinely nothing.
 */
export function shouldKeepWaitingForDrops(params: {
  now: number
  deadline: number
  lastFoundAt: number
  idleGraceMs: number
}): boolean {
  if (params.now >= params.deadline)
    return false
  return params.now - params.lastFoundAt < params.idleGraceMs
}

/**
 * Walk over nearby dropped items to pick them up (vanilla auto-pickup triggers on proximity).
 *
 * Use when: right after killing an animal, so its meat/loot ends up in the inventory without the
 * caller (the LLM) having to manually locate and navigate to the drop — that manual path kept
 * crashing on `null.pos.x` when the drop entity wasn't queryable. Bounded by time so it never hangs.
 *
 * Tolerates the spawn delay: drops appear a few hundred ms after the kill, so an empty scan is not
 * treated as "done" — see {@link shouldKeepWaitingForDrops}.
 */
async function collectNearbyDrops(mineflayer: Mineflayer, radius = 8, timeoutMs = 6000, idleGraceMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const visited = new Set<number>()
  let lastFoundAt = Date.now()
  let collected = 0

  while (Date.now() < deadline) {
    const drop = getNearbyEntities(mineflayer, radius).find(e => e.name === 'item' && !visited.has(e.id))
    if (drop) {
      lastFoundAt = Date.now()
      visited.add(drop.id)
      try {
        const p = drop.position
        await patchedGoto(mineflayer.bot, new goals.GoalNear(p.x, p.y, p.z, 1))
        await sleep(300) // let the pickup register before scanning for the next drop
        collected++
      }
      catch {
        break // unreachable drop (e.g. in a gap) — stop rather than loop
      }
      continue
    }

    // No (new) drop this scan. Drops spawn a few hundred ms after the kill, so wait a beat and
    // rescan rather than giving up immediately.
    if (!shouldKeepWaitingForDrops({ now: Date.now(), deadline, lastFoundAt, idleGraceMs }))
      break
    await sleep(200)
  }

  // Always log the count: 0 here is the signal that either nothing dropped or the drops were not
  // recognised (e.g. an entity-name mismatch), which is exactly the failure we are guarding against.
  log(mineflayer, `Auto-collected ${collected} nearby drop(s).`)
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
      await patchedGoto(mineflayer.bot, goal)
    }
    await mineflayer.bot.attack(entity)
    return true
  }

  mineflayer.once('interrupt', () => {
    mineflayer.bot.pvp.stop()
  })

  mineflayer.bot.pvp.attack(entity)
  while (getNearbyEntities(mineflayer, 24).includes(entity)) {
    await sleep(1000)
  }

  log(mineflayer, `Successfully killed ${entity.name}.`)
  // Auto-collect the drops so the caller doesn't have to manually find/navigate to item entities.
  await collectNearbyDrops(mineflayer)
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
        await patchedGoto(mineflayer.bot, goal)
      }
      catch { /* might error if entity dies, ignore */ }
    }

    if (mineflayer.bot.entity.position.distanceTo(enemy.position) <= 2) {
      try {
        const followGoal = new goals.GoalFollow(enemy, 2)
        const invertedGoal = new goals.GoalInvert(followGoal)
        await patchedGoto(mineflayer.bot, invertedGoal)
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
