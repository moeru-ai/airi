import type { MaybeRefOrGetter } from 'vue'

import { useSwipeGesture } from '@proj-airi/stage-ui/components'
import { clamp } from 'es-toolkit'
import { shallowRef, toValue, watch } from 'vue'

import { paintsBackground } from './use-chat-floating-click-through'

/**
 * Whether a point of a level is blank: no element between the point and the level paints a background. Bubbles, the
 * composer, islands, buttons, code, and scrollbars paint one. Text that the level draws straight onto its own surface,
 * for example a time label, is blank.
 */
function isBlankIn(target: EventTarget | null, level: HTMLElement) {
  for (let element = target instanceof Element ? target : null; element && element !== level; element = element.parentElement) {
    if (paintsBackground(getComputedStyle(element)))
      return false
  }
  return true
}

/**
 * A swipe to the right with two fingers on the trackpad, from a level back to the level under it.
 *
 * Use when:
 * - A level slides away to the end to show the level under it, and the user goes back with a swipe.
 *
 * Expects:
 * - `level` is the element that moves. A swipe starts only on a blank point of it, so a swipe over its content keeps
 *   its own meaning, for example a scroll of a code block.
 *
 * Returns:
 * - `progress`, from 0 at rest to 1 when the level has moved its whole width. It follows the fingers.
 * - `tracking`, true while the fingers drive the levels. The host turns off its transitions while it is true.
 *
 * Past half the width, or with a quick swipe, the gesture calls `onBack`. Else the level goes back. In both cases the
 * transitions of the host run from the place where the fingers left the levels.
 */
export function useSwipeBack(options: {
  level: MaybeRefOrGetter<HTMLElement | null | undefined>
  enabled: MaybeRefOrGetter<boolean>
  onBack: () => void
}) {
  const progress = shallowRef(0)
  const tracking = shallowRef(false)
  /**
   * The intent of the current wheel gesture. A gesture that starts on content, turns vertical, or moves to the left
   * stays `other` until it ends, so it scrolls as before.
   */
  let intent: 'pending' | 'back' | 'other' = 'other'

  const { state } = useSwipeGesture(options.level, {
    filter: event => toValue(options.enabled) && !event.ctrlKey && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL,
  })

  function finish(back: boolean) {
    intent = 'other'
    if (!tracking.value)
      return
    tracking.value = false
    progress.value = 0
    if (back)
      options.onBack()
  }

  watch(state, (gesture) => {
    const level = toValue(options.level)
    if (!gesture || !level)
      return

    if (gesture.isStart)
      intent = gesture.event instanceof WheelEvent && isBlankIn(gesture.event.target, level) ? 'pending' : 'other'

    if (gesture.isEnding) {
      finish(progress.value >= 0.5)
      return
    }
    // Momentum begins after the fingers leave the trackpad. Momentum to the right is a quick swipe.
    if (gesture.isMomentum) {
      if (intent === 'back')
        finish(progress.value >= 0.5 || gesture.axisVelocity[0] < 0)
      return
    }
    if (intent === 'other')
      return

    const [movementX, movementY] = gesture.axisMovement
    // Fingers that move to the right scroll the content to the left, so their movement is negative.
    const distance = -movementX
    if (intent === 'pending') {
      // The axis rules of `Swipeable`: 16px of movement before a decision, and a ratio of 1.5 to 1 for a clear axis.
      if (Math.max(Math.abs(movementX), Math.abs(movementY)) < 16)
        return
      if (Math.abs(movementY) >= Math.abs(movementX) * 1.5 || distance <= 0) {
        intent = 'other'
        return
      }
      if (distance < Math.abs(movementY) * 1.5)
        return
      intent = 'back'
      tracking.value = true
    }

    if (gesture.event instanceof WheelEvent && gesture.event.cancelable)
      gesture.event.preventDefault()
    progress.value = clamp(distance / Math.max(level.clientWidth, 1), 0, 1)
  }, { flush: 'sync' })

  // A level that stops taking the swipe, for example when the list opens by a click, drops the swipe in progress.
  watch(() => toValue(options.enabled), (enabled) => {
    if (!enabled)
      finish(false)
  })

  return { progress, tracking }
}
