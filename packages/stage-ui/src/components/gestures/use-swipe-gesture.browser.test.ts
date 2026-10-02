import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useSwipeGesture } from './use-swipe-gesture'

describe('useSwipeGesture', () => {
  it('exposes native movement immediately and an adaptive ending state', async () => {
    vi.useFakeTimers()
    const scope = effectScope()

    try {
      const element = document.createElement('div')
      const target = shallowRef<HTMLElement | null>(element)
      const stream = scope.run(() => useSwipeGesture(target))
      if (!stream)
        throw new Error('Expected a swipe gesture.')
      await nextTick()

      const createWheelEvent = (deltaX: number, timeStamp: number) => {
        const event = new WheelEvent('wheel', { deltaX })
        Object.defineProperty(event, 'timeStamp', { value: timeStamp })
        return event
      }

      const firstEvent = createWheelEvent(20, 0)
      element.dispatchEvent(firstEvent)

      expect(stream.state.value?.event).toBe(firstEvent)
      expect(stream.state.value).toMatchObject({
        axisDelta: [20, 0, 0],
        axisMovement: [20, 0, 0],
        isEnding: false,
        isStart: true,
      })

      for (const [deltaX, timeStamp] of [[12, 10], [8, 20], [4, 30]] as const)
        element.dispatchEvent(createWheelEvent(deltaX, timeStamp))

      expect(stream.state.value).toMatchObject({
        axisMovement: [44, 0, 0],
        isEnding: false,
      })

      await vi.advanceTimersByTimeAsync(99)
      expect(stream.state.value?.isEnding).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(stream.state.value).toMatchObject({
        axisDelta: [0, 0, 0],
        axisMovement: [44, 0, 0],
        isEnding: true,
      })
    }
    finally {
      scope.stop()
      vi.useRealTimers()
    }
  })

  it('does not feed filtered wheel events into the gesture', async () => {
    const scope = effectScope()

    try {
      const element = document.createElement('div')
      const target = shallowRef<HTMLElement | null>(element)
      const stream = scope.run(() => useSwipeGesture(target, {
        filter: event => !event.ctrlKey,
      }))
      if (!stream)
        throw new Error('Expected a swipe gesture.')
      await nextTick()

      element.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaX: 20 }))

      expect(stream.state.value).toBeUndefined()
    }
    finally {
      scope.stop()
    }
  })
})
