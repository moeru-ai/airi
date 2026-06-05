import { definePerceptionEvent } from '..'

/**
 * Most-negative vertical velocity (blocks/tick) that still counts as "free-falling fast enough to
 * plausibly cause fall damage". Standing/walking hovers near 0; a damaging multi-block fall reaches
 * roughly -0.7..-1.2 before landing. -0.45 keeps gentle step-downs and jump arcs from being
 * mistaken for damaging falls while staying generous toward real falls.
 */
const FALL_VELOCITY_THRESHOLD = -0.45

/**
 * How long (ms) after the last airborne descent a damage event is still attributed to the fall.
 * The server applies fall damage on landing, but the `health` packet arrives a few ticks later —
 * by then the entity already reads onGround=true / velocity.y≈0 (prismarine-physics resets velocity
 * on landing), so the fall must be remembered from just before landing. ~400ms (~8 physics ticks)
 * covers the packet gap without bleeding into unrelated later damage.
 */
const FALL_RECENCY_MS = 400

/** Minimal structural view of the bot's own entity needed to track vertical motion. */
interface VerticalMotion {
  velocity?: { y?: number }
  onGround?: boolean
}

interface FallState {
  /** whether the entity was airborne on the previously sampled tick */
  airborne: boolean
  /** most-negative velocity.y seen during the current airborne phase */
  peakFallVelocity: number
  /** timestamp (ms) of the landing that ended the last airborne phase, or null if none yet */
  landedAt: number | null
  /** peakFallVelocity frozen at that landing */
  landedPeakVelocity: number
}

// NOTICE: module-level singleton, mirroring the existing per-event state in damage-taken.ts. The
// EventRegistry owns a single bot per process, so one fall tracker is sufficient.
const fallState: FallState = {
  airborne: false,
  peakFallVelocity: 0,
  landedAt: null,
  landedPeakVelocity: 0,
}

/**
 * Sample the bot's vertical motion for one physics tick.
 *
 * Use when:
 * - Called once per `physicsTick` (~20Hz) so a later damage event can tell a landing fall apart
 *   from an attack — impossible from the post-landing snapshot alone, since the entity already
 *   reads onGround=true / velocity.y≈0 by the time the `health` event fires.
 *
 * Expects:
 * - `entity` is the bot's own entity; `now` is the sampling time in ms (injected so the heuristic
 *   stays deterministic under test).
 */
export function recordPhysicsTick(entity: VerticalMotion | undefined, now: number): void {
  const vy = typeof entity?.velocity?.y === 'number' ? entity.velocity.y : null
  const onGround = typeof entity?.onGround === 'boolean' ? entity.onGround : null
  if (vy === null || onGround === null)
    return

  if (!onGround) {
    if (!fallState.airborne) {
      // entering a fresh airborne phase: start a new peak measurement
      fallState.airborne = true
      fallState.peakFallVelocity = 0
    }
    if (vy < fallState.peakFallVelocity)
      fallState.peakFallVelocity = vy
    return
  }

  if (fallState.airborne) {
    // just touched ground: freeze how fast we were descending so a fall-damage health packet
    // arriving a few ticks later can still recognise this landing as a fall
    fallState.landedAt = now
    fallState.landedPeakVelocity = fallState.peakFallVelocity
  }
  fallState.airborne = false
  fallState.peakFallVelocity = 0
}

/**
 * Decide whether damage taken at `now` is attributable to falling.
 *
 * Use when:
 * - Classifying a damage source where the engine gives no explicit cause (see damage-taken.ts).
 *
 * Returns:
 * - true when the entity is still mid-air descending fast (a second hit before touching ground),
 *   or it has just landed from a fast descent within {@link FALL_RECENCY_MS}; false otherwise.
 */
export function classifyRecentFall(entity: VerticalMotion | undefined, now: number): boolean {
  const vy = typeof entity?.velocity?.y === 'number' ? entity.velocity.y : null
  const onGround = typeof entity?.onGround === 'boolean' ? entity.onGround : null

  // still airborne and descending fast at the moment the damage hit
  if (vy !== null && onGround === false && vy < FALL_VELOCITY_THRESHOLD)
    return true

  // landed from a fast descent a few ticks ago (the common case: the health packet lags the landing)
  return fallState.landedAt !== null
    && now - fallState.landedAt <= FALL_RECENCY_MS
    && fallState.landedPeakVelocity < FALL_VELOCITY_THRESHOLD
}

/**
 * Pure side-effect perception event: samples vertical motion every physics tick and never emits a
 * signal. Exists so {@link classifyRecentFall} has the pre-landing fall history that the
 * `damage_taken` event needs to label fall damage correctly.
 */
export const fallTrackerEvent = definePerceptionEvent<[], Record<string, never>>({
  id: 'fall_tracker',
  modality: 'felt',
  kind: 'fall_tracker',

  mineflayer: {
    event: 'physicsTick',
    // NOTICE: the recording happens here in `filter` (which always returns false, so nothing is
    // emitted), matching damage-taken.ts which likewise updates state inside its filter. Using the
    // filter as the per-tick hook keeps the tracker inside the EventRegistry attach/detach
    // lifecycle without inventing a second listener mechanism.
    filter: (ctx) => {
      recordPhysicsTick(ctx.bot.entity as VerticalMotion, Date.now())
      return false
    },
    extract: () => ({}),
  },
})
