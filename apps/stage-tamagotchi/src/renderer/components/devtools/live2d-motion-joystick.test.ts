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

  function mountJoystick(move: (pose: Live2DMotionControlPose) => void, release: () => void) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Live2DMotionJoystick, {
        pose: neutralPose,
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
})
