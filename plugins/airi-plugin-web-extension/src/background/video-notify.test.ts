import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VideoNotifyGate } from './video-notify'

function report(videoId: string, title: string, currentTimeSec = 0) {
  return { url: `https://example.com/watch?v=${videoId}`, videoId, title, currentTimeSec }
}

function navigationReport(videoId: string, title: string, phase: 'changing' | 'ready', currentTimeSec = 0) {
  return { ...report(videoId, title, currentTimeSec), navigation: { id: videoId, phase } }
}

describe('video notify gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('notifies a video after its title stays the same', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)

    gate.report(report('a', 'Song A'))
    vi.advanceTimersByTime(2_999)
    expect(onSettle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith(report('a', 'Song A'))
  })

  it('notifies after one report, without a second report', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)

    gate.report(report('a', 'Song A'))
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledTimes(1)
  })

  it('notifies a video only once', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Song A'))
    vi.advanceTimersByTime(3_000)

    gate.report(report('a', 'Song A', 15))
    vi.advanceTimersByTime(20_000)

    expect(onSettle).toHaveBeenCalledTimes(1)
  })

  it('sends the latest report of a video', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)

    gate.report(report('a', 'Song A', 1))
    gate.report(report('a', 'Song A', 2))
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledWith(report('a', 'Song A', 2))
  })

  it('waits for the real title when a new video id carries the previous title', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Song A'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()
    vi.advanceTimersByTime(30_000)

    gate.report(report('b', 'Song A'), 1)
    vi.advanceTimersByTime(2_000)
    gate.report(report('b', 'Song B'), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith(report('b', 'Song B'))
  })

  it('ignores a stale page title of the previous video', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Song'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()
    vi.advanceTimersByTime(30_000)

    gate.report(report('b', '(3) Song - YouTube'), 1)
    vi.advanceTimersByTime(9_999)

    expect(onSettle).not.toHaveBeenCalled()
  })

  it('notifies a new video with the same title after the title stays', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Live'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()
    vi.advanceTimersByTime(30_000)

    gate.report(report('b', 'Live'), 1)
    vi.advanceTimersByTime(9_999)
    expect(onSettle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSettle).toHaveBeenCalledWith(report('b', 'Live'))
  })

  it('notifies a new title that contains the previous title', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Part 1'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()
    vi.advanceTimersByTime(30_000)

    gate.report(report('b', 'Part 1 (Director\'s Cut)'), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledWith(report('b', 'Part 1 (Director\'s Cut)'))
  })

  it('does not treat the title of another tab as stale', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Song'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()
    vi.advanceTimersByTime(30_000)

    gate.report(report('b', 'Song'), 2)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledWith(report('b', 'Song'))
  })

  it('forgets the last title of a closed tab', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Song'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()
    vi.advanceTimersByTime(30_000)

    gate.forgetTab(1)
    gate.report(report('b', 'Song'), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledWith(report('b', 'Song'))
  })

  it('notifies each of two playing tabs once', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)

    gate.report(report('a', 'Song A'), 1)
    vi.advanceTimersByTime(30_000)
    gate.report(report('b', 'Song B'), 2)
    vi.advanceTimersByTime(3_000)
    gate.report(report('a', 'Song A', 15), 1)
    gate.report(report('b', 'Song B', 15), 2)
    vi.advanceTimersByTime(60_000)

    expect(onSettle).toHaveBeenCalledTimes(2)
  })

  it('skips a video that settles within the cooldown', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Short A'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()

    gate.report(report('b', 'Short B'), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).not.toHaveBeenCalled()
  })

  it('notifies a skipped video when the user comes back after the cooldown', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Short A'), 1)
    vi.advanceTimersByTime(3_000)
    gate.report(report('b', 'Short B'), 1)
    vi.advanceTimersByTime(3_000)
    gate.report(report('c', 'Short C'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()

    vi.advanceTimersByTime(30_000)
    gate.report(report('b', 'Short B', 1), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledWith(report('b', 'Short B', 1))
  })

  it('does not notify a notified video when the user comes back', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Short A'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()

    vi.advanceTimersByTime(60_000)
    gate.report(report('a', 'Short A', 1), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).not.toHaveBeenCalled()
  })

  it('notifies again after the cooldown', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)
    gate.report(report('a', 'Short A'), 1)
    vi.advanceTimersByTime(3_000)
    onSettle.mockClear()

    vi.advanceTimersByTime(27_000)
    gate.report(report('c', 'Short C'), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledWith(report('c', 'Short C'))
  })

  it('does not notify a video that the user left before it settled', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)

    gate.report(report('a', 'Short A'), 1)
    vi.advanceTimersByTime(1_000)
    gate.report(report('b', 'Short B'), 1)
    vi.advanceTimersByTime(3_000)

    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith(report('b', 'Short B'))
  })

  describe('with navigation', () => {
    it('notifies a ready video after the user stays on it', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)

      gate.report(navigationReport('a', 'Song A', 'ready'), 1)
      vi.advanceTimersByTime(2_999)
      expect(onSettle).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(onSettle).toHaveBeenCalledWith(navigationReport('a', 'Song A', 'ready'))
    })

    it('does not notify while the navigation is changing', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)

      gate.report(navigationReport('a', 'Song A', 'changing'), 1)
      vi.advanceTimersByTime(20_000)

      expect(onSettle).not.toHaveBeenCalled()
    })

    it('waits for ready, not for the old title to change', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)
      gate.report(navigationReport('a', 'Song A', 'ready'), 1)
      vi.advanceTimersByTime(3_000)
      onSettle.mockClear()
      vi.advanceTimersByTime(30_000)

      gate.report(navigationReport('b', 'Song A', 'changing'), 1)
      vi.advanceTimersByTime(2_000)
      gate.report(navigationReport('b', 'Song B', 'ready'), 1)
      vi.advanceTimersByTime(3_000)

      expect(onSettle).toHaveBeenCalledTimes(1)
      expect(onSettle).toHaveBeenCalledWith(navigationReport('b', 'Song B', 'ready'))
    })

    it('does not wait the stale title window when a ready video has the previous title', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)
      gate.report(navigationReport('a', 'Live', 'ready'), 1)
      vi.advanceTimersByTime(3_000)
      onSettle.mockClear()
      vi.advanceTimersByTime(30_000)

      gate.report(navigationReport('b', 'Live', 'ready'), 1)
      vi.advanceTimersByTime(3_000)

      expect(onSettle).toHaveBeenCalledWith(navigationReport('b', 'Live', 'ready'))
    })

    it('keeps the dwell timer when a ready video reports again', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)

      gate.report(navigationReport('a', 'Song A', 'ready', 1), 1)
      vi.advanceTimersByTime(2_000)
      gate.report(navigationReport('a', 'Song A', 'ready', 2), 1)
      vi.advanceTimersByTime(1_000)

      expect(onSettle).toHaveBeenCalledWith(navigationReport('a', 'Song A', 'ready', 2))
    })

    it('does not notify a ready video that the user left before the dwell time', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)

      gate.report(navigationReport('a', 'Short A', 'ready'), 1)
      vi.advanceTimersByTime(1_000)
      gate.report(navigationReport('b', 'Short A', 'changing'), 1)
      vi.advanceTimersByTime(10_000)

      expect(onSettle).not.toHaveBeenCalled()
    })

    it('skips a ready video within the cooldown', () => {
      const onSettle = vi.fn()
      const gate = new VideoNotifyGate(onSettle)
      gate.report(navigationReport('a', 'Short A', 'ready'), 1)
      vi.advanceTimersByTime(3_000)
      onSettle.mockClear()

      gate.report(navigationReport('b', 'Short B', 'ready'), 1)
      vi.advanceTimersByTime(3_000)

      expect(onSettle).not.toHaveBeenCalled()
    })
  })

  it('stops pending timers on dispose', () => {
    const onSettle = vi.fn()
    const gate = new VideoNotifyGate(onSettle)

    gate.report(report('a', 'Song A'))
    gate.dispose()
    vi.advanceTimersByTime(3_000)

    expect(onSettle).not.toHaveBeenCalled()
  })
})
