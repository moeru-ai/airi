import { afterEach, describe, expect, it, vi } from 'vitest'

import { RUN_PAST_DEADLINE, RUN_STALLED, superviseRun } from './run-supervision'

describe('run supervision', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('expires a run without activity after the stall limit, and activity keeps it alive', () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    const supervisor = superviseRun({ stallTimeoutMs: 100, deadlineMs: 1_000 }, onExpire)

    vi.advanceTimersByTime(90)
    supervisor.touch()
    vi.advanceTimersByTime(90)
    expect(onExpire).not.toHaveBeenCalled()

    vi.advanceTimersByTime(20)
    expect(onExpire).toHaveBeenCalledExactlyOnceWith(RUN_STALLED)
  })

  it('expires at the deadline even with activity, once', () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    const supervisor = superviseRun({ stallTimeoutMs: 100, deadlineMs: 250 }, onExpire)

    for (let elapsed = 0; elapsed < 300; elapsed += 50) {
      supervisor.touch()
      vi.advanceTimersByTime(50)
    }

    expect(onExpire).toHaveBeenCalledExactlyOnceWith(RUN_PAST_DEADLINE)
  })

  it('never expires after stop', () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    superviseRun({ stallTimeoutMs: 100, deadlineMs: 200 }, onExpire).stop()

    vi.advanceTimersByTime(500)
    expect(onExpire).not.toHaveBeenCalled()
  })
})
