import type { MaybeRefOrGetter } from 'vue'

import { useRafFn } from '@vueuse/core'
import { shallowRef, toValue } from 'vue'

/**
 * A spring of one layer height. A spring keeps its speed when the band changes, so a loud syllable carries the wave a
 * little past the level and it swings back. A tween starts from rest at each of the 30 band updates a second, and it
 * only creeps after the level.
 */
export interface LayerSpring {
  stiffness: number
  /** The inertia. A heavier layer starts and stops more slowly. */
  mass: number
  /** 1 settles without a swing. A lower value swings past the level more. */
  dampingRatio: number
}

/** One layer of a voice visual. Each layer follows one voice band. */
export interface VoiceWaveLayer {
  /** Wave cycles across the drawing. */
  cycles: number
  /** Phase speed of the wave. A negative value moves it the other way. */
  radiansPerSecond: number
  /** Primary shades only, so the visual follows the theme color. Dark mode uses lighter shades. */
  color: string
  opacity: number
  /** The height of the layer at a full band level, from 0 to 1 of the space that the visual gives the waves. */
  maxHeight: number
  spring: LayerSpring
}

/**
 * One layer for each band, from back to front. A low band is the body of the voice: a wide, tall, and heavy swell that
 * barely swings. A high band is a narrow, low, and light ripple that reacts fast and swings more. So no single band
 * fills the panel, and the layers move differently when the voice changes.
 */
export const VOICE_WAVE_LAYERS: readonly VoiceWaveLayer[] = [
  { cycles: 1.2, radiansPerSecond: 0.9, color: 'text-primary-300 dark:text-primary-500', opacity: 0.45, maxHeight: 1, spring: { stiffness: 260, mass: 1.6, dampingRatio: 0.55 } },
  { cycles: 2, radiansPerSecond: -1.4, color: 'text-primary-400 dark:text-primary-400', opacity: 0.4, maxHeight: 0.8, spring: { stiffness: 420, mass: 1.2, dampingRatio: 0.48 } },
  { cycles: 3.1, radiansPerSecond: 2.1, color: 'text-primary-500 dark:text-primary-300', opacity: 0.35, maxHeight: 0.6, spring: { stiffness: 650, mass: 0.9, dampingRatio: 0.42 } },
  { cycles: 4.6, radiansPerSecond: -3, color: 'text-primary-600 dark:text-primary-200', opacity: 0.3, maxHeight: 0.4, spring: { stiffness: 900, mass: 0.7, dampingRatio: 0.36 } },
]

/** A listening wave keeps this much height, so the user sees that it listens. */
const IDLE_HEIGHT = 0.05
/** A frame after a stall counts at most this long, and one integration step at most the next value, so the waves do not jump. */
const MAX_FRAME_SECONDS = 0.05
const MAX_STEP_SECONDS = 1 / 120

// NOTICE:
// A copy of the spring step of the Live2D motion control. The Live2D package keeps it private with its pose types.
// Source: `stepAxis` in packages/stage-ui-live2d/src/composables/live2d/motion-control-spring.ts.
// Removal condition: a shared spring step that both the Live2D motion control and the voice visuals import.
export function stepSpring(spring: LayerSpring, current: number, velocity: number, target: number, elapsedSeconds: number) {
  const damping = 2 * spring.dampingRatio * Math.sqrt(spring.stiffness * spring.mass)
  const acceleration = (spring.stiffness * (target - current) - damping * velocity) / spring.mass
  const nextVelocity = velocity + acceleration * elapsedSeconds
  return { position: current + nextVelocity * elapsedSeconds, velocity: nextVelocity }
}

/**
 * Moves each layer of {@link VOICE_WAVE_LAYERS} with its spring on the frame loop.
 *
 * `bands` gives how much a voice stands out in each band, about 30 times a second. Each value is from 0 to 1, from the
 * lowest band to the highest. While `active` is true, each layer moves toward its band level above a small rest height,
 * and its phase advances. Otherwise the layers settle at 0 and the phases stop. `onFrame` runs after each frame with the
 * frame time in seconds and the number of integration steps, so a visual can step its own springs on the same clock.
 * The loop runs while the calling scope lives.
 */
export function useVoiceWaveLayers(bands: MaybeRefOrGetter<readonly number[]>, active: MaybeRefOrGetter<boolean>, onFrame?: (frameSeconds: number, stepCount: number) => void) {
  /** The phase of each layer in radians, and the spring state of its height. The drawn height is 0 or more. */
  const phasesRadians = shallowRef(VOICE_WAVE_LAYERS.map((_, index) => index * 1.7))
  const springs = VOICE_WAVE_LAYERS.map(() => ({ position: 0, velocity: 0 }))
  const heights = shallowRef(springs.map(() => 0))

  useRafFn(({ delta }) => {
    const frameSeconds = Math.min(Math.max(delta, 0) / 1000, MAX_FRAME_SECONDS)
    const stepCount = Math.max(1, Math.ceil(frameSeconds / MAX_STEP_SECONDS))
    const stepSeconds = frameSeconds / stepCount
    const listening = toValue(active)
    const levels = toValue(bands)
    springs.forEach((spring, index) => {
      const layer = VOICE_WAVE_LAYERS[index]
      const target = listening ? IDLE_HEIGHT + (levels[index] ?? 0) * (layer.maxHeight - IDLE_HEIGHT) : 0
      for (let step = 0; step < stepCount; step++)
        Object.assign(spring, stepSpring(layer.spring, spring.position, spring.velocity, target, stepSeconds))
    })
    heights.value = springs.map(spring => Math.max(0, spring.position))
    if (listening)
      phasesRadians.value = phasesRadians.value.map((phase, index) => phase + VOICE_WAVE_LAYERS[index].radiansPerSecond * frameSeconds)
    onFrame?.(frameSeconds, stepCount)
  })

  return { heights, phasesRadians }
}
