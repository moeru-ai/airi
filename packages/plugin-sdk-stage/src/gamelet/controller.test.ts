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
})
