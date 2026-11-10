import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import type { WheelEventState } from 'wheel-gestures'

import { tryOnScopeDispose, useEventListener } from '@vueuse/core'
import { shallowRef } from 'vue'
import { WheelGestures } from 'wheel-gestures'

/** Configuration for a native wheel swipe gesture. */
export interface UseSwipeGestureOptions {
  /** Ignores events that do not belong to the gesture. @default accepts every event */
  filter?: (event: WheelEvent) => boolean
}

/** Reactive view of one normalized native wheel swipe gesture. */
export interface UseSwipeGestureReturn {
  /** The latest movement, velocity, momentum, and adaptive ending state. */
  state: Readonly<ShallowRef<WheelEventState | undefined>>
}

/**
 * Tracks a native wheel gesture without claiming the browser's scroll action.
 *
 * The consumer decides when horizontal intent is strong enough to call
 * `preventDefault()`. Wheel Gestures supplies normalized deltas, velocity,
 * momentum detection, and an adaptive ending signal.
 */
export function useSwipeGesture(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: UseSwipeGestureOptions = {},
): UseSwipeGestureReturn {
  const state = shallowRef<WheelEventState>()
  const wheelGestures = WheelGestures({
    preventWheelAction: false,
    reverseSign: false,
  })
  const stopStateListener = wheelGestures.on('wheel', (nextState) => {
    state.value = nextState
  })

  useEventListener(target, 'wheel', (nextEvent) => {
    if (options.filter && !options.filter(nextEvent))
      return

    wheelGestures.feedWheel(nextEvent)
  }, { passive: false })

  tryOnScopeDispose(() => {
    stopStateListener()
    wheelGestures.disconnect()
  })

  return {
    state,
  }
}
