import { describe, expect, it } from 'vitest'

import { hasMeaningfulPathfindingProgress } from './patched-goto'

describe('patched-goto', () => {
  it('treats meaningful movement as progress', () => {
    expect(hasMeaningfulPathfindingProgress({
      distanceToTarget: 10,
      isBuilding: false,
      isMining: false,
      movedSinceLastTick: 1.6,
      previousDistanceToTarget: 10,
    })).toBe(true)
  })

  it('treats closing in on the target as progress even without large movement', () => {
    expect(hasMeaningfulPathfindingProgress({
      distanceToTarget: 9.2,
      isBuilding: false,
      isMining: false,
      movedSinceLastTick: 0.2,
      previousDistanceToTarget: 10,
    })).toBe(true)
  })

  it('treats active mining and building as progress', () => {
    expect(hasMeaningfulPathfindingProgress({
      distanceToTarget: 10,
      isBuilding: false,
      isMining: true,
      movedSinceLastTick: 0,
      previousDistanceToTarget: 10,
    })).toBe(true)

    expect(hasMeaningfulPathfindingProgress({
      distanceToTarget: 10,
      isBuilding: true,
      isMining: false,
      movedSinceLastTick: 0,
      previousDistanceToTarget: 10,
    })).toBe(true)
  })

  it('still reports no progress for a truly stalled bot', () => {
    expect(hasMeaningfulPathfindingProgress({
      distanceToTarget: 9.9,
      isBuilding: false,
      isMining: false,
      movedSinceLastTick: 0.1,
      previousDistanceToTarget: 10,
    })).toBe(false)
  })

  it('does not treat replanning churn alone as progress', () => {
    expect(hasMeaningfulPathfindingProgress({
      distanceToTarget: 10,
      isBuilding: false,
      isMining: false,
      movedSinceLastTick: 0,
      previousDistanceToTarget: 10,
    })).toBe(false)
  })
})
