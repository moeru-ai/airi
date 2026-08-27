// @vitest-environment jsdom

import type { StandardGamepadButtonName, StandardGamepadButtonState, StandardGamepadSnapshot } from '@proj-airi/input-gamepad'
import type { Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'

import Live2DMotionJoystick from './live2d-motion-joystick.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const neutralPose = neutralLive2DMotionControlPose
const defaultDynamics: Live2DMotionControlDynamics = {
  follow: 0.6,
  inertia: 0.35,
}

describe('live2DMotionJoystick', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function mountJoystick(
    move: (pose: Live2DMotionControlPose) => void,
    release: () => void,
    pose: Live2DMotionControlPose = neutralPose,
    updateDynamics: (dynamics: Live2DMotionControlDynamics) => void = () => {},
  ) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Live2DMotionJoystick, {
        pose,
        dynamics: defaultDynamics,
        onMove: move,
        onRelease: release,
        onUpdateDynamics: updateDynamics,
      }),
    })
    app.mount(host)

    return {
      app,
      button: host.querySelector('button')!,
      host,
    }
  }

  it('emits follow and inertia slider changes', async () => {
    const updateDynamics = vi.fn<(dynamics: Live2DMotionControlDynamics) => void>()
    const mounted = mountJoystick(vi.fn(), vi.fn(), neutralPose, updateDynamics)
    const sliders = mounted.host.querySelectorAll<HTMLInputElement>('input[type="range"]')

    expect(sliders).toHaveLength(2)
    expect(sliders[0].max).toBe('20000')
    expect(sliders[1].max).toBe('10000')

    sliders[0].value = '18000'
    sliders[0].dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(updateDynamics).toHaveBeenLastCalledWith({ follow: 1.8, inertia: 0.35 })

    sliders[1].value = '7000'
    sliders[1].dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(updateDynamics).toHaveBeenLastCalledWith({ follow: 0.6, inertia: 0.7 })

    mounted.app.unmount()
    mounted.host.remove()
  })

  it('starts pointer control without using removed keyboard state', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const mounted = mountJoystick(move, vi.fn())
    mounted.button.setPointerCapture = vi.fn()
    vi.spyOn(mounted.button, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 150,
      clientY: 50,
    })
    Object.defineProperties(event, {
      isPrimary: { value: true },
      pointerId: { value: 1 },
    })

    expect(() => mounted.button.dispatchEvent(event)).not.toThrow()
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ headX: 0.5, headY: 0.5 }))

    mounted.app.unmount()
    mounted.host.remove()
  })

  it('maps A and Q to left body X and head roll targets', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const release = vi.fn()
    const mounted = mountJoystick(move, release)

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))
    expect(move.mock.lastCall?.[0]).toEqual({ ...neutralPose, headZ: -1, bodyX: -1 })

    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }))

    expect(release).toHaveBeenCalledOnce()
    mounted.app.unmount()
    mounted.host.remove()
  })

  it('maps D and E to right body X and head roll', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const mounted = mountJoystick(move, vi.fn())

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', bubbles: true }))

    expect(move.mock.lastCall?.[0]).toEqual({ ...neutralPose, headZ: 1, bodyX: 1 })
    mounted.app.unmount()
    mounted.host.remove()
  })

  it('keeps body X coupled to position keys when A and D are idle', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const mounted = mountJoystick(move, vi.fn())

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))

    expect(move.mock.lastCall?.[0].headX).toBe(1)
    expect(move.mock.lastCall?.[0].bodyX).toBe(1)
    mounted.app.unmount()
    mounted.host.remove()
  })

  it('maps W and S to opposite mouth shapes without moving Y', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const mounted = mountJoystick(move, vi.fn())

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }))
    expect(move.mock.lastCall?.[0].mouthForm).toBe(1)
    expect(move.mock.lastCall?.[0].headY).toBe(0)

    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    expect(move.mock.lastCall?.[0].mouthForm).toBe(-1)
    expect(move.mock.lastCall?.[0].headY).toBe(0)

    mounted.app.unmount()
    mounted.host.remove()
  })

  it('maps C to fully closed eyes', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const release = vi.fn()
    const mounted = mountJoystick(move, release)

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', bubbles: true }))

    expect(move.mock.lastCall?.[0].eyeSquint).toBe(1)

    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'C', bubbles: true }))

    expect(release).toHaveBeenCalledOnce()
    mounted.app.unmount()
    mounted.host.remove()
  })

  it('preserves the mouse position while tilt keys move', () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const release = vi.fn()
    const mousePose: Live2DMotionControlPose = {
      ...neutralPose,
      eyeX: 0.6,
      eyeY: -0.4,
      headX: 0.6,
      headY: -0.4,
      bodyX: 0.6,
      bodyY: -0.4,
      bodyZ: 0.35,
      offsetX: 0.6,
      offsetY: -0.4,
    }
    const mounted = mountJoystick(move, release, mousePose)

    // ROOT CAUSE:
    //
    // Tilt-only keyboard input previously built a full pose with zero X/Y.
    // Each smoothing frame moved the active mouse pose toward the center.
    //
    // We fixed this by changing only axes that the keyboard controls.
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))

    expect(move).toHaveBeenCalled()
    for (const [pose] of move.mock.calls) {
      expect(pose.headX).toBe(mousePose.headX)
      expect(pose.headY).toBe(mousePose.headY)
      expect(pose.bodyZ).toBe(mousePose.bodyZ)
    }

    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }))

    expect(move.mock.lastCall?.[0]).toEqual(mousePose)
    expect(release).not.toHaveBeenCalled()

    mounted.app.unmount()
    mounted.host.remove()
  })

  it('maps standard gamepad analog controls without taking ownership of eye direction', async () => {
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const release = vi.fn()
    const gamepad = shallowRef<StandardGamepadSnapshot>()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Live2DMotionJoystick, {
        dynamics: defaultDynamics,
        gamepad: gamepad.value,
        pose: neutralPose,
        onMove: move,
        onRelease: release,
      }),
    })
    app.mount(host)

    gamepad.value = createGamepadSnapshot({
      leftStick: { x: 0.5, y: -0.25 },
      leftTrigger: 0.7,
      rightStick: { x: 0.4, y: 0.8 },
      rightTrigger: 0.6,
    })
    await nextTick()

    expect(move).toHaveBeenLastCalledWith({
      ...neutralPose,
      bodyX: 0.5,
      bodyY: 0.25,
      eyeSquint: 0.7,
      headX: 0.5,
      headY: 0.25,
      headZ: 0.4,
      mouthOpen: 0.6,
      offsetX: 0.5,
      offsetY: 0.25,
    })
    expect(move.mock.lastCall?.[0].eyeX).toBe(0)
    expect(move.mock.lastCall?.[0].eyeY).toBe(0)

    gamepad.value = createGamepadSnapshot()
    await nextTick()
    expect(release).toHaveBeenCalledOnce()

    app.unmount()
    host.remove()
  })
})

const standardButtonNames: readonly StandardGamepadButtonName[] = [
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

function createGamepadSnapshot(options: {
  leftStick?: { x: number, y: number }
  leftTrigger?: number
  rightStick?: { x: number, y: number }
  rightTrigger?: number
} = {}): StandardGamepadSnapshot {
  const buttons = Object.fromEntries(standardButtonNames.map((name): [StandardGamepadButtonName, StandardGamepadButtonState] => {
    let value = 0
    if (name === 'leftTrigger')
      value = options.leftTrigger ?? 0
    else if (name === 'rightTrigger')
      value = options.rightTrigger ?? 0
    return [name, { pressed: value > 0, touched: value > 0, value }]
  })) as Record<StandardGamepadButtonName, StandardGamepadButtonState>

  return {
    buttons,
    family: 'playstation',
    id: 'DualSense Wireless Controller',
    index: 0,
    leftStick: options.leftStick ?? { x: 0, y: 0 },
    rightStick: options.rightStick ?? { x: 0, y: 0 },
    timestamp: 0,
  }
}
