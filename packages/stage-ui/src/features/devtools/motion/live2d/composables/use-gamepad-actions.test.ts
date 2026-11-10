import type {
  StandardGamepadButtonName,
  StandardGamepadButtonState,
  StandardGamepadSnapshot,
} from '@proj-airi/input-gamepad'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'

import { useLive2DMotionGamepadActions } from './use-gamepad-actions'

const buttonNames: readonly StandardGamepadButtonName[] = [
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'dpadUp',
  'faceBottom',
  'faceLeft',
  'faceRight',
  'faceTop',
  'leftShoulder',
  'leftStick',
  'leftTrigger',
  'rightShoulder',
  'rightStick',
  'rightTrigger',
  'select',
  'start',
]

describe('useLive2DMotionGamepadActions', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup() {
    const snapshot = shallowRef<StandardGamepadSnapshot>()
    const actions = {
      clearTimeline: vi.fn(),
      disabled: () => false,
      goToEnd: vi.fn(),
      goToStart: vi.fn(),
      play: vi.fn(),
      restartRecording: vi.fn(),
      selectTrack: vi.fn<(offset: -1 | 1) => void>(),
      snapshot: () => snapshot.value,
      stepBackward: vi.fn<(steps: number) => void>(),
      stepForward: vi.fn<(steps: number) => void>(),
      stop: vi.fn(),
    }
    const scope = effectScope()
    scope.run(() => useLive2DMotionGamepadActions(actions))
    return { actions, scope, snapshot }
  }

  it('runs face-button actions only on the pressed edge', () => {
    const { actions, scope, snapshot } = setup()

    snapshot.value = createSnapshot({ faceBottom: 1 })
    snapshot.value = createSnapshot({ faceBottom: 1 })
    expect(actions.play).toHaveBeenCalledOnce()

    snapshot.value = createSnapshot()
    snapshot.value = createSnapshot({ faceBottom: 1 })
    expect(actions.play).toHaveBeenCalledTimes(2)

    snapshot.value = createSnapshot({ faceRight: 1 })
    expect(actions.stop).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('maps shoulder and directional-pad combinations', () => {
    const { actions, scope, snapshot } = setup()

    snapshot.value = createSnapshot({ leftShoulder: 1, dpadLeft: 1 })
    expect(actions.goToStart).toHaveBeenCalledOnce()

    snapshot.value = createSnapshot()
    snapshot.value = createSnapshot({ leftShoulder: 1, dpadRight: 1 })
    expect(actions.goToEnd).toHaveBeenCalledOnce()

    snapshot.value = createSnapshot()
    snapshot.value = createSnapshot({ leftShoulder: 1, dpadUp: 1 })
    expect(actions.restartRecording).toHaveBeenCalledOnce()

    snapshot.value = createSnapshot()
    snapshot.value = createSnapshot({ leftShoulder: 1, dpadDown: 1 })
    expect(actions.clearTimeline).toHaveBeenCalledOnce()

    snapshot.value = createSnapshot()
    snapshot.value = createSnapshot({ rightShoulder: 1, dpadUp: 1 })
    snapshot.value = createSnapshot()
    snapshot.value = createSnapshot({ rightShoulder: 1, dpadDown: 1 })
    expect(actions.selectTrack).toHaveBeenNthCalledWith(1, -1)
    expect(actions.selectTrack).toHaveBeenNthCalledWith(2, 1)
    scope.stop()
  })

  it('steps once on a tap and accelerates after the hold delay', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { actions, scope, snapshot } = setup()

    snapshot.value = createSnapshot({ rightShoulder: 1, dpadLeft: 1 })
    vi.advanceTimersByTime(200)
    snapshot.value = createSnapshot()
    expect(actions.stepBackward).toHaveBeenCalledOnce()
    expect(actions.stepBackward).toHaveBeenLastCalledWith(1)

    snapshot.value = createSnapshot({ rightShoulder: 1, dpadRight: 1 })
    vi.advanceTimersByTime(300)
    expect(actions.stepForward).toHaveBeenCalledWith(6)

    vi.advanceTimersByTime(800)
    expect(actions.stepForward.mock.calls.at(-1)?.[0]).toBeGreaterThan(5)
    const callCountBeforeRelease = actions.stepForward.mock.calls.length
    snapshot.value = createSnapshot()
    expect(actions.stepForward).toHaveBeenCalledTimes(callCountBeforeRelease)
    scope.stop()
  })
})

function createSnapshot(pressed: Partial<Record<StandardGamepadButtonName, number>> = {}): StandardGamepadSnapshot {
  const buttons = Object.fromEntries(buttonNames.map((name): [StandardGamepadButtonName, StandardGamepadButtonState] => {
    const value = pressed[name] ?? 0
    return [name, { pressed: value > 0, touched: value > 0, value }]
  })) as Record<StandardGamepadButtonName, StandardGamepadButtonState>

  return {
    buttons,
    family: 'playstation',
    id: 'DualSense Wireless Controller',
    index: 0,
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    timestamp: 0,
  }
}
