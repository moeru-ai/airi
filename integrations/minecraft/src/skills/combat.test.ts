import { describe, expect, it } from 'vitest'

import { shouldKeepWaitingForDrops } from './combat'

// ROOT CAUSE:
//
// collectNearbyDrops scanned for dropped items immediately after the kill and did `if (!drop) break`
// — it gave up on the FIRST empty scan. But drop entities (mutton/wool) spawn a few hundred ms AFTER
// the mob dies, so that first scan is almost always empty: the bot killed the sheep and reported
// "生羊肉 0 块". The fix keeps polling within a grace window (this decision) so late drops are
// collected, while still stopping promptly when nothing more appears or the hard deadline hits.

describe('shouldKeepWaitingForDrops', () => {
  const base = { deadline: 10_000, idleGraceMs: 1500 }

  it('keeps waiting shortly after the kill, before drops have spawned', () => {
    // 300ms since the last activity — well within the 1500ms grace, so do NOT give up (the old bug)
    expect(shouldKeepWaitingForDrops({ ...base, now: 300, lastFoundAt: 0 })).toBe(true)
  })

  it('stops once no new drop has appeared for the whole grace window', () => {
    expect(shouldKeepWaitingForDrops({ ...base, now: 1500, lastFoundAt: 0 })).toBe(false)
    expect(shouldKeepWaitingForDrops({ ...base, now: 1600, lastFoundAt: 0 })).toBe(false)
  })

  it('resets the grace window each time a drop is collected', () => {
    // a drop was just collected at t=5000; 1s later we are still within grace -> keep going
    expect(shouldKeepWaitingForDrops({ ...base, now: 6000, lastFoundAt: 5000 })).toBe(true)
  })

  it('stops at the hard deadline even while still within the grace window', () => {
    expect(shouldKeepWaitingForDrops({ ...base, now: 10_000, lastFoundAt: 9_900 })).toBe(false)
  })
})
