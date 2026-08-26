import type { ReflexBehavior } from '../types/behavior'

import { selectReadyFood } from '../../../libs/mineflayer/foods'

/** Health at or below this (out of 20; ~3 hearts) is critical. Mirrors the low-health perception event. */
const LOW_HEALTH_THRESHOLD = 6

/**
 * Only eat while food is below the natural-regeneration threshold (food >= 18 already regenerates
 * health passively). Eating at higher food just wastes the item without speeding recovery.
 */
const REGEN_FOOD_THRESHOLD = 18

// After eating, wait before considering another bite so a single consume isn't retriggered while its
// effect settles. The async run also blocks the behavior slot for its duration.
const COOLDOWN_MS = 3_000

// Dominates idle-gaze and other passive behaviors: survival eating comes first.
const SCORE = 1_000

/**
 * Survival reflex: when critically hurt, instantly eat the best ready-to-eat food (0 token, no LLM).
 *
 * Raw cookable food is intentionally skipped (see {@link selectReadyFood}) — that path is left to the
 * conscious brain, which the low-health perception event wakes so it can cook for more saturation.
 * Runs in every mode because staying alive outranks whatever task or idle behavior is active, and
 * eating ready food only equips+consumes in place (no pathfinding), so it does not fight auto-follow.
 */
export const autoEatBehavior: ReflexBehavior = {
  id: 'auto-eat',
  modes: ['idle', 'social', 'work', 'wander', 'alert'],
  cooldownMs: COOLDOWN_MS,
  when: (ctx, api) => {
    if (ctx.self.health > LOW_HEALTH_THRESHOLD)
      return false
    if (ctx.self.food >= REGEN_FOOD_THRESHOLD)
      return false
    // Don't eat mid-fight: consuming food equips it to the hand, dropping the weapon. The defend
    // reflex owns this window; the conscious brain still decides flee-vs-fight via low_health.
    if (ctx.autonomy.reflexEngaged)
      return false
    if (!api)
      return false
    return selectReadyFood(api.bot.bot) !== null
  },
  score: () => SCORE,
  run: async (api) => {
    const bot = api.bot.bot
    const item = selectReadyFood(bot)
    if (!item)
      return
    // Hold reflexEngaged across the whole equip+consume window. A fresh attacker stays valid in
    // recentAttacker() for ~600ms — longer than the runtime's ~50ms async behavior slot — so without
    // this guard the next tick could start the defend reflex, whose attackEntity re-equips a weapon and
    // cancels the survival bite mid-animation (exactly the low-health-in-combat case this handles).
    // defend.when() yields while reflexEngaged is set.
    api.context.updateAutonomy({ reflexEngaged: true })
    try {
      await bot.equip(item, 'hand')
      await bot.consume()
    }
    finally {
      api.context.updateAutonomy({ reflexEngaged: false })
    }
  },
}
