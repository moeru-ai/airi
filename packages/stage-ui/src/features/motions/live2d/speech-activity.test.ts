import { describe, expect, it, vi } from 'vitest'

import { createLive2DMotionVoiceActivity } from './speech-activity'

/** Feeds 50 ms samples and returns the time after the last sample. */
function feed(activity: ReturnType<typeof createLive2DMotionVoiceActivity>, startMs: number, durationMs: number, level: number) {
  for (let atMs = startMs; atMs < startMs + durationMs; atMs += 50)
    activity.update(level, atMs)
  return startMs + durationMs
}

describe('createLive2DMotionVoiceActivity', () => {
  it('speaks soon after the voice starts and returns to idle after a silence', () => {
    // ROOT CAUSE:
    //
    // The profile followed the turn and playback timers of the response, so it
    // changed before the voice and stayed after it. A timer hold felt wrong.
    //
    // We fixed this by following the loudness of the speech itself.
    const onChange = vi.fn()
    const activity = createLive2DMotionVoiceActivity({ onChange })

    let atMs = feed(activity, 0, 200, 0)
    atMs = feed(activity, atMs, 300, 0.7)
    expect(activity.current()).toBe('speaking')

    atMs = feed(activity, atMs, 300, 0)
    expect(activity.current()).toBe('speaking')

    feed(activity, atMs, 1500, 0)
    expect(activity.current()).toBe('idle')
    expect(onChange.mock.calls).toEqual([['speaking'], ['idle']])
  })

  it('keeps speaking through gaps between words', () => {
    const onChange = vi.fn()
    const activity = createLive2DMotionVoiceActivity({ onChange })

    let atMs = 0
    for (let word = 0; word < 20; word += 1) {
      atMs = feed(activity, atMs, 250, 0.65)
      atMs = feed(activity, atMs, 200, 0.05)
    }

    expect(onChange).toHaveBeenCalledOnce()
    expect(activity.current()).toBe('speaking')
  })

  it('ignores quiet noise and a single short click', () => {
    const onChange = vi.fn()
    const activity = createLive2DMotionVoiceActivity({ onChange })

    let atMs = feed(activity, 0, 2000, 0.25)
    atMs = feed(activity, atMs, 50, 0.9)
    feed(activity, atMs, 500, 0)

    expect(onChange).not.toHaveBeenCalled()
  })
})
