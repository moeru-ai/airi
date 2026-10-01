import { describe, expect, it } from 'vitest'

import { LeaseTable } from './lease-table'

describe('lease table', () => {
  it('grants a free resource to one holder at a time', () => {
    const leases = new LeaseTable()

    expect(leases.acquire('voice', 'a', { salience: 0.5 }).granted).toBe(true)
    expect(leases.acquire('voice', 'b', { salience: 0.9 })).toMatchObject({ granted: false, holder: { holderRunId: 'a' } })
    // Salience alone never takes a lease. The requester must ask to preempt.
    expect(leases.holder('voice')?.holderRunId).toBe('a')
  })

  it('transfers a lease only to strictly higher salience with preempt', () => {
    const leases = new LeaseTable()
    leases.acquire('module:minecraft', 'a', { salience: 0.5 })

    expect(leases.acquire('module:minecraft', 'b', { salience: 0.5, preempt: true }).granted).toBe(false)
    expect(leases.acquire('module:minecraft', 'b', { salience: 0.9, preempt: true })).toMatchObject({ granted: true, previous: { holderRunId: 'a' } })
    expect(leases.holder('module:minecraft')?.holderRunId).toBe('b')
  })

  it('frees an expired lease and keeps the grant time on renewal', () => {
    let now = 0
    const leases = new LeaseTable({ now: () => now })
    leases.acquire('module:minecraft', 'a', { salience: 0.5, ttlMs: 100 })

    now = 50
    expect(leases.acquire('module:minecraft', 'a', { salience: 0.5, ttlMs: 100 })).toMatchObject({ granted: true, lease: { grantedAt: 0, expiresAt: 150 } })
    now = 150
    expect(leases.holder('module:minecraft')).toBeUndefined()
    expect(leases.acquire('module:minecraft', 'b', { salience: 0.1 }).granted).toBe(true)
  })

  it('releases only the holder and notifies subscribers', () => {
    const leases = new LeaseTable()
    const changes: string[] = []
    leases.subscribe(() => changes.push(leases.snapshot().map(lease => lease.holderRunId).join(',')))
    leases.acquire('voice', 'a', { salience: 0.5 })
    leases.acquire('module:minecraft', 'a', { salience: 0.5 })

    leases.release('voice', 'b')
    expect(leases.holder('voice')?.holderRunId).toBe('a')
    leases.releaseAll('a')
    expect(leases.snapshot()).toEqual([])
    expect(changes).toEqual(['a', 'a,a', ''])
  })
})
