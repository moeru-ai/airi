import { definePerceptionEvent } from '..'
import { hasReadyFood } from '../../../../libs/mineflayer/foods'

/**
 * Health at or below this (out of 20; ~3 hearts) counts as critical. Mirrors the auto-eat reflex
 * threshold so the two layers agree on when survival kicks in.
 */
const LOW_HEALTH_THRESHOLD = 6

// Edge-trigger latch: fire at most once per descent into critical, re-arming only after health
// climbs back above the threshold. Prevents waking the brain every health packet while low.
let armed = true

/**
 * Emits a high-salience signal when the bot enters critical health AND the auto-eat reflex cannot
 * help (no ready-to-eat food). In that case recovery needs the conscious brain — to cook raw food
 * for more saturation, or to retreat/find food when there is none. When ready food exists the reflex
 * eats it silently (0 token) and this event stays quiet.
 */
export const lowHealthEvent = definePerceptionEvent<[], { health: number }>({
  id: 'low_health',
  modality: 'felt',
  kind: 'low_health',

  mineflayer: {
    event: 'health',
    filter: (ctx) => {
      const health = ctx.bot.health
      if (typeof health !== 'number')
        return false

      if (health > LOW_HEALTH_THRESHOLD) {
        armed = true
        return false
      }

      if (!armed)
        return false

      // Critical now. The auto-eat reflex transparently handles ready-to-eat food — EXCEPT mid-fight,
      // where it is suppressed (reflexEngaged) so the bot can commit to combat. mineflayer-pvp sets
      // `bot.pvp.target` while attacking; in that case auto-eat cannot help, so escalate to the brain
      // (retreat + eat) even when ready food exists. Otherwise the reflex eats it silently.
      const inCombat = Boolean((ctx.bot as { pvp?: { target?: unknown } }).pvp?.target)
      if (hasReadyFood(ctx.bot) && !inCombat)
        return false

      armed = false
      return true
    },
    extract: ctx => ({ health: typeof ctx.bot.health === 'number' ? ctx.bot.health : 0 }),
  },
})
