import { definePerceptionEvent } from '..'

/**
 * How long (ms) after the real-attacker signal a damage event is still attributed to it. mineflayer's
 * `entityHurt` (from the 1.20+ damage_event packet) and the `health` packet arrive within a few ticks
 * of each other; 600ms comfortably covers the gap without bleeding into unrelated later damage.
 */
const ATTACKER_RECENCY_MS = 600

/** Minimal structural view of the attacking entity that damage attribution reads. */
export interface AttackerEntity {
  type?: string
  name?: string
  username?: string
  id?: number | string
}

// NOTICE: module-level singleton, mirroring the other per-event trackers. One bot per process.
let lastAttacker: { entity: AttackerEntity, at: number } | null = null

export function recordAttacker(entity: AttackerEntity | null | undefined, now: number): void {
  if (!entity)
    return
  lastAttacker = { entity, at: now }
}

/**
 * The entity that actually dealt the bot's most recent damage, if it is still recent.
 *
 * Use when:
 * - Attributing a `damage_taken` event to a real attacker instead of the unreliable "nearest entity"
 *   guess (which blamed the master for a skeleton's arrow when the master stood nearby).
 *
 * Returns:
 * - The attacking entity within {@link ATTACKER_RECENCY_MS}, or null (e.g. environmental damage,
 *   which the 1.20+ damage_event packet reports with no source entity).
 */
export function recentAttacker(now: number): AttackerEntity | null {
  if (!lastAttacker)
    return null
  return now - lastAttacker.at <= ATTACKER_RECENCY_MS ? lastAttacker.entity : null
}

/**
 * Pure side-effect perception event: records the REAL attacker from mineflayer's `entityHurt`.
 *
 * mineflayer emits `entityHurt(victim, source)` off the 1.20+ `damage_event` packet, where `source`
 * is the entity responsible for the damage — the skeleton that fired the arrow, the player who hit —
 * NOT a positional guess. We capture it whenever the bot itself is the victim so {@link recentAttacker}
 * can feed correct attribution to the damage rule. Never emits a signal.
 */
export const attackerTrackerEvent = definePerceptionEvent<[any, any], Record<string, never>>({
  id: 'attacker_tracker',
  modality: 'felt',
  kind: 'attacker_tracker',

  mineflayer: {
    event: 'entityHurt',
    filter: (ctx, victim, source) => {
      const self = ctx.bot.entity
      if (victim && self && victim.id === self.id)
        recordAttacker(source as AttackerEntity, Date.now())
      return false
    },
    extract: () => ({}),
  },
})
