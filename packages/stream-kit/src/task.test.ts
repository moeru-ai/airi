import { describe, expect, it, vi } from 'vitest'

import { createTask, runTask, worstOutcome } from './task'

describe('createTask', () => {
  it('keeps its signal open when it finishes, so handed-off work continues', async () => {
    const task = createTask<string>()
    const cleanup = vi.fn()
    task.defer(cleanup)
    task.finish('done')

    expect(await task.done).toEqual({ status: 'finished', value: 'done' })
    expect(task.signal.aborted).toBe(false)
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
  })

  it('aborts with the reason on cancellation, and ignores later settlement', async () => {
    const task = createTask()
    task.cancel('User stopped')
    task.fail(new Error('Too late'))

    expect(await task.done).toEqual({ status: 'cancelled', reason: 'User stopped' })
    expect(task.signal.reason).toBe('User stopped')
  })

  it('cancels with its parent and stops listening to the parent after it settles', async () => {
    const parent = new AbortController()
    const finished = createTask({ signal: parent.signal })
    finished.finish(undefined)
    const child = createTask({ signal: parent.signal })
    parent.abort('Input closed')

    expect(await child.done).toEqual({ status: 'cancelled', reason: 'Input closed' })
    expect(await finished.done).toEqual({ status: 'finished', value: undefined })
  })

  it('fails when its timeout ends first', async () => {
    vi.useFakeTimers()
    try {
      const task = createTask({ timeoutMs: 50 })
      await vi.advanceTimersByTimeAsync(50)

      expect(await task.done).toMatchObject({ status: 'failed', error: { message: 'Task timed out' } })
      expect(task.signal.aborted).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('runs cleanups in reverse order and reports cleanup errors without changing the outcome', async () => {
    const order: string[] = []
    const onCleanupError = vi.fn()
    const task = createTask({ onCleanupError })
    task.defer(() => order.push('first'))
    task.defer(() => {
      throw new Error('Cleanup failed')
    })
    task.defer(() => order.push('last'))
    task.cancel('Stopped')
    await task.closed

    expect(order).toEqual(['last', 'first'])
    expect(onCleanupError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cleanup failed' }))
    expect(await task.done).toEqual({ status: 'cancelled', reason: 'Stopped' })
  })
})

describe('runTask', () => {
  it('finishes with the returned value and fails with a thrown error', async () => {
    expect(await runTask(async () => 42).done).toEqual({ status: 'finished', value: 42 })
    expect(await runTask(async () => {
      throw new Error('Broken')
    }).done).toMatchObject({ status: 'failed', error: { message: 'Broken' } })
  })

  it('keeps an explicit cancellation over the later return value', async () => {
    const task = runTask(async (self) => {
      self.cancel('Not needed')
      return 'ignored'
    })

    expect(await task.done).toEqual({ status: 'cancelled', reason: 'Not needed' })
  })
})

describe('worstOutcome', () => {
  it('prefers failure over cancellation over success', () => {
    const failed = { status: 'failed', error: new Error('Broken') } as const
    const cancelled = { status: 'cancelled', reason: 'Closed' } as const
    const finished = { status: 'finished', value: undefined } as const

    expect(worstOutcome([finished, cancelled, failed])).toBe(failed)
    expect(worstOutcome([finished, cancelled])).toBe(cancelled)
    expect(worstOutcome([finished])).toEqual(finished)
  })
})
