import type { Ref } from 'vue'

import type { Emotion, VADVector } from '../constants/emotions'

import { readonly, ref } from 'vue'

import { EMOTION_VAD_value } from '../constants/emotions'

/**
 * How fast `current` chases `target`, as a rate in reciprocal seconds.
 * ~1.35 puts the time constant near 0.74s, so an emotion reads as arriving
 * rather than snapping, and is most of the way there within two seconds.
 */
const APPROACH_RATE = 1.35

/**
 * How fast `target` returns to baseline once the hold expires. Two orders of
 * magnitude slower than the approach (time constant ~50s) so a state fades
 * over a conversation rather than over a breath.
 */
const DECAY_RATE = 0.02

/** Seconds a state is protected from decay, before and per unit of intensity. */
const HOLD_BASE_SECONDS = 6
const HOLD_INTENSITY_SECONDS = 18

/**
 * How much of the incoming emotion a nudge mixes in, before and per unit of
 * intensity. Capped below 1 so a single message can never fully overwrite the
 * state — what the character already felt always survives in some measure.
 */
const NUDGE_BASE = 0.28
const NUDGE_INTENSITY = 0.58
const NUDGE_CEILING = 0.96

/**
 * Used when a payload carries no intensity. Producers frequently omit it, and
 * letting `undefined` reach the arithmetic would poison the state with NaN.
 */
const DEFAULT_INTENSITY = 0.65

/** Peak displacement of the ambient drift, per axis. */
const DRIFT_AMPLITUDE = 0.04
/** Bounds on how long the drift keeps heading toward one point. */
const DRIFT_MIN_SECONDS = 1.7
const DRIFT_SPAN_SECONDS = 4.2
/** Rate at which the drift eases toward its current point. */
const DRIFT_RATE = 0.55

const ZERO: VADVector = { valence: 0, arousal: 0, dominance: 0 }

/**
 * Fraction of the remaining distance to cover this frame.
 *
 * Framerate independence is the whole point: integrating `rate * dt` directly
 * would make the same emotion settle at a visibly different speed on a 30Hz
 * versus a 120Hz display, and would overshoot outright on a long frame.
 */
function approach(dt: number, rate: number): number {
  return 1 - Math.exp(-dt * rate)
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function lerpVAD(from: VADVector, to: VADVector, t: number): VADVector {
  return {
    valence: lerp(from.valence, to.valence, t),
    arousal: lerp(from.arousal, to.arousal, t),
    dominance: lerp(from.dominance, to.dominance, t),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Deterministic 0..1 generator.
 *
 * Seeded rather than `Math.random` so idle drift is reproducible: a test can
 * assert the character keeps moving without asserting where it moved to.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1

  return () => {
    // xorshift32 — small, dependency-free, and good enough for drift.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

/** A reading of the emotional state at one instant. */
export interface VADSnapshot {
  /** Drift included. This is the value renderers should consume. */
  current: VADVector
  /** Where the state is heading, before drift. */
  target: VADVector
  /** Length of `current`, normalized to 0..1 — how strongly anything is felt. */
  magnitude: number
  /** Seconds before decay resumes; 0 once the state is already decaying. */
  holdRemaining: number
}

export interface CreateEmotionStateOptions {
  /**
   * The state decays toward this rather than toward zero, which is what makes
   * a character read as habitually cheerful or habitually reserved.
   * @default neutral
   */
  baseline?: VADVector
  /** @default 1 */
  seed?: number
}

export interface EmotionState {
  snapshot: Readonly<Ref<VADSnapshot>>
  /**
   * Mix an emotion into the target. Deliberately a blend rather than an
   * assignment: consecutive messages accumulate instead of overwriting, which
   * is where the sense of momentum comes from.
   */
  nudge: (emotion: Emotion, intensity?: number) => void
  /** Advance the simulation by `dtSeconds`. The caller owns the clock. */
  update: (dtSeconds: number) => void
  reset: () => void
}

/**
 * Continuous emotional state, independent of any renderer.
 *
 * Discrete emotions enter only through {@link EmotionState.nudge}; everything
 * downstream reads a continuous value. Keeping the quantized step at the entry
 * and nowhere else is what prevents the character from visibly snapping
 * between states as a label flips.
 *
 * The clock is injected rather than read from `performance.now()`, so the
 * caller decides the tick and tests can drive it exactly.
 *
 * @example
 * ```ts
 * const state = createEmotionState()
 * state.nudge(Emotion.Happy, 0.8)
 * state.update(1 / 60)
 * state.snapshot.value.current // → drifts toward happy, then decays back
 * ```
 */
export function createEmotionState(options?: CreateEmotionStateOptions): EmotionState {
  const baseline = options?.baseline ?? ZERO
  const random = createRandom(options?.seed ?? 1)

  let target: VADVector = { ...baseline }
  let current: VADVector = { ...baseline }
  let ambient: VADVector = { ...ZERO }
  let driftGoal: VADVector = { ...ZERO }
  let driftCountdown = 0
  let holdRemaining = 0

  // Derived rather than written as 0: with a non-neutral baseline the state
  // starts out already displaced, and a literal would make the very first read
  // disagree with every later one.
  const snapshot = ref<VADSnapshot>({
    current: { ...current },
    target: { ...target },
    magnitude: magnitudeOf(current),
    holdRemaining: 0,
  })

  function magnitudeOf(vad: VADVector): number {
    // Normalized by √3 so a corner of the unit cube reads as 1 rather than 1.73.
    const raw = Math.hypot(vad.valence, vad.arousal, vad.dominance)
    return clamp(raw / Math.sqrt(3), 0, 1)
  }

  function publish(): void {
    snapshot.value = {
      current: { ...current },
      target: { ...target },
      magnitude: magnitudeOf(current),
      holdRemaining,
    }
  }

  function retargetDrift(): void {
    driftGoal = {
      valence: (random() * 2 - 1) * DRIFT_AMPLITUDE,
      arousal: (random() * 2 - 1) * DRIFT_AMPLITUDE,
      dominance: (random() * 2 - 1) * DRIFT_AMPLITUDE,
    }
    driftCountdown = DRIFT_MIN_SECONDS + random() * DRIFT_SPAN_SECONDS
  }

  function nudge(emotion: Emotion, intensity?: number): void {
    const strength = clamp(
      typeof intensity === 'number' && Number.isFinite(intensity) ? intensity : DEFAULT_INTENSITY,
      0,
      1,
    )
    const amount = clamp(NUDGE_BASE + strength * NUDGE_INTENSITY, 0, NUDGE_CEILING)

    target = lerpVAD(target, EMOTION_VAD_value[emotion], amount)
    holdRemaining = HOLD_BASE_SECONDS + strength * HOLD_INTENSITY_SECONDS
    publish()
  }

  function update(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0)
      return

    // Hold gates the decay and nothing else: the state still approaches and
    // still drifts while held, it just is not yet being pulled back to
    // baseline. This is what stops an expression from collapsing the instant
    // its triggering motion finishes.
    if (holdRemaining > 0)
      holdRemaining = Math.max(0, holdRemaining - dtSeconds)
    else
      target = lerpVAD(target, baseline, approach(dtSeconds, DECAY_RATE))

    driftCountdown -= dtSeconds
    if (driftCountdown <= 0)
      retargetDrift()
    ambient = lerpVAD(ambient, driftGoal, approach(dtSeconds, DRIFT_RATE))

    const destination: VADVector = {
      valence: target.valence + ambient.valence,
      arousal: target.arousal + ambient.arousal,
      dominance: target.dominance + ambient.dominance,
    }
    current = lerpVAD(current, destination, approach(dtSeconds, APPROACH_RATE))

    publish()
  }

  function reset(): void {
    target = { ...baseline }
    current = { ...baseline }
    ambient = { ...ZERO }
    driftGoal = { ...ZERO }
    driftCountdown = 0
    holdRemaining = 0
    publish()
  }

  retargetDrift()

  return { snapshot: readonly(snapshot) as Readonly<Ref<VADSnapshot>>, nudge, update, reset }
}
