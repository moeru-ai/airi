import { describe, expect, it } from 'vitest'

import { findNearestSafeStand } from './escape-hazard'

const STONE = { name: 'stone', boundingBox: 'block' }
const AIR = { name: 'air', boundingBox: 'empty' }
const LAVA = { name: 'lava', boundingBox: 'empty' } // liquid: not standable, and a hazard so not "clear"

/**
 * Fake world: a small lava pool. Columns with |x|>=2 or |z|>=2 are dry land (stone floor at y<=63,
 * air above); inside the pool lava fills up to y=64 (the bot's feet) with air above.
 */
function poolBlockAt(x: number, y: number, z: number) {
  if (Math.abs(x) >= 2 || Math.abs(z) >= 2)
    return y <= 63 ? STONE : AIR
  return y <= 64 ? LAVA : AIR
}

describe('findNearestSafeStand', () => {
  it('finds the nearest dry edge to climb out of a lava pool', () => {
    const stand = findNearestSafeStand(poolBlockAt, { x: 0, y: 64, z: 0 }, 6)
    expect(stand).not.toBeNull()
    // an edge column (|x|==2 or |z|==2), standing at the bot's level on the stone lip
    expect(Math.abs(stand!.x) === 2 || Math.abs(stand!.z) === 2).toBe(true)
    expect(stand!.y).toBe(64)
  })

  it('never returns a spot standing on lava (the pool centre)', () => {
    const stand = findNearestSafeStand(poolBlockAt, { x: 0, y: 64, z: 0 }, 6)
    // the centre columns are lava under the feet -> must not be chosen
    expect(stand && Math.abs(stand.x) < 2 && Math.abs(stand.z) < 2).toBeFalsy()
  })

  it('returns null when no safe stand is within range (all lava)', () => {
    const allLava = (_x: number, y: number, _z: number) => (y <= 64 ? LAVA : AIR)
    expect(findNearestSafeStand(allLava, { x: 0, y: 64, z: 0 }, 4)).toBeNull()
  })
})
