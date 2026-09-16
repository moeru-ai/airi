import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

import type { ReflexBehavior } from '../types/behavior'

// Minimum velocity magnitude to consider a player "moving"
const MOVEMENT_THRESHOLD = 0.1
// Max distance (blocks) to care about player movement
const GAZE_RANGE = 16
// After looking at a moving player, don't re-trigger for this long
const COOLDOWN_MS = 2_000
// Chance to skip a valid gaze trigger (so the bot doesn't robotically track every movement)
const IGNORE_CHANCE = 0.3
// Attention events older than this are ignored to avoid stale reactions.
const ATTENTION_MAX_AGE_MS = 2_000
// Skip tiny orientation changes to avoid visible head jitter.
const LOOK_DEADZONE_RAD = 0.07
// Avoid rapid oscillation when switching between nearby candidates.
const RETARGET_DEBOUNCE_MS = 650

const smoothingByBot = new WeakMap<object, { lastTargetId: number | null, lastLookAtAt: number }>()

interface GazeCandidate {
  entity: Entity
  score: number
  isAttention: boolean
}

function horizontalSpeed(entity: Entity): number {
  const v = entity.velocity
  if (!v)
    return 0
  return Math.sqrt(v.x * v.x + v.z * v.z)
}

function headLookOffset(entity: Entity): number {
  return Number.isFinite(entity.height) ? entity.height * 0.85 : 1.5
}

function normalizeAngle(rad: number): number {
  let a = rad
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function getLookDeltaRad(from: Entity, to: { x: number, y: number, z: number }): number {
  const dx = to.x - from.position.x
  const dy = to.y - from.position.y
  const dz = to.z - from.position.z
  const hDist = Math.hypot(dx, dz)

  const yawDelta = Math.abs(normalizeAngle(Math.atan2(-dx, -dz) - (from.yaw ?? 0)))
  const pitchDelta = Math.abs(Math.atan2(dy, hDist) - (from.pitch ?? 0))
  return Math.max(yawDelta, pitchDelta)
}

function getSmoothingState(bot: object): { lastTargetId: number | null, lastLookAtAt: number } {
  let state = smoothingByBot.get(bot)
  if (!state) {
    state = { lastTargetId: null, lastLookAtAt: 0 }
    smoothingByBot.set(bot, state)
  }
  return state
}

/**
 * Finds the best gaze target: either a recent attention entity or the closest moving player.
 * Returns null when there is nothing worth looking at.
 */
function findGazeTarget(
  bot: Bot,
  ctx: Parameters<ReflexBehavior['when']>[0],
): GazeCandidate | null {
  const selfPos = bot.entity?.position
  if (!selfPos)
    return null

  // 1. Recent attention signal takes priority
  if (
    ctx.attention.lastSignalType === 'entity_attention'
    && ctx.attention.lastSignalAt
    && ctx.now - ctx.attention.lastSignalAt <= ATTENTION_MAX_AGE_MS
    && ctx.attention.lastSignalSourceId
  ) {
    const target = bot.entities[Number(ctx.attention.lastSignalSourceId)]
    if (target) {
      const dist = selfPos.distanceTo(target.position)
      if (dist <= GAZE_RANGE)
        return { entity: target, score: 25 + 35 * (1 - dist / GAZE_RANGE), isAttention: true }
    }
  }

  // 2. Closest moving player
  let best: GazeCandidate | null = null
  let bestDist = Infinity

  for (const [name, player] of Object.entries(bot.players)) {
    if (name === bot.username)
      continue
    const entity = player?.entity
    if (!entity || horizontalSpeed(entity) <= MOVEMENT_THRESHOLD)
      continue

    const dist = selfPos.distanceTo(entity.position)
    if (dist > GAZE_RANGE)
      continue

    if (dist < bestDist) {
      bestDist = dist
      best = { entity, score: 10 + 30 * (1 - dist / GAZE_RANGE), isAttention: false }
    }
  }

  return best
}

/**
 * Idle-gaze: the bot occasionally glances at nearby players who are moving.
 *
 * Design goals for realism:
 * - Only fires in idle/social modes (not during work, combat, etc.)
 * - Ignores stationary players — no creepy staring
 * - Drawn to movement: picks the closest moving player
 * - Probabilistic skip so the bot doesn't track every single movement
 * - Smooth look turns with anti-jitter retarget guards
 */
export const idleGazeBehavior: ReflexBehavior = {
  id: 'idle-gaze',
  modes: ['idle', 'social'],
  cooldownMs: COOLDOWN_MS,

  when: (ctx, api) => api ? findGazeTarget(api.bot.bot, ctx) !== null : false,

  score: (ctx, api) => api ? (findGazeTarget(api.bot.bot, ctx)?.score ?? 0) : 0,

  run: async ({ bot: mfBot, context }) => {
    const bot = mfBot.bot
    const selfEntity = bot.entity
    if (!selfEntity)
      return

    const candidate = findGazeTarget(bot, context.getSnapshot())
    if (!candidate)
      return

    // Probabilistic skip for ambient movement scans (attention signals always fire).
    if (!candidate.isAttention && Math.random() < IGNORE_CHANCE)
      return

    const targetId = candidate.entity.id ?? null
    const lookTarget = candidate.entity.position.offset(0, headLookOffset(candidate.entity), 0)

    if (getLookDeltaRad(selfEntity, lookTarget) < LOOK_DEADZONE_RAD)
      return

    const smoothing = getSmoothingState(bot)
    const now = Date.now()
    const isSwitch = smoothing.lastTargetId !== null && targetId !== null && smoothing.lastTargetId !== targetId
    if (isSwitch && now - smoothing.lastLookAtAt < RETARGET_DEBOUNCE_MS)
      return

    // force=false uses mineflayer's smoother turn path instead of snap rotation.
    await bot.lookAt(lookTarget, false)
    smoothing.lastTargetId = targetId
    smoothing.lastLookAtAt = now
  },
}
