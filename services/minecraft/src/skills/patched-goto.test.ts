import { describe, expect, it } from 'vitest'

import { hasMeaningfulPathfindingProgress } from './patched-goto'

describe('patched-goto', () => {
  it('treats meaningful movement as progress', () => {
    expect(hasMeaningfulPathfindingProgress({
      movedSinceLastTick: 1.6,
      previousDistanceToTarget: 10,
      distanceToTarget: 10,
      isMining: false,
      isBuilding: false,
    })).toBe(true)
  })

  it('treats closing in on the target as progress even without large movement', () => {
    expect(hasMeaningfulPathfindingProgress({
      movedSinceLastTick: 0.2,
      previousDistanceToTarget: 10,
      distanceToTarget: 9.2,
      isMining: false,
      isBuilding: false,
    })).toBe(true)
  })

  it('treats active mining and building as progress', () => {
    expect(hasMeaningfulPathfindingProgress({
      movedSinceLastTick: 0,
      previousDistanceToTarget: 10,
      distanceToTarget: 10,
      isMining: true,
      isBuilding: false,
    })).toBe(true)

    expect(hasMeaningfulPathfindingProgress({
      movedSinceLastTick: 0,
      previousDistanceToTarget: 10,
      distanceToTarget: 10,
      isMining: false,
      isBuilding: true,
    })).toBe(true)
  })

  it('still reports no progress for a truly stalled bot', () => {
    expect(hasMeaningfulPathfindingProgress({
      movedSinceLastTick: 0.1,
      previousDistanceToTarget: 10,
      distanceToTarget: 9.9,
      isMining: false,
      isBuilding: false,
    })).toBe(false)
  })

  it('does not treat replanning churn alone as progress', () => {
    expect(hasMeaningfulPathfindingProgress({
      movedSinceLastTick: 0,
      previousDistanceToTarget: 10,
      distanceToTarget: 10,
      isMining: false,
      isBuilding: false,
    })).toBe(false)
  })
})
