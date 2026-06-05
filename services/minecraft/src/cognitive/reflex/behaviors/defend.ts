import type { Entity } from 'prismarine-entity'

import type { ReflexBehavior } from '../types/behavior'

import { attackEntity } from '../../../skills/combat'
import { isHostile } from '../../../utils/mcdata'
import { recentAttacker } from '../../perception/events/definitions/attacker-tracker'

// Dominates idle-gaze; sits just below auto-eat (1000) so eating at critical health still wins.
const SCORE = 900

// Guards against re-entry: the reflex tick can re-fire while attackEntity is still in flight, and we
// must not start a second pvp engagement on top of the first.
let combatInFlight = false

/**
 * Whether the bot should auto-defend against this attacker.
 *
 * Use when:
 * - Deciding, in the defend reflex, whether the entity that just hurt the bot is something to fight.
 *
 * Returns:
 * - true only for hostile mobs. NEVER players (so the master — or any player — is never attacked by
 *   the reflex; player threats are left to the conscious brain), and null/environmental damage is
 *   ignored. Because the trigger is "this entity actually dealt us damage", passive animals (which
 *   never attack) are inherently excluded.
 */
export function isEngageableMob(attacker: { type?: string, name?: string } | null | undefined): boolean {
  if (!attacker)
    return false
  if (attacker.type === 'player')
    return false
  return isHostile(attacker as Entity)
}

/**
 * Defense reflex: when a hostile mob attacks the bot, engage and kill it — and HOLD the engagement
 * (attackEntity runs to completion) instead of leaving combat to the brain, which thrashed between
 * attacking and fleeing on every hit and got the bot killed. Only reacts to mobs that actually dealt
 * damage (via the attacker tracker), so it never picks fights with passive animals or players.
 * Suppresses auto-follow for the duration (reflexEngaged) so the follow goal does not fight the pvp
 * chase.
 */
export const defendBehavior: ReflexBehavior = {
  id: 'defend',
  // Survival overrides whatever else the bot is doing, in any mode.
  modes: ['idle', 'social', 'alert', 'wander', 'work'],
  when: (ctx) => {
    if (combatInFlight)
      return false
    // Yield while another reflex already owns the body (e.g. an in-progress survival bite from
    // auto-eat, or an escape-hazard climb): preempting it here would let attackEntity re-equip a weapon
    // and cancel that reflex mid-action. The reflex releases reflexEngaged when it finishes, after which
    // a still-active attacker re-triggers defend on the next tick.
    if (ctx.autonomy.reflexEngaged)
      return false
    return isEngageableMob(recentAttacker(Date.now()))
  },
  score: () => SCORE,
  run: async (api) => {
    const attacker = recentAttacker(Date.now())
    if (!isEngageableMob(attacker))
      return

    combatInFlight = true
    // Let the pvp chase own the pathfinder; auto-follow yields until combat ends.
    api.context.updateAutonomy({ reflexEngaged: true })
    try {
      // NOTICE: recentAttacker stores the live mineflayer entity (the damage_event source); it is
      // typed narrowly as AttackerEntity, so widen it back to Entity for attackEntity/pvp.
      await attackEntity(api.bot, attacker as unknown as Entity, true)
    }
    catch {
      // Mob despawned / unreachable / fight interrupted — the next tick re-evaluates.
    }
    finally {
      combatInFlight = false
      api.context.updateAutonomy({ reflexEngaged: false })
    }
  },
}
