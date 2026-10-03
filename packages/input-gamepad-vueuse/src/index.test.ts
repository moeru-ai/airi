import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useStandardGamepad } from './index'

const neutralButton: GamepadButton = Object.freeze({
  pressed: false,
  touched: false,
  value: 0,
})

describe('useStandardGamepad', () => {
  it('exposes reactive buttons, values, sticks, and combinations', () => {
    let gamepads: readonly (Gamepad | null)[] = [createGamepad({
      axes: [0.6, 0, 0, 0],
      buttons: {
        0: { pressed: true, touched: true, value: 1 },
        4: { pressed: true, touched: true, value: 1 },
        6: { pressed: true, touched: true, value: 0.75 },
      },
    })]
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 0
    const cancelFrame = vi.fn((frameId: number) => frames.delete(frameId))
    const scope = effectScope()
    const gamepad = scope.run(() => useStandardGamepad({
      cancelFrame,
      getGamepads: () => gamepads,
      requestFrame(callback) {
        const frameId = ++nextFrameId
        frames.set(frameId, callback)
        return frameId
      },
    }))

    if (!gamepad)
      throw new Error('The composable did not start in the effect scope.')

    const shortcut = gamepad.pressed('leftShoulder', 'faceBottom')
    expect(gamepad.isSupported.value).toBe(true)
    expect(gamepad.isActive.value).toBe(true)

    runNextFrame(frames)

    expect(gamepad.isConnected.value).toBe(true)
    expect(gamepad.family.value).toBe('playstation')
    expect(gamepad.buttons.faceBottom.value).toBe(true)
    expect(gamepad.values.leftTrigger.value).toBe(0.75)
    expect(gamepad.sticks.left.value.x).toBeCloseTo(0.545)
    expect(shortcut.value).toBe(true)

    gamepads = []
    runNextFrame(frames)

    expect(gamepad.isConnected.value).toBe(false)
    expect(gamepad.buttons.faceBottom.value).toBe(false)
    expect(gamepad.values.leftTrigger.value).toBe(0)
    expect(shortcut.value).toBe(false)

    scope.stop()
    expect(cancelFrame).toHaveBeenCalledOnce()
    expect(gamepad.isActive.value).toBe(false)
  })

  it('pauses and resumes the polling loop', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 0
    const cancelFrame = vi.fn((frameId: number) => frames.delete(frameId))
    const scope = effectScope()
    const gamepad = scope.run(() => useStandardGamepad({
      cancelFrame,
      getGamepads: () => [],
      requestFrame(callback) {
        const frameId = ++nextFrameId
        frames.set(frameId, callback)
        return frameId
      },
    }))

    if (!gamepad)
      throw new Error('The composable did not start in the effect scope.')

    gamepad.pause()
    expect(gamepad.isActive.value).toBe(false)
    expect(cancelFrame).toHaveBeenCalledOnce()

    gamepad.resume()
    expect(gamepad.isActive.value).toBe(true)
    expect(frames.size).toBe(1)

    scope.stop()
    expect(cancelFrame).toHaveBeenCalledTimes(2)
  })
})

function createGamepad(options: {
  axes?: readonly number[]
  buttons?: Readonly<Partial<Record<number, GamepadButton>>>
} = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, index): GamepadButton => options.buttons?.[index] ?? neutralButton)

  return {
    axes: options.axes ?? [0, 0, 0, 0],
    buttons,
    connected: true,
    id: 'DualSense Wireless Controller',
    index: 0,
    mapping: 'standard',
    timestamp: 1,
    vibrationActuator: {
      playEffect: async () => 'complete',
      reset: async () => 'complete',
    },
  }
}

function runNextFrame(frames: Map<number, FrameRequestCallback>): void {
  const next = frames.entries().next().value
  if (!next)
    throw new Error('The monitor did not schedule a frame.')

  const [frameId, callback] = next
  frames.delete(frameId)
  callback(performance.now())
}
