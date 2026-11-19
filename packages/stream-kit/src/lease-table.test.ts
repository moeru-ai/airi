import { describe, expect, it } from 'vitest'

import { createLeaseTable } from './lease-table'

describe('createLeaseTable', () => {
  it('expires keys that were not touched for longer than the ttl', () => {
    const leases = createLeaseTable<string>({ ttlMs: 100 })
    leases.touch('a', 0)
    leases.touch('b', 0)
    leases.touch('b', 60)

    expect(leases.expired(100)).toEqual([])
    expect(leases.expired(101)).toEqual(['a'])
    expect(leases.has('a')).toBe(false)
    expect([...leases.keys()]).toEqual(['b'])
    expect(leases.expired(161)).toEqual(['b'])
  })

  it('deletes a key', () => {
    const leases = createLeaseTable<number>({ ttlMs: 100 })
    leases.touch(1, 0)

    leases.delete(1)

    expect(leases.has(1)).toBe(false)
    expect(leases.expired(1000)).toEqual([])
  })
})
