import type { StandardGamepadSnapshot } from '@proj-airi/input-gamepad'

import { tryOnBeforeUnmount, useIntervalFn, useTimeoutFn } from '@vueuse/core'
import { watch } from 'vue'

interface UseLive2DMotionGamepadActionsOptions {
  clearTimeline: () => void
  disabled: () => boolean
  goToEnd: () => void
  goToStart: () => void
  play: () => void
  restartRecording: () => void
  selectTrack: (offset: -1 | 1) => void
  snapshot: () => StandardGamepadSnapshot | undefined
  stepBackward: (steps: number) => void
  stepForward: (steps: number) => void
  stop: () => void
}

const holdSeekPolicy = Object.freeze({
  accelerationWindowMs: 600,
  baseSteps: 5,
  delayMs: 300,
  intervalMs: 80,
})

interface DigitalActions {
  clearTimeline: boolean
  goToEnd: boolean
  goToStart: boolean
  play: boolean
  restartRecording: boolean
  selectNextTrack: boolean
  selectPreviousTrack: boolean
  stop: boolean
}

const releasedActions: Readonly<DigitalActions> = Object.freeze({
  clearTimeline: false,
  goToEnd: false,
  goToStart: false,
  play: false,
  restartRecording: false,
  selectNextTrack: false,
  selectPreviousTrack: false,
  stop: false,
})

/**
 * Maps standard controller buttons to Live2D editor actions.
 * Edge actions run once. Held frame-step actions repeat and accelerate.
 */
export function useLive2DMotionGamepadActions(options: UseLive2DMotionGamepadActionsOptions): void {
  let previousActions = releasedActions
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

  function clearDirection(commitTap: boolean): void {
    const previousDirection = activeDirection
    const shouldStepOnce = commitTap && previousDirection !== 0 && !holdStarted
    activeDirection = 0
    holdStarted = false
    holdDelay.stop()
    holdInterval.pause()
    if (shouldStepOnce)
      step(previousDirection, 1)
  }

  function updateDirection(nextDirection: -1 | 0 | 1): void {
    if (activeDirection === nextDirection)
      return

    clearDirection(true)
    if (nextDirection === 0)
      return

    activeDirection = nextDirection
    pressedAt = Date.now()
    holdDelay.start()
  }

  function runEdgeActions(actions: DigitalActions): void {
    if (actions.play && !previousActions.play)
      options.play()
    if (actions.stop && !previousActions.stop)
      options.stop()
    if (actions.goToStart && !previousActions.goToStart)
      options.goToStart()
    if (actions.goToEnd && !previousActions.goToEnd)
      options.goToEnd()
    if (actions.restartRecording && !previousActions.restartRecording)
      options.restartRecording()
    if (actions.clearTimeline && !previousActions.clearTimeline)
      options.clearTimeline()
    if (actions.selectPreviousTrack && !previousActions.selectPreviousTrack)
      options.selectTrack(-1)
    if (actions.selectNextTrack && !previousActions.selectNextTrack)
      options.selectTrack(1)
    previousActions = actions
  }

  function handleSnapshot(snapshot: StandardGamepadSnapshot | undefined): void {
    if (!snapshot || options.disabled()) {
      previousActions = releasedActions
      clearDirection(false)
      return
    }

    const buttons = snapshot.buttons
    const leftShoulder = buttons.leftShoulder.pressed && !buttons.rightShoulder.pressed
    const rightShoulder = buttons.rightShoulder.pressed && !buttons.leftShoulder.pressed
    const actions: DigitalActions = {
      clearTimeline: leftShoulder && buttons.dpadDown.pressed,
      goToEnd: leftShoulder && buttons.dpadRight.pressed,
      goToStart: leftShoulder && buttons.dpadLeft.pressed,
      play: buttons.faceBottom.pressed,
      restartRecording: leftShoulder && buttons.dpadUp.pressed,
      selectNextTrack: rightShoulder && buttons.dpadDown.pressed,
      selectPreviousTrack: rightShoulder && buttons.dpadUp.pressed,
      stop: buttons.faceRight.pressed,
    }
    runEdgeActions(actions)

    const backward = rightShoulder && buttons.dpadLeft.pressed
    const forward = rightShoulder && buttons.dpadRight.pressed
    updateDirection(backward === forward ? 0 : backward ? -1 : 1)
  }

  watch(options.snapshot, handleSnapshot, { flush: 'sync' })
  tryOnBeforeUnmount(() => clearDirection(false))
}
