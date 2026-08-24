// @vitest-environment jsdom

import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

import Live2DMotionJoystick from './live2d-motion-joystick.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const neutralPose: Live2DMotionControlPose = {
  x: 0,
  y: 0,
  headZ: 0,
  bodyZ: 0,
}

describe('live2DMotionJoystick', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function mountJoystick(
    move: (pose: Live2DMotionControlPose) => void,
    release: () => void,
    pose: Live2DMotionControlPose = neutralPose,
  ) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Live2DMotionJoystick, {
        pose,
        active: false,
        onMove: move,
        onRelease: release,
      }),
    })
    app.mount(host)

    return {
      app,
      button: host.querySelector('button')!,
      host,
    }
  }

  it('smooths A and Q into left body and head roll', () => {
    vi.useFakeTimers()
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const release = vi.fn()
    const mounted = mountJoystick(move, release)

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))
    vi.advanceTimersByTime(17)

    expect(move).toHaveBeenCalled()
    expect(move.mock.lastCall?.[0].bodyZ).toBeGreaterThan(-1)
    expect(move.mock.lastCall?.[0].bodyZ).toBeLessThan(0)
    expect(move.mock.lastCall?.[0].headZ).toBeGreaterThan(-1)
    expect(move.mock.lastCall?.[0].headZ).toBeLessThan(0)

    vi.advanceTimersByTime(300)
    expect(move.mock.lastCall?.[0]).toEqual({ x: 0, y: 0, headZ: -1, bodyZ: -1 })

    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }))
    vi.advanceTimersByTime(300)

    expect(release).toHaveBeenCalledOnce()
    mounted.app.unmount()
    mounted.host.remove()
  })

  it('maps D and E to right body and head roll', () => {
    vi.useFakeTimers()
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const mounted = mountJoystick(move, vi.fn())

    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', bubbles: true }))
    vi.advanceTimersByTime(300)

    expect(move.mock.lastCall?.[0]).toEqual({ x: 0, y: 0, headZ: 1, bodyZ: 1 })
    mounted.app.unmount()
    mounted.host.remove()
  })

  it('preserves the mouse position while tilt keys move', () => {
    vi.useFakeTimers()
    const move = vi.fn<(pose: Live2DMotionControlPose) => void>()
    const release = vi.fn()
    const mousePose: Live2DMotionControlPose = {
      x: 0.6,
      y: -0.4,
      headZ: 0,
      bodyZ: 0,
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
    vi.advanceTimersByTime(300)

    expect(move).toHaveBeenCalled()
    for (const [pose] of move.mock.calls) {
      expect(pose.x).toBe(mousePose.x)
      expect(pose.y).toBe(mousePose.y)
    }

    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    mounted.button.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }))
    vi.advanceTimersByTime(300)

    expect(move.mock.lastCall?.[0]).toEqual(mousePose)
    expect(release).not.toHaveBeenCalled()

    mounted.app.unmount()
    mounted.host.remove()
  })
})
