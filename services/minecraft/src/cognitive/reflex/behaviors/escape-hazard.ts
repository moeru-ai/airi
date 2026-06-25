import type { ReflexBehavior } from '../types/behavior'

import { sleep } from '@moeru/std'
import { Vec3 } from 'vec3'

/** Oxygen (out of 20) at or below which the bot is drowning and must surface. */
const LOW_OXYGEN = 6
/** How far to look for a safe block to climb out onto. */
const ESCAPE_RADIUS = 6
/** Hard cap on one escape attempt so the reflex never hangs. */
const ESCAPE_TIMEOUT_MS = 6000
/** Re-aim/re-check cadence while escaping. */
const TICK_MS = 150
/** Highest priority — getting out of lava/water beats fighting (900) or eating (1000). */
const SCORE = 2000

// Re-entry guard: the reflex tick can re-fire while the escape loop is still running.
let escapeInFlight = false

interface BlockLike { name?: string, boundingBox?: string }

const HAZARD_BLOCK = /lava|fire|magma/

function isHazardBlock(b: BlockLike | null | undefined): boolean {
  return !!b?.name && HAZARD_BLOCK.test(b.name)
}

/** A block the bot can stand ON: full solid, and not a burning hazard. */
function isStandable(b: BlockLike | null | undefined): boolean {
  return !!b && b.boundingBox === 'block' && !isHazardBlock(b)
}

/** A block the bot can occupy (feet/head): non-solid and not lava/fire. */
function isClear(b: BlockLike | null | undefined): boolean {
  return !!b && b.boundingBox !== 'block' && !isHazardBlock(b)
}

/**
 * Nearest position the bot could safely stand (solid non-hazard ground, clear feet+head), searched
 * around `origin`. Pure (takes a `blockAt`), so it is unit-testable without a live world.
 *
 * Returns:
 * - The feet position to move to, or null when no safe stand is within `radius` (caller falls back to
 *   simply swimming up).
 */
export function findNearestSafeStand(
  blockAt: (x: number, y: number, z: number) => BlockLike | null,
  origin: { x: number, y: number, z: number },
  radius: number,
): { x: number, y: number, z: number } | null {
  const ox = Math.floor(origin.x)
  const oy = Math.floor(origin.y)
  const oz = Math.floor(origin.z)
  let best: { x: number, y: number, z: number } | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      // Prefer level/above so the bot climbs out rather than diving deeper.
      for (let dy = -1; dy <= 3; dy++) {
        const x = ox + dx
        const y = oy + dy
        const z = oz + dz
        if (isStandable(blockAt(x, y - 1, z)) && isClear(blockAt(x, y, z)) && isClear(blockAt(x, y + 1, z))) {
          const score = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 0.5
          if (score < bestScore) {
            bestScore = score
            best = { x, y, z }
          }
        }
      }
    }
  }
  return best
}

function inLava(bot: any): boolean {
  return Boolean(bot.entity?.isInLava)
}

function drowning(bot: any): boolean {
  return Boolean(bot.entity?.isInWater) && typeof bot.oxygenLevel === 'number' && bot.oxygenLevel <= LOW_OXYGEN
}

function inHazard(bot: any): boolean {
  return inLava(bot) || drowning(bot)
}

/**
 * Escape reflex: the moment the bot is in lava or is drowning, it climbs/swims OUT itself — fast,
 * reflexive, no LLM. Lava kills in ~2-3s, far quicker than a brain turn could react, so this must be
 * a reflex. Drives the body directly with look + forward + jump (jump = swim up / climb), aiming at
 * the nearest safe block to stand on (or just straight up to surface when drowning in open water).
 * Sets reflexEngaged for the duration so auto-follow and auto-eat stay out of the way.
 */
export const escapeHazardBehavior: ReflexBehavior = {
  id: 'escape-hazard',
  modes: ['idle', 'social', 'alert', 'wander', 'work'],
  score: () => SCORE,
  when: (_ctx, api) => {
    if (escapeInFlight)
      return false
    return !!api && inHazard(api.bot.bot)
  },
  run: async (api) => {
    const bot = api.bot.bot
    if (!inHazard(bot))
      return

    escapeInFlight = true
    api.context.updateAutonomy({ reflexEngaged: true })
    // Drop any in-progress goal (e.g. auto-follow) so it doesn't drag the bot back into the hazard.
    try {
      bot.pathfinder?.stop?.()
    }
    catch {}

    const deadline = Date.now() + ESCAPE_TIMEOUT_MS
    try {
      while (Date.now() < deadline && inHazard(bot)) {
        const pos = bot.entity.position
        // In open water, head straight up to the surface; in lava, climb out toward the nearest edge.
        const target = drowning(bot) && !inLava(bot)
          ? { x: pos.x, y: pos.y + 3, z: pos.z }
          : (findNearestSafeStand((x, y, z) => bot.blockAt(new Vec3(x, y, z)), pos, ESCAPE_RADIUS)
            ?? { x: pos.x, y: pos.y + 2, z: pos.z })

        try {
          await bot.lookAt(new Vec3(target.x + 0.5, target.y, target.z + 0.5), true)
        }
        catch {}
        bot.setControlState('sprint', false)
        bot.setControlState('forward', true)
        bot.setControlState('jump', true)
        await sleep(TICK_MS)
      }
    }
    finally {
      bot.setControlState('forward', false)
      bot.setControlState('jump', false)
      api.context.updateAutonomy({ reflexEngaged: false })
      // NOTICE: must release the in-flight guard here, otherwise `when()` stays false forever and the
      // escape reflex never fires again after the first hazard (defend.ts resets combatInFlight the same way).
      escapeInFlight = false
    }
  },
}
