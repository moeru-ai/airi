import type { Database } from '../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { createFluxGrantBatchService, resolveEmails } from '../flux-grant-batch-service'

import * as schema from '../../../schemas'

describe('resolveEmails', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)

    // Three users: one normal, one with deleted user_flux, one we never insert
    // user_flux for at all (so it shows up as "user exists, no flux row" → still
    // pending since user.id matches; default flux init happens at credit time).
    await db.insert(schema.user).values([
      { id: 'uid_normal', name: 'Normal', email: 'Normal@Example.com' },
      { id: 'uid_deleted', name: 'Deleted', email: 'deleted@example.com' },
      { id: 'uid_no_flux', name: 'NoFlux', email: 'noflux@example.com' },
    ])

    await db.insert(schema.userFlux).values([
      { userId: 'uid_normal', flux: 100 },
      { userId: 'uid_deleted', flux: 0, deletedAt: new Date() },
    ])
  })

  beforeEach(async () => {
    // No state to reset between tests — resolveEmails is read-only.
  })

  it('matches users case-insensitively against the user table', async () => {
    const { resolved, summary } = await resolveEmails(db, ['NORMAL@example.com'], 200, 50)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      inputEmail: 'NORMAL@example.com',
      userId: 'uid_normal',
      status: 'pending',
      errorReason: null,
    })
    expect(summary.willGrant).toBe(1)
    expect(summary.totalFluxToIssue).toBe(200)
  })

  it('marks unknown emails as not_found', async () => {
    const { resolved, summary } = await resolveEmails(db, ['ghost@example.com'], 200, 50)
    expect(resolved[0]).toMatchObject({
      inputEmail: 'ghost@example.com',
      userId: null,
      status: 'skipped',
      errorReason: 'not_found',
    })
    expect(summary.willGrant).toBe(0)
    expect(summary.willSkip.notFound).toBe(1)
  })

  it('marks soft-deleted users as user_deleted (userId still attached for audit)', async () => {
    const { resolved, summary } = await resolveEmails(db, ['deleted@example.com'], 200, 50)
    expect(resolved[0]).toMatchObject({
      inputEmail: 'deleted@example.com',
      userId: 'uid_deleted',
      status: 'skipped',
      errorReason: 'user_deleted',
    })
    expect(summary.willSkip.userDeleted).toBe(1)
  })

  it('keeps the first occurrence and tags subsequent duplicates', async () => {
    const { resolved, summary } = await resolveEmails(
      db,
      ['normal@example.com', 'NORMAL@EXAMPLE.COM', 'normal@example.com'],
      200,
      50,
    )
    expect(resolved).toHaveLength(3)
    expect(resolved[0].errorReason).toBeNull()
    expect(resolved[0].status).toBe('pending')
    expect(resolved[1].errorReason).toBe('duplicate_in_input')
    expect(resolved[2].errorReason).toBe('duplicate_in_input')
    expect(summary.willGrant).toBe(1)
    expect(summary.willSkip.duplicateInInput).toBe(2)
  })

  it('caps preview samples at 5 entries per category', async () => {
    const ghosts = Array.from({ length: 12 }, (_, i) => `ghost${i}@example.com`)
    const { summary } = await resolveEmails(db, ghosts, 200, 50)
    expect(summary.samples.notFound).toHaveLength(5)
    expect(summary.willSkip.notFound).toBe(12)
  })

  it('estimatedDurationSec rounds up based on throttle', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `ghost${i + 100}@example.com`)
    // 10 unknown emails → 0 willGrant → 0s estimate
    const { summary: zero } = await resolveEmails(db, ten, 200, 50)
    expect(zero.estimatedDurationSec).toBe(0)

    // 1 grantable + throttle 50 → ceil(1/50) = 1s
    const { summary: one } = await resolveEmails(db, ['normal@example.com'], 200, 50)
    expect(one.estimatedDurationSec).toBe(1)
  })
})

describe('createFluxGrantBatchService.create', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values([
      { id: 'uid_grant_a', name: 'A', email: 'a@example.com' },
      { id: 'uid_grant_b', name: 'B', email: 'b@example.com' },
    ])
    await db.insert(schema.userFlux).values([
      { userId: 'uid_grant_a', flux: 0 },
      { userId: 'uid_grant_b', flux: 0 },
    ])
  })

  beforeEach(async () => {
    await db.delete(schema.fluxGrantBatchRecipient)
    await db.delete(schema.fluxGrantBatch)
  })

  it('persists batch + per-email recipient rows with resolution status', async () => {
    const service = createFluxGrantBatchService(db)
    const { batch, summary } = await service.create({
      name: 'Test Promo',
      amount: 200,
      emails: ['a@example.com', 'unknown@example.com'],
      createdByUserId: 'uid_admin',
      throttlePerSec: 50,
    })

    expect(batch.status).toBe('created')
    expect(batch.createdByUserId).toBe('uid_admin')
    expect(summary.willGrant).toBe(1)
    expect(summary.willSkip.notFound).toBe(1)

    const recipients = await db.select().from(schema.fluxGrantBatchRecipient).where(
      eq(schema.fluxGrantBatchRecipient.batchId, batch.id),
    )
    expect(recipients).toHaveLength(2)

    const aRecipient = recipients.find(r => r.inputEmail === 'a@example.com')!
    expect(aRecipient.status).toBe('pending')
    expect(aRecipient.userId).toBe('uid_grant_a')

    const unknownRecipient = recipients.find(r => r.inputEmail === 'unknown@example.com')!
    expect(unknownRecipient.status).toBe('skipped')
    expect(unknownRecipient.errorReason).toBe('not_found')
    expect(unknownRecipient.userId).toBeNull()
  })

  it('returns a stable preview summary on dry-run without persisting anything', async () => {
    const service = createFluxGrantBatchService(db)
    const before = await db.select().from(schema.fluxGrantBatch)
    const summary = await service.preview({
      name: 'Preview Test',
      amount: 50,
      emails: ['a@example.com', 'b@example.com', 'unknown@example.com'],
      throttlePerSec: 50,
    })
    expect(summary.willGrant).toBe(2)
    expect(summary.willSkip.notFound).toBe(1)
    expect(summary.totalFluxToIssue).toBe(100)
    const after = await db.select().from(schema.fluxGrantBatch)
    expect(after).toHaveLength(before.length)
  })
})

describe('createFluxGrantBatchService.retryFailed', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  beforeEach(async () => {
    await db.delete(schema.fluxGrantBatchRecipient)
    await db.delete(schema.fluxGrantBatch)
  })

  it('moves failed recipients back to pending and reopens completed batches', async () => {
    const service = createFluxGrantBatchService(db)

    const [batch] = await db.insert(schema.fluxGrantBatch).values({
      name: 'Retry Test',
      type: 'promo',
      amount: 100,
      status: 'completed',
      createdByUserId: 'uid_admin',
      completedAt: new Date(),
    }).returning()

    await db.insert(schema.fluxGrantBatchRecipient).values([
      {
        batchId: batch!.id,
        inputEmail: 'failed1@example.com',
        userId: 'uid_failed1',
        status: 'failed',
        attemptCount: 3,
        errorReason: 'DB timeout',
        lastAttemptedAt: new Date(),
      },
      {
        batchId: batch!.id,
        inputEmail: 'granted@example.com',
        userId: 'uid_granted',
        status: 'granted',
        attemptCount: 1,
      },
    ])

    const result = await service.retryFailed(batch!.id)
    expect(result.retriedCount).toBe(1)

    const [reopened] = await db.select().from(schema.fluxGrantBatch).where(eq(schema.fluxGrantBatch.id, batch!.id))
    expect(reopened?.status).toBe('running')
    expect(reopened?.completedAt).toBeNull()

    const recipients = await db.select().from(schema.fluxGrantBatchRecipient).where(
      eq(schema.fluxGrantBatchRecipient.batchId, batch!.id),
    )
    const failedRecipient = recipients.find(r => r.inputEmail === 'failed1@example.com')!
    expect(failedRecipient.status).toBe('pending')
    expect(failedRecipient.attemptCount).toBe(0)
    expect(failedRecipient.errorReason).toBeNull()
    expect(failedRecipient.lastAttemptedAt).toBeNull()
  })

  it('is a no-op when no failed recipients exist (idempotent)', async () => {
    const service = createFluxGrantBatchService(db)
    const [batch] = await db.insert(schema.fluxGrantBatch).values({
      name: 'Idempotent Retry',
      type: 'promo',
      amount: 100,
      status: 'completed',
      createdByUserId: 'uid_admin',
    }).returning()

    const result = await service.retryFailed(batch!.id)
    expect(result.retriedCount).toBe(0)

    const [unchanged] = await db.select().from(schema.fluxGrantBatch).where(eq(schema.fluxGrantBatch.id, batch!.id))
    expect(unchanged?.status).toBe('completed')
  })
})
