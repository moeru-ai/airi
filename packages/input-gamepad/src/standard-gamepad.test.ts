import { describe, expect, it, vi } from 'vitest'

import {
  createStandardGamepadSnapshot,
  detectGamepadFamily,
  getGamepadButtonLabel,
  StandardGamepadMonitor,
} from './index'

const neutralButton: GamepadButton = Object.freeze({
  pressed: false,
  touched: false,
  value: 0,
})

describe('createStandardGamepadSnapshot', () => {
  it('normalizes the standard axes and button positions', () => {
    const gamepad = createGamepad({
      axes: [0.6, 0, -1, 1],
      buttons: {
        0: { pressed: true, touched: true, value: 1 },
        6: { pressed: true, touched: true, value: 0.75 },
        14: { pressed: true, touched: true, value: 1 },
      },
      id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    })

    const snapshot = createStandardGamepadSnapshot(gamepad, { deadzone: 0.2 })

    expect(snapshot.family).toBe('playstation')
    expect(snapshot.leftStick.x).toBeCloseTo(0.5)
    expect(snapshot.leftStick.y).toBe(0)
    expect(snapshot.rightStick.x).toBeCloseTo(-Math.SQRT1_2)
    expect(snapshot.rightStick.y).toBeCloseTo(Math.SQRT1_2)
    expect(snapshot.buttons.faceBottom.pressed).toBe(true)
    expect(snapshot.buttons.leftTrigger.value).toBe(0.75)
    expect(snapshot.buttons.dpadLeft.pressed).toBe(true)
  })

  it('rejects devices without the standard mapping', () => {
    expect(() => createStandardGamepadSnapshot(createGamepad({ mapping: '' }))).toThrowError(
      'The gamepad does not use the standard mapping.',
    )
  })
})

describe('gamepad labels', () => {
  it('detects common controller families', () => {
    expect(detectGamepadFamily('Xbox Wireless Controller')).toBe('xbox')
    expect(detectGamepadFamily('Nintendo Switch Joy-Con (L/R)')).toBe('nintendo')
    expect(detectGamepadFamily('054c DualShock 4')).toBe('playstation')
    expect(detectGamepadFamily('Generic USB Gamepad')).toBe('unknown')
  })

  it('uses printed face labels without changing physical positions', () => {
    expect(getGamepadButtonLabel('playstation', 'faceBottom')).toBe('×')
    expect(getGamepadButtonLabel('xbox', 'faceBottom')).toBe('A')
    expect(getGamepadButtonLabel('nintendo', 'faceBottom')).toBe('B')
    expect(getGamepadButtonLabel('playstation', 'faceRight')).toBe('○')
  })
})

describe('standardGamepadMonitor', () => {
  it('keeps one selected standard gamepad until it disconnects', () => {
    let gamepads: readonly (Gamepad | null)[] = [
      createGamepad({ connected: true, index: 0, mapping: '' }),
      createGamepad({ connected: true, index: 1, id: 'Xbox Wireless Controller' }),
    ]
    let nextFrameId = 0
    const frames = new Map<number, FrameRequestCallback>()
    const cancelFrame = vi.fn((frameId: number) => frames.delete(frameId))
    const monitor = new StandardGamepadMonitor({
      cancelFrame,
      getGamepads: () => gamepads,
      requestFrame(callback) {
        const frameId = ++nextFrameId
        frames.set(frameId, callback)
        return frameId
      },
    })
    const listener = vi.fn()
    monitor.onSnapshot(listener)

    monitor.start()
    runNextFrame(frames)

    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1, family: 'xbox' }))

    gamepads = [
      createGamepad({ connected: true, index: 0, id: 'Nintendo Switch Pro Controller' }),
      createGamepad({ connected: true, index: 1, id: 'Xbox Wireless Controller' }),
    ]
    runNextFrame(frames)

    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1, family: 'xbox' }))

    gamepads = [createGamepad({ connected: true, index: 0, id: 'Nintendo Switch Pro Controller' })]
    runNextFrame(frames)

    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ index: 0, family: 'nintendo' }))

    gamepads = []
    runNextFrame(frames)
    expect(listener).toHaveBeenLastCalledWith(undefined)

    monitor.stop()
    expect(cancelFrame).toHaveBeenCalledOnce()
  })
})

function createGamepad(options: {
  axes?: readonly number[]
  buttons?: Readonly<Record<number, GamepadButton>>
  connected?: boolean
  id?: string
  index?: number
  mapping?: GamepadMappingType
} = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, index): GamepadButton => options.buttons?.[index] ?? neutralButton)

  return {
    axes: options.axes ?? [0, 0, 0, 0],
    buttons,
    connected: options.connected ?? true,
    id: options.id ?? 'Standard Gamepad',
    index: options.index ?? 0,
    mapping: options.mapping ?? 'standard',
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
