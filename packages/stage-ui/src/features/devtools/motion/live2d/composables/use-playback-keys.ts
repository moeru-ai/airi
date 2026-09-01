import {
  tryOnBeforeUnmount,
  useActiveElement,
  useEventListener,
  useIntervalFn,
  useMagicKeys,
  useTimeoutFn,
  whenever,
} from '@vueuse/core'
import { computed, watch } from 'vue'

interface Live2DMotionPlaybackKeysOptions {
  disabled: () => boolean
  goToEnd: () => void
  goToStart: () => void
  isPlaying: () => boolean
  pause: () => void
  play: () => void
  stepBackward: (steps: number) => void
  stepForward: (steps: number) => void
}

const holdSeekPolicy = Object.freeze({
  accelerationWindowMs: 600,
  baseSteps: 5,
  delayMs: 300,
  intervalMs: 80,
})

/**
 * Binds the Live2D motion playback controls to window-level keyboard shortcuts.
 * Tap commands move one frame. Held seek commands start after a short delay and
 * accelerate until the user releases the shortcut. Text entry keeps ownership
 * of matching key combinations.
 */
export function useLive2DMotionPlaybackKeys(options: Live2DMotionPlaybackKeysOptions): void {
  const activeElement = useActiveElement()

  // NOTICE:
  // useMagicKeys updates its key refs before it calls onEventFired.
  // The shortcut refs and browser default handling therefore share one event.
  // Source: https://github.com/vueuse/vueuse/blob/main/packages/core/useMagicKeys/index.ts
  // Remove this handler when useMagicKeys supports exact declarative shortcuts.
  const keys = useMagicKeys({
    passive: false,
    onEventFired(event) {
      if (!options.disabled() && !isTextEntry(event.target) && isPlaybackShortcut(event))
        event.preventDefault()
    },
  })

  const shortcutsEnabled = computed(() => !options.disabled() && !isTextEntry(activeElement.value))
  const hasNoCommandModifier = computed(() => !keys.ctrl.value && !keys.meta.value)
  const playbackPressed = computed(() => shortcutsEnabled.value
    && hasNoCommandModifier.value
    && keys.shift.value
    && keys.space.value
    && !keys.alt.value)
  const backwardPressed = computed(() => shortcutsEnabled.value
    && hasNoCommandModifier.value
    && keys.shift.value
    && keys.a.value
    && !keys.alt.value)
  const forwardPressed = computed(() => shortcutsEnabled.value
    && hasNoCommandModifier.value
    && keys.shift.value
    && keys.d.value
    && !keys.alt.value)
  const startPressed = computed(() => shortcutsEnabled.value
    && hasNoCommandModifier.value
    && keys.alt.value
    && keys.a.value
    && !keys.shift.value)
  const endPressed = computed(() => shortcutsEnabled.value
    && hasNoCommandModifier.value
    && keys.alt.value
    && keys.d.value
    && !keys.shift.value)

  let activeDirection: -1 | 0 | 1 = 0
  let holdStarted = false
  let pressedAt = 0

  const holdInterval = useIntervalFn(() => {
    if (activeDirection !== 0)
      step(activeDirection, heldStepCount())
  }, holdSeekPolicy.intervalMs, { immediate: false })
  const holdDelay = useTimeoutFn(() => {
    if (activeDirection === 0)
      return

    holdStarted = true
    step(activeDirection, heldStepCount())
    holdInterval.resume()
  }, holdSeekPolicy.delayMs, { immediate: false })

  function heldStepCount(): number {
    const elapsedMs = Date.now() - pressedAt
    const elapsedWindows = elapsedMs / holdSeekPolicy.accelerationWindowMs
    return Math.max(
      holdSeekPolicy.baseSteps,
      Math.round(holdSeekPolicy.baseSteps * (1 + elapsedWindows ** 2)),
    )
  }

  function step(direction: -1 | 1, steps: number): void {
    if (direction === -1) {
      options.stepBackward(steps)
      return
    }

    options.stepForward(steps)
  }

  function clearDirection(): void {
    activeDirection = 0
    holdStarted = false
    holdDelay.stop()
    holdInterval.pause()
  }

  function updateDirection(direction: -1 | 1, pressed: boolean): void {
    if (pressed) {
      if (activeDirection !== 0)
        return

      activeDirection = direction
      holdStarted = false
      pressedAt = Date.now()
      holdDelay.start()
      return
    }

    if (activeDirection !== direction)
      return

    const shouldStepOnce = !holdStarted && shortcutsEnabled.value
    clearDirection()
    if (shouldStepOnce)
      step(direction, 1)
  }

  whenever(playbackPressed, () => {
    if (options.isPlaying()) {
      options.pause()
      return
    }

    options.play()
  })
  whenever(startPressed, options.goToStart)
  whenever(endPressed, options.goToEnd)
  watch(backwardPressed, pressed => updateDirection(-1, pressed))
  watch(forwardPressed, pressed => updateDirection(1, pressed))
  watch(shortcutsEnabled, (enabled) => {
    if (!enabled)
      clearDirection()
  })
  useEventListener(window, 'blur', clearDirection)
  tryOnBeforeUnmount(clearDirection)
}

function isPlaybackShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey)
    return false

  const key = event.key.toLowerCase()
  const isPlaybackToggle = event.shiftKey && !event.altKey && event.code === 'Space'
  const isStep = event.shiftKey && !event.altKey && (key === 'a' || key === 'd')
  const isJump = event.altKey && !event.shiftKey && (key === 'a' || key === 'd')
  return isPlaybackToggle || isStep || isJump
}

function isTextEntry(target: EventTarget | null | undefined): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'))
}
