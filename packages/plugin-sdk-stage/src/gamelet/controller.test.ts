import { describe, expect, it, vi } from 'vitest'

import { StageGameletController } from './controller'

describe('stageGameletController', () => {
  it('waits for a mounted UI and can serve a reopened gamelet', async () => {
    const controller = new StageGameletController()
    const states: string[] = []
    const unsubscribe = controller.subscribe(state => states.push(state.bindingId ?? 'closed'))

    const first = controller.request('whiteboard:main', { type: 'create_canvas' }, { timeoutMs: 1000 })
    await vi.waitFor(() => expect(states).toContain('whiteboard:main'))
    const disconnect = controller.connect('whiteboard:main', payload => ({ ...payload, handled: 'first' }))

    await expect(first).resolves.toEqual({ type: 'create_canvas', handled: 'first' })
    await controller.close('whiteboard:main')
    disconnect()

    const second = controller.request('whiteboard:main', { type: 'redo' }, { timeoutMs: 1000 })
    await vi.waitFor(() => expect(states.filter(state => state === 'whiteboard:main')).toHaveLength(2))
    const reconnect = controller.connect('whiteboard:main', payload => ({ ...payload, handled: 'second' }))

    await expect(second).resolves.toEqual({ type: 'redo', handled: 'second' })
    reconnect()
    unsubscribe()
    controller.dispose()
  })

  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3914009097
  it('routes overlapping requests to the handler for each binding', async () => {
    const controller = new StageGameletController()
    let resolveFirst!: () => void
    let resolveSecond!: () => void
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const secondGate = new Promise<void>((resolve) => {
      resolveSecond = resolve
    })
    const firstHandler = vi.fn(async (payload: Record<string, unknown>) => {
      await firstGate
      return { ...payload, binding: 'first' }
    })
    const secondHandler = vi.fn(async (payload: Record<string, unknown>) => {
      await secondGate
      return { ...payload, binding: 'second' }
    })

    const disconnectFirst = controller.connect('first', firstHandler)
    const disconnectSecond = controller.connect('second', secondHandler)
    const firstRequest = controller.request('first', { action: 'first' })
    const secondRequest = controller.request('second', { action: 'second' })

    await vi.waitFor(() => expect(firstHandler).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(secondHandler).toHaveBeenCalledOnce())
    resolveSecond()
    resolveFirst()

    await expect(firstRequest).resolves.toEqual({ action: 'first', binding: 'first' })
    await expect(secondRequest).resolves.toEqual({ action: 'second', binding: 'second' })
    disconnectFirst()
    disconnectSecond()
    controller.dispose()
  })

  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3922208877
  it('applies the request timeout after the gamelet connects', async () => {
    // ROOT CAUSE:
    //
    // The timeout only applied while the request waited for a handler.
    // After a handler connected, an unresolved invocation never rejected.
    //
    // We fixed this by sharing one timeout signal with the connection wait and invocation.
    vi.useFakeTimers()
    const controller = new StageGameletController()
    let rejected = false
    controller.connect('whiteboard:main', async () => await new Promise(() => {}))

    void controller.request('whiteboard:main', { type: 'create_canvas' }, { timeoutMs: 10 })
      .catch(() => {
        rejected = true
      })

    await vi.advanceTimersByTimeAsync(10)

    expect(rejected).toBe(true)
    controller.dispose()
    vi.useRealTimers()
  })
})
