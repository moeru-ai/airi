import { describe, expect, it } from 'vitest'

import { compareLeaseCandidates, LEASE_CANDIDATE_TTL_MS, LeaseTable } from './lease-table'

describe('lease table', () => {
  it('grants a free resource to one holder at a time', () => {
    const leases = new LeaseTable()

    expect(leases.acquire('voice', 'a', { salience: 0.5 }).granted).toBe(true)
    expect(leases.acquire('voice', 'b', { salience: 0.9 })).toMatchObject({ granted: false, current: { holder: 'a' } })
    // Salience alone never takes a lease. The requester must ask to preempt.
    expect(leases.holder('voice')?.holder).toBe('a')
  })

  it('transfers a lease only to strictly higher salience with preempt', () => {
    const leases = new LeaseTable()
    leases.acquire('module:minecraft', 'a', { salience: 0.5 })

    expect(leases.acquire('module:minecraft', 'b', { salience: 0.5, preempt: true }).granted).toBe(false)
    expect(leases.acquire('module:minecraft', 'b', { salience: 0.9, preempt: true })).toMatchObject({ granted: true, previous: { holder: 'a' } })
    expect(leases.holder('module:minecraft')?.holder).toBe('b')
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
    leases.subscribe(() => changes.push(leases.snapshot().map(lease => lease.holder).join(',')))
    leases.acquire('voice', 'a', { salience: 0.5 })
    leases.acquire('module:minecraft', 'a', { salience: 0.5 })

    leases.release('voice', 'b')
    expect(leases.holder('voice')?.holder).toBe('a')
    leases.releaseAll('a')
    expect(leases.snapshot()).toEqual([])
    expect(changes).toEqual(['a', 'a,a', ''])
  })
})

describe('lease lines', () => {
  it('orders candidates by salience tier, then deadline, then waiting time', () => {
    const candidates = [
      { id: 'late-normal', salience: 0.5, waitingSince: 5 },
      { id: 'early-normal', salience: 0.55, waitingSince: 1 },
      { id: 'urgent', salience: 0.9, waitingSince: 9 },
      { id: 'due-soon', salience: 0.5, deadlineAt: 100, waitingSince: 8 },
    ]

    expect(candidates.sort(compareLeaseCandidates).map(candidate => candidate.id)).toEqual(['urgent', 'due-soon', 'early-normal', 'late-normal'])
  })

  // The first come does not win a contested resource. Waiting time only breaks ties inside a tier.
  it('grants a released resource to the first candidate in line', () => {
    let now = 0
    const leases = new LeaseTable({ now: () => now })
    leases.acquire('voice', 'speaking', { salience: 0.5 })
    leases.acquire('voice', 'chat', { salience: 0.5, waitingSince: 0 })
    now = 5
    leases.acquire('voice', 'alarm', { salience: 0.9 })
    leases.release('voice', 'speaking')

    expect(leases.acquire('voice', 'chat', { salience: 0.5 })).toEqual({ granted: false, ahead: 'alarm' })
    expect(leases.acquire('voice', 'alarm', { salience: 0.9 }).granted).toBe(true)
    leases.release('voice', 'alarm')
    expect(leases.acquire('voice', 'chat', { salience: 0.5 }).granted).toBe(true)
  })

  it('drops candidates that stop asking, withdraw, or pass their deadline', () => {
    let now = 0
    const leases = new LeaseTable({ now: () => now })
    leases.acquire('voice', 'speaking', { salience: 0.5 })
    leases.acquire('voice', 'gone', { salience: 0.9 })
    leases.acquire('voice', 'cancelled', { salience: 0.9 })
    leases.acquire('voice', 'expired', { salience: 0.9, deadlineAt: 50 })
    leases.withdraw('voice', 'cancelled')
    leases.release('voice', 'speaking')

    now = 100
    expect(leases.acquire('voice', 'chat', { salience: 0.5 })).toEqual({ granted: false, ahead: 'gone' })
    now = LEASE_CANDIDATE_TTL_MS
    expect(leases.acquire('voice', 'chat', { salience: 0.5 }).granted).toBe(true)
  })

  it('keeps lines apart, so work on another resource never waits', () => {
    const leases = new LeaseTable()
    leases.acquire('voice', 'speaking', { salience: 0.5 })
    leases.acquire('voice', 'urgent', { salience: 0.9 })

    expect(leases.acquire('module:minecraft', 'domain', { salience: 0.3 }).granted).toBe(true)
  })
})
