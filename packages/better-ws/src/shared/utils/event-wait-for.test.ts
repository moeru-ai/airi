import { describe, expect, it, vi } from 'vitest'

import { createEventWaitFor } from './event-wait-for'

describe('createEventWaitFor', () => {
  it('resolves with the selected value when a future event matches', async () => {
    const wait = createEventWaitFor<{ type: string, value: number }, number>({
      match: event => event.type === 'ready',
      select: event => event.value,
    })

    wait.emit({ type: 'ignore', value: 1 })
    wait.emit({ type: 'ready', value: 2 })

    await expect(wait.promise).resolves.toBe(2)
  })

  it('rejects when the timeout expires before a matching event arrives', async () => {
    vi.useFakeTimers()
    try {
      const wait = createEventWaitFor<string>({
        match: message => message === 'ready',
        timeout: 100,
        timeoutMessage: 'Timed out waiting for ready message.',
      })

      wait.emit('ignore')
      vi.advanceTimersByTime(100)

      await expect(wait.promise).rejects.toThrow('Timed out waiting for ready message.')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects when an abort signal fires and ignores later events', async () => {
    const controller = new AbortController()
    const selected = vi.fn((message: string) => message)
    const wait = createEventWaitFor<string>({
      select: selected,
      signals: [controller.signal],
      abortMessage: 'Wait aborted.',
    })

    controller.abort()
    wait.emit('late')

    await expect(wait.promise).rejects.toThrow('Wait aborted.')
    expect(selected).not.toHaveBeenCalled()
  })
})
