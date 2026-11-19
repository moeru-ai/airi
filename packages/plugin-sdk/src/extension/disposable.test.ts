import { describe, expect, it, vi } from 'vitest'

import { DisposableStore } from './index'

describe('disposable store', () => {
  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // The first rejected disposer stopped the loop and skipped the remaining entries.
  // Disposal now attempts every entry before it reports the collected failures.
  it('attempts every disposer and retains all failures in reverse order (PR #2687)', async () => {
    const store = new DisposableStore()
    const order: string[] = []
    const syncError = new Error('sync cleanup failed')
    const asyncError = new Error('async cleanup failed')
    store.add({ dispose: () => {
      order.push('first')
    } })
    store.add({ dispose: () => {
      order.push('second')
      throw syncError
    } })
    store.add({ dispose: async () => {
      await Promise.resolve()
      order.push('third')
      throw asyncError
    } })

    await expect(store.dispose()).rejects.toMatchObject({ errors: [asyncError, syncError] })
    expect(order).toEqual(['third', 'second', 'first'])
    await store.dispose()
    expect(order).toEqual(['third', 'second', 'first'])
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // A single failure skipped earlier entries even after the store became terminal.
  // Remaining entries now run once, and the original error survives without a retry.
  it('keeps the original single failure without retrying disposers (PR #2687)', async () => {
    const store = new DisposableStore()
    const cleanupError = new Error('cleanup failed')
    const remaining = vi.fn()
    const failing = vi.fn(() => {
      throw cleanupError
    })
    store.add({ dispose: remaining })
    store.add({ dispose: failing })

    await expect(store.dispose()).rejects.toBe(cleanupError)
    await store.dispose()
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('waits for each disposer before attempting the next', async () => {
    const store = new DisposableStore()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const order: string[] = []
    store.add({ dispose: () => {
      order.push('first')
    } })
    store.add({ dispose: async () => {
      order.push('second-enter')
      entered.resolve()
      await resume.promise
      order.push('second-exit')
    } })

    const disposing = store.dispose()
    await entered.promise
    expect(order).toEqual(['second-enter'])
    resume.resolve()
    await disposing
    expect(order).toEqual(['second-enter', 'second-exit', 'first'])
  })

  it('keeps repeated disposal inside a disposer as a no-op', async () => {
    const store = new DisposableStore()
    const remaining = vi.fn()
    store.add({ dispose: remaining })
    store.add({ dispose: async () => {
      await store.dispose()
    } })

    await store.dispose()
    expect(remaining).toHaveBeenCalledTimes(1)
  })
})
