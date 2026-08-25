// @vitest-environment jsdom

import type { Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

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
        active: false,
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
})
