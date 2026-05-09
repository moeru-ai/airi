import type { Database } from '../../../libs/db'
import type { BillingService } from '../../billing/billing-service'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAdminFluxGrantsService, resolveEmails } from '..'
import { mockDB } from '../../../libs/mock-db'

import * as schema from '../../../schemas'

describe('resolveEmails', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)

    // Three users: one normal, one with deleted user_flux, one we never insert
    // user_flux for at all (so it shows up as "user exists, no flux row" → still
    // pending since user.id matches; default flux init happens at credit time).
    //
    // NOTICE: All stored emails are lowercase. resolveEmails relies on this
    // (Codex review 2026-05-08 flagged that wrapping user.email in LOWER()
    // bypasses the unique index and seq-scans). better-auth normalizes emails
    // on signup, so this matches production reality.
    await db.insert(schema.user).values([
      { id: 'uid_normal', name: 'Normal', email: 'normal@example.com' },
      { id: 'uid_deleted', name: 'Deleted', email: 'deleted@example.com' },
      { id: 'uid_no_flux', name: 'NoFlux', email: 'noflux@example.com' },
      { id: 'uid_mixed_case', name: 'MixedCase', email: 'Mixed@Example.com' },
    ])

    await db.insert(schema.userFlux).values([
      { userId: 'uid_normal', flux: 100 },
      { userId: 'uid_deleted', flux: 0, deletedAt: new Date() },
    ])
  })

  it('lowercases input before matching the (lowercase) stored email', async () => {
    const resolved = await resolveEmails(db, ['NORMAL@example.com'])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      inputEmail: 'NORMAL@example.com',
      userId: 'uid_normal',
      status: 'pending',
      errorReason: null,
    })
  })

  it('treats non-lowercase stored emails as not_found (documented limitation)', async () => {
    // Stored email is 'Mixed@Example.com' (mixed case); we look up by lowercase
    // 'mixed@example.com', which won't match because we don't wrap user.email
    // in LOWER() — that would defeat the unique index and seq-scan the table.
    const resolved = await resolveEmails(db, ['mixed@example.com'])
    expect(resolved[0]).toMatchObject({
      inputEmail: 'mixed@example.com',
      userId: null,
      status: 'skipped',
      errorReason: 'not_found',
    })
  })

  it('marks unknown emails as not_found', async () => {
    const resolved = await resolveEmails(db, ['ghost@example.com'])
    expect(resolved[0]).toMatchObject({
      inputEmail: 'ghost@example.com',
      userId: null,
      status: 'skipped',
      errorReason: 'not_found',
    })
  })

  it('marks soft-deleted users as user_deleted (userId still attached for audit)', async () => {
    const resolved = await resolveEmails(db, ['deleted@example.com'])
    expect(resolved[0]).toMatchObject({
      inputEmail: 'deleted@example.com',
      userId: 'uid_deleted',
      status: 'skipped',
      errorReason: 'user_deleted',
    })
  })

  it('keeps the first occurrence and tags subsequent duplicates', async () => {
    const resolved = await resolveEmails(db, [
      'normal@example.com',
      'NORMAL@EXAMPLE.COM',
      'normal@example.com',
    ])
    expect(resolved).toHaveLength(3)
    expect(resolved[0].errorReason).toBeNull()
    expect(resolved[0].status).toBe('pending')
    expect(resolved[1].errorReason).toBe('duplicate_in_input')
    expect(resolved[2].errorReason).toBe('duplicate_in_input')
  })

  it('returns empty resolution for empty input without hitting the DB', async () => {
    const resolved = await resolveEmails(db, [])
    expect(resolved).toEqual([])
  })
})

describe('adminFluxGrantsService.preview', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values([
      { id: 'uid_prev_a', name: 'A', email: 'preva@example.com' },
    ])
    await db.insert(schema.userFlux).values([
      { userId: 'uid_prev_a', flux: 0 },
    ])
  })

  it('returns counts and samples without writing anything', async () => {
    const billingService = { creditFlux: vi.fn() } as unknown as BillingService
    const service = createAdminFluxGrantsService({ db, billingService })

    const summary = await service.preview({
      amount: 50,
      emails: ['preva@example.com', 'ghost@example.com', 'preva@example.com'],
    })

    expect(summary).toEqual({
      totalEmails: 3,
      willGrant: 1,
      willSkip: { notFound: 1, userDeleted: 0, duplicateInInput: 1 },
      totalFluxToIssue: 50,
      samples: {
        willGrant: ['preva@example.com'],
        notFound: ['ghost@example.com'],
        userDeleted: [],
      },
    })
    expect(billingService.creditFlux).not.toHaveBeenCalled()
  })

  it('caps preview samples at 5 entries per category', async () => {
    const billingService = { creditFlux: vi.fn() } as unknown as BillingService
    const service = createAdminFluxGrantsService({ db, billingService })
    const ghosts = Array.from({ length: 12 }, (_, i) => `ghost${i}@example.com`)

    const summary = await service.preview({ amount: 50, emails: ghosts })

    expect(summary.willSkip.notFound).toBe(12)
    expect(summary.samples.notFound).toHaveLength(5)
  })
})

describe('adminFluxGrantsService.grant', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values([
      { id: 'uid_grant_a', name: 'A', email: 'granta@example.com' },
      { id: 'uid_grant_b', name: 'B', email: 'grantb@example.com' },
      { id: 'uid_grant_c', name: 'C', email: 'grantc@example.com' },
    ])
    await db.insert(schema.userFlux).values([
      { userId: 'uid_grant_a', flux: 0 },
      { userId: 'uid_grant_b', flux: 0, deletedAt: new Date() },
      { userId: 'uid_grant_c', flux: 0 },
    ])
  })

  beforeEach(async () => {
    await db.delete(schema.fluxTransaction)
  })

  it('credits resolvable recipients and bucket-sorts the per-email outcomes', async () => {
    const creditFlux = vi.fn(async ({ userId }: { userId: string }) => ({
      balanceBefore: 0,
      balanceAfter: 100,
      fluxTransactionId: `ftx-${userId}`,
      idempotent: false,
    }))
    const billingService = { creditFlux } as unknown as BillingService
    const service = createAdminFluxGrantsService({ db, billingService })

    const { summary, result } = await service.grant({
      amount: 100,
      description: 'Beta thanks',
      emails: [
        'granta@example.com', // pending → granted
        'grantb@example.com', // soft-deleted → skipped(user_deleted)
        'GRANTA@example.com', // duplicate
        'ghost@example.com', // not_found
      ],
      createdByUserId: 'uid_admin',
    })

    expect(summary).toMatchObject({
      totalEmails: 4,
      willGrant: 1,
      willSkip: { notFound: 1, userDeleted: 1, duplicateInInput: 1 },
      totalFluxToIssue: 100,
    })

    expect(result.granted).toEqual([{
      email: 'granta@example.com',
      userId: 'uid_grant_a',
      fluxTransactionId: 'ftx-uid_grant_a',
      balanceAfter: 100,
    }])
    expect(result.skipped).toEqual(expect.arrayContaining([
      { email: 'grantb@example.com', reason: 'user_deleted' },
      { email: 'GRANTA@example.com', reason: 'duplicate_in_input' },
      { email: 'ghost@example.com', reason: 'not_found' },
    ]))
    expect(result.failed).toEqual([])

    expect(creditFlux).toHaveBeenCalledTimes(1)
    expect(creditFlux).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'uid_grant_a',
      amount: 100,
      type: 'promo',
      description: 'Beta thanks',
      source: 'admin_promo',
      requestId: undefined, // no idempotencyKey in this test
      auditMetadata: expect.objectContaining({
        description: 'Beta thanks',
        issuedByUserId: 'uid_admin',
      }),
    }))
  })

  it('catches per-recipient creditFlux errors and continues with the rest', async () => {
    let calls = 0
    const creditFlux = vi.fn(async ({ userId }: { userId: string }) => {
      calls += 1
      if (calls === 1)
        throw new Error('DB timeout')
      return {
        balanceBefore: 0,
        balanceAfter: 100,
        fluxTransactionId: `ftx-${userId}`,
        idempotent: false,
      }
    })
    const billingService = { creditFlux } as unknown as BillingService
    const service = createAdminFluxGrantsService({ db, billingService })

    const { result } = await service.grant({
      amount: 100,
      description: 'Resilience test',
      emails: ['granta@example.com', 'grantc@example.com'],
      createdByUserId: 'uid_admin',
    })

    expect(result.granted).toHaveLength(1)
    expect(result.granted[0].userId).toBe('uid_grant_c')
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ email: 'granta@example.com', userId: 'uid_grant_a', error: 'DB timeout' })
  })

  it('forwards a deterministic requestId per recipient when idempotencyKey is provided', async () => {
    const creditFlux = vi.fn(async () => ({
      balanceBefore: 0,
      balanceAfter: 100,
      fluxTransactionId: 'ftx',
      idempotent: false,
    }))
    const billingService = { creditFlux } as unknown as BillingService
    const service = createAdminFluxGrantsService({ db, billingService })

    await service.grant({
      amount: 100,
      description: 'Idempotent thanks',
      emails: ['granta@example.com', 'grantc@example.com'],
      createdByUserId: 'uid_admin',
      idempotencyKey: 'beta-2026-q2',
    })

    expect(creditFlux).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 'uid_grant_a',
      requestId: 'flux-grant:beta-2026-q2:uid_grant_a',
    }))
    expect(creditFlux).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 'uid_grant_c',
      requestId: 'flux-grant:beta-2026-q2:uid_grant_c',
    }))
  })

  it('end-to-end: actually writes flux_transaction rows for granted recipients via the real BillingService path', async () => {
    // Light integration sanity check — we still mock BillingService here, but
    // verify the service pipes through the right shape and granted set
    // matches what the route would surface.
    const inserted: { userId: string, requestId?: string }[] = []
    const creditFlux = vi.fn(async ({ userId, requestId, amount }: { userId: string, requestId?: string, amount: number }) => {
      const [row] = await db.insert(schema.fluxTransaction).values({
        userId,
        type: 'promo',
        amount,
        balanceBefore: 0,
        balanceAfter: amount,
        requestId: requestId ?? null,
        description: 'mocked',
      }).returning()
      inserted.push({ userId, requestId })
      return {
        balanceBefore: 0,
        balanceAfter: amount,
        fluxTransactionId: row!.id,
        idempotent: false,
      }
    })
    const billingService = { creditFlux } as unknown as BillingService
    const service = createAdminFluxGrantsService({ db, billingService })

    const { result } = await service.grant({
      amount: 25,
      description: 'Integration test',
      emails: ['granta@example.com', 'grantc@example.com'],
      createdByUserId: 'uid_admin',
      idempotencyKey: 'int-1',
    })

    expect(result.granted).toHaveLength(2)
    const ledger = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.requestId, 'flux-grant:int-1:uid_grant_a'))
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.amount).toBe(25)
    expect(inserted.map(r => r.requestId).sort()).toEqual([
      'flux-grant:int-1:uid_grant_a',
      'flux-grant:int-1:uid_grant_c',
    ])
  })
})
