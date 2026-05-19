import type { AnimationState, Skeleton, TrackEntry } from '@esotericsoftware/spine-webgl'

import { SPINE_EMOTION_TRACK, SPINE_IDLE_TRACK } from '../../constants/emotions'

export interface SpineAnimationManager {
  /** Set the looping idle animation on track 0. */
  setIdle: (name: string) => TrackEntry | null
  /** Play a one-shot emotion animation on track 1. */
  playEmotion: (name: string, options?: { loop?: boolean, mixDuration?: number }) => TrackEntry | null
  /** Stop the emotion track and re-empty back to the idle state. */
  clearEmotion: (mixDuration?: number) => void
  /** Resolve the closest matching animation name. Case-insensitive substring match. */
  resolveAnimation: (preferred: string) => string | undefined
  /** Returns the list of animation names available on the loaded skeleton. */
  listAnimations: () => string[]
}

/**
 * Wraps a Spine `AnimationState` + `Skeleton` pair with helpers for AIRI's
 * idle-vs-emotion track conventions.
 *
 * Use when:
 * - The Spine model's lifecycle (mount, animation switch, emotion event)
 *   needs to consult the loaded skeleton, fall back to similar names, or
 *   layer one-shot animations on top of an idle loop.
 *
 * Expects:
 * - `animationState` and `skeleton` are already initialized for a model
 *   that the caller mounted via `loadSpineZip()` or a URL source.
 *
 * Returns:
 * - A handle that mutates the underlying `AnimationState` directly.
 */
export function useSpineAnimationManager(
  animationState: AnimationState,
  skeleton: Skeleton,
  defaults: { mixDuration: number, idleAnimationEnabled: boolean },
): SpineAnimationManager {
  function listAnimations() {
    return skeleton.data.animations.map(animation => animation.name)
  }

  function resolveAnimation(preferred: string) {
    const animations = listAnimations()
    if (animations.length === 0)
      return undefined

    // 1. exact match
    const exact = animations.find(name => name === preferred)
    if (exact)
      return exact

    // 2. case-insensitive exact match
    const ci = animations.find(name => name.toLowerCase() === preferred.toLowerCase())
    if (ci)
      return ci

    // 3. substring contains preferred
    const contains = animations.find(name => name.toLowerCase().includes(preferred.toLowerCase()))
    if (contains)
      return contains

    // 4. preferred contains animation name
    const reverse = animations.find(name => preferred.toLowerCase().includes(name.toLowerCase()))
    if (reverse)
      return reverse

    return undefined
  }

  function setIdle(name: string): TrackEntry | null {
    if (!defaults.idleAnimationEnabled) {
      animationState.setEmptyAnimation(SPINE_IDLE_TRACK, defaults.mixDuration)
      return null
    }

    const resolved = resolveAnimation(name) ?? listAnimations()[0]
    if (!resolved)
      return null

    return animationState.setAnimation(SPINE_IDLE_TRACK, resolved, true)
  }

  function playEmotion(name: string, options?: { loop?: boolean, mixDuration?: number }): TrackEntry | null {
    const resolved = resolveAnimation(name)
    if (!resolved)
      return null

    const entry = animationState.setAnimation(SPINE_EMOTION_TRACK, resolved, options?.loop ?? false)
    entry.mixDuration = options?.mixDuration ?? defaults.mixDuration
    // Auto-clear after the one-shot animation completes; the listener fires
    // on `complete` for non-looping tracks, restoring the idle state.
    if (!entry.loop) {
      const listener = {
        complete: (completed: TrackEntry) => {
          if (completed === entry) {
            try {
              animationState.setEmptyAnimation(SPINE_EMOTION_TRACK, defaults.mixDuration)
            }
            finally {
              animationState.removeListener(listener)
            }
          }
        },
      }
      animationState.addListener(listener)
    }
    return entry
  }

  function clearEmotion(mixDuration?: number) {
    animationState.setEmptyAnimation(SPINE_EMOTION_TRACK, mixDuration ?? defaults.mixDuration)
  }

  return {
    setIdle,
    playEmotion,
    clearEmotion,
    resolveAnimation,
    listAnimations,
  }
}
