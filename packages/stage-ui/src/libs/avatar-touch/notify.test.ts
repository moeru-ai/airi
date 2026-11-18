import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAvatarTouchAggregator, createAvatarTouchCooldown, toAvatarTouchSparkNotify } from './notify'

describe('createAvatarTouchAggregator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends one summary for each region after the touches settle', () => {
    const onSummary = vi.fn()
    const aggregator = createAvatarTouchAggregator({ onSummary, settleMs: 1000 })

    for (let index = 0; index < 5; index += 1) {
      aggregator.record({ region: 'head', gesture: 'pat' })
      vi.advanceTimersByTime(200)
    }
    aggregator.record({ region: 'head', gesture: 'tap' })
    aggregator.record({ region: 'body', gesture: 'tap' })
    vi.advanceTimersByTime(999)
    expect(onSummary).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSummary.mock.calls).toEqual([
      [{ region: 'head', taps: 1, pats: 5 }],
      [{ region: 'body', taps: 1, pats: 0 }],
    ])
  })

  it('drops the burst on dispose', () => {
    const onSummary = vi.fn()
    const aggregator = createAvatarTouchAggregator({ onSummary, settleMs: 1000 })
    aggregator.record({ region: 'head', gesture: 'tap' })
    aggregator.dispose()
    vi.advanceTimersByTime(5000)
    expect(onSummary).not.toHaveBeenCalled()
  })
})

describe('createAvatarTouchCooldown', () => {
  it('allows one notification for each region in each cooldown', () => {
    const cooldown = createAvatarTouchCooldown(20_000)

    expect(cooldown.allow('head', 0)).toBe(true)
    expect(cooldown.allow('head', 19_999)).toBe(false)
    expect(cooldown.allow('body', 5_000)).toBe(true)
    expect(cooldown.allow('head', 20_000)).toBe(true)
  })
})

describe('toAvatarTouchSparkNotify', () => {
  it('describes the burst for the character and keeps the counts', () => {
    const event = toAvatarTouchSparkNotify({ region: 'head', taps: 1, pats: 3 }, 'touch-1')

    expect(event.type).toBe('spark:notify')
    expect(event.data).toMatchObject({
      id: 'touch-1',
      kind: 'ping',
      urgency: 'immediate',
      destinations: ['character'],
      payload: { region: 'head', taps: 1, pats: 3 },
    })
    expect(event.data.headline).toBe('The user patted your head (3 times) and tapped your head (once).')
  })
})
