// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

import { useWindowInteractivityLease } from './use-window-interactivity-lease'

describe('window interactivity lease', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renews click-through state while its Vue owner remains active', async () => {
    vi.useFakeTimers()
    const invokeSetIgnoreMouseEvents = vi.fn()
    let setIgnoreMouseEvents: ((ignore: boolean) => void) | undefined
    const host = document.createElement('div')
    const app = createApp({
      setup() {
        const interactivity = useWindowInteractivityLease({ invokeSetIgnoreMouseEvents })
        setIgnoreMouseEvents = interactivity.setIgnoreMouseEvents
        return () => h('div')
      },
    })
    app.mount(host)

    setIgnoreMouseEvents!(true)
    await vi.advanceTimersByTimeAsync(1001)

    expect(invokeSetIgnoreMouseEvents).toHaveBeenNthCalledWith(1, [true, { forward: true }])
    expect(invokeSetIgnoreMouseEvents).toHaveBeenNthCalledWith(2, [true, { forward: true }])

    app.unmount()

    expect(invokeSetIgnoreMouseEvents).toHaveBeenLastCalledWith([false, { forward: true }])
  })

  it('stops renewal when mouse input is enabled', async () => {
    vi.useFakeTimers()
    const invokeSetIgnoreMouseEvents = vi.fn()
    let setIgnoreMouseEvents: ((ignore: boolean) => void) | undefined
    const host = document.createElement('div')
    const app = createApp({
      setup() {
        const interactivity = useWindowInteractivityLease({ invokeSetIgnoreMouseEvents })
        setIgnoreMouseEvents = interactivity.setIgnoreMouseEvents
        return () => h('div')
      },
    })
    app.mount(host)

    setIgnoreMouseEvents!(true)
    setIgnoreMouseEvents!(false)
    invokeSetIgnoreMouseEvents.mockClear()
    await vi.advanceTimersByTimeAsync(2001)

    expect(invokeSetIgnoreMouseEvents).not.toHaveBeenCalled()

    app.unmount()
  })
})
