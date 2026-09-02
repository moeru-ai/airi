import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDebouncedValidationRunner, createLatestValidationGuard, createValidationStatusRestorer } from './validation-run'

afterEach(() => {
  vi.useRealTimers()
})

describe('provider validation run guard', () => {
  it('invalidates an older validation when the draft changes', () => {
    const guard = createLatestValidationGuard()
    const isFirstRunCurrent = guard.begin()

    guard.invalidate()

    expect(isFirstRunCurrent()).toBe(false)
  })

  it('keeps only the latest overlapping validation current', () => {
    const guard = createLatestValidationGuard()
    const isFirstRunCurrent = guard.begin()
    const isSecondRunCurrent = guard.begin()

    expect(isFirstRunCurrent()).toBe(false)
    expect(isSecondRunCurrent()).toBe(true)
  })

  it('cancels a pending validation when the editor is disposed', async () => {
    vi.useFakeTimers()
    const validate = vi.fn()
    const runner = createDebouncedValidationRunner(validate, 1500)

    void runner.run()
    runner.cancel()
    await vi.advanceTimersByTimeAsync(1500)

    expect(validate).not.toHaveBeenCalled()
  })

  it('keeps a plan that resolves after unmount stale', async () => {
    let resolvePlan!: () => void
    const plan = new Promise<void>((resolve) => {
      resolvePlan = resolve
    })
    const guard = createLatestValidationGuard()
    let committed = false

    const validation = (async () => {
      const isCurrentRun = guard.begin()
      await plan
      if (isCurrentRun())
        committed = true
    })()
    guard.invalidate()
    resolvePlan()
    await validation

    expect(committed).toBe(false)
  })

  it('awaits conditional status restoration before clearing the active run', async () => {
    const statuses = new Map<string, string>([['funasr', 'configured']])
    const restoreStatus = vi.fn(async (providerId: string, status: string) => {
      if (statuses.get(providerId) === 'validating')
        statuses.set(providerId, status)
    })
    const restorer = createValidationStatusRestorer(restoreStatus)

    restorer.begin('funasr', 'configured')
    statuses.set('funasr', 'validating')
    await restorer.restore()
    expect(statuses.get('funasr')).toBe('configured')
    expect(restoreStatus).toHaveBeenCalledTimes(1)

    restorer.begin('funasr', 'configured')
    statuses.set('funasr', 'invalid')
    await restorer.restore()
    expect(statuses.get('funasr')).toBe('invalid')
  })
})
