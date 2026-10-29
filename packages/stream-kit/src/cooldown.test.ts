import { describe, expect, it } from 'vitest'

import { createCooldown } from './cooldown'

describe('createCooldown', () => {
  it('allows one acquire per window for each key', () => {
    const cooldown = createCooldown({ ms: 100 })

    expect(cooldown.tryAcquire('a', 0)).toBe(true)
    expect(cooldown.tryAcquire('a', 99)).toBe(false)
    expect(cooldown.tryAcquire('b', 50)).toBe(true)
    expect(cooldown.tryAcquire('a', 100)).toBe(true)
    expect(cooldown.tryAcquire('a', 150)).toBe(false)
  })

  it('does not start a new window on a failed acquire', () => {
    const cooldown = createCooldown({ ms: 100 })

    cooldown.tryAcquire('a', 0)
    cooldown.tryAcquire('a', 90)

    expect(cooldown.tryAcquire('a', 100)).toBe(true)
  })
})
