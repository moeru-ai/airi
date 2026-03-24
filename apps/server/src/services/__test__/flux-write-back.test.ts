import type { Database } from '../../libs/db'

import { and, eq, inArray, lte } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxWriteBack } from '../flux-write-back'

import * as schema from '../../schemas'
import * as logSchema from '../../schemas/llm-request-log'

describe('fluxWriteBack', () => {
  let db: Database
  let testUser: any
  let writeBack: ReturnType<typeof createFluxWriteBack>

  beforeAll(async () => {
    db = await mockDB(schema)

    const [user] = await db.insert(schema.user).values({
      id: 'user-wb-1',
      name: 'Write-back User',
      email: 'wb@example.com',
    }).returning()
    testUser = user

    await db.insert(schema.userFlux).values({
      userId: testUser.id,
      flux: 1000,
    })

    writeBack = createFluxWriteBack(db)
  })

  it('should aggregate unsettled logs and deduct from user_flux', async () => {
    await db.insert(schema.llmRequestLog).values([
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 10, settled: false },
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 200, fluxConsumed: 20, settled: false },
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 150, fluxConsumed: 30, settled: false },
    ])

    await writeBack.flush()

    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record.flux).toBe(940)

    const unsettled = await db.query.llmRequestLog.findMany({
      where: eq(schema.llmRequestLog.settled, false),
    })
    expect(unsettled).toHaveLength(0)

    // Verify audit entries were created
    const auditRecords = await db.query.fluxAuditLog.findMany({
      where: eq(schema.fluxAuditLog.userId, testUser.id),
    })
    expect(auditRecords).toHaveLength(3) // one per unsettled log
    expect(auditRecords.every((r: any) => r.type === 'consumption')).toBe(true)
  })

  it('should not re-settle already settled logs', async () => {
    await db.insert(schema.llmRequestLog).values({
      userId: testUser.id,
      model: 'gpt-4',
      status: 200,
      durationMs: 100,
      fluxConsumed: 5,
      settled: false,
    })

    await writeBack.flush()

    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record.flux).toBe(935)
  })

  it('should be a no-op when there are no unsettled logs', async () => {
    await writeBack.flush()

    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record.flux).toBe(935)
  })

  it('should aggregate across multiple users correctly', async () => {
    const [user2] = await db.insert(schema.user).values({
      id: 'user-wb-2',
      name: 'Write-back User 2',
      email: 'wb2@example.com',
    }).returning()
    await db.insert(schema.userFlux).values({ userId: user2.id, flux: 500 })

    await db.insert(schema.llmRequestLog).values([
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 15, settled: false },
      { userId: user2.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 25, settled: false },
      { userId: user2.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 35, settled: false },
    ])

    await writeBack.flush()

    const record1 = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record1.flux).toBe(920)

    const record2 = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, user2.id),
    })
    expect(record2.flux).toBe(440)
  })
})

describe('fluxWriteBack SQL verification', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  it('should generate a single CTE-based UPDATE statement (not two separate queries)', () => {
    // Reproduce the exact query from flush() to verify Drizzle generates atomic SQL
    const snapshotTime = new Date('2025-01-01T00:00:00Z')

    const claimedCte = db.$with('claimed').as(
      db
        .select({ id: logSchema.llmRequestLog.id })
        .from(logSchema.llmRequestLog)
        .where(and(
          eq(logSchema.llmRequestLog.settled, false),
          lte(logSchema.llmRequestLog.createdAt, snapshotTime),
        ))
        .for('update', { skipLocked: true }),
    )

    const query = db
      .with(claimedCte)
      .update(logSchema.llmRequestLog)
      .set({ settled: true })
      .where(inArray(logSchema.llmRequestLog.id, db.select({ id: claimedCte.id }).from(claimedCte)))
      .returning({
        userId: logSchema.llmRequestLog.userId,
        model: logSchema.llmRequestLog.model,
        fluxConsumed: logSchema.llmRequestLog.fluxConsumed,
        promptTokens: logSchema.llmRequestLog.promptTokens,
        completionTokens: logSchema.llmRequestLog.completionTokens,
        createdAt: logSchema.llmRequestLog.createdAt,
      })
      .toSQL()

    // The SQL must start with WITH (single CTE-based statement)
    expect(query.sql).toMatch(/^with\s+"claimed"/i)

    // Must contain FOR UPDATE SKIP LOCKED inside the CTE
    expect(query.sql).toMatch(/for update skip locked/i)

    // Must be an UPDATE (not a standalone SELECT followed by UPDATE)
    expect(query.sql).toMatch(/\bupdate\b.*"llm_request_log"/i)

    // Must use the CTE reference in the WHERE clause
    expect(query.sql).toMatch(/where.*"llm_request_log"\."id"\s+in\s+\(select.*"claimed"/i)

    // Must have RETURNING clause
    expect(query.sql).toMatch(/returning/i)

    // Sanity: only ONE statement (no semicolons splitting it)
    expect(query.sql.match(/;/g)).toBeNull()
  })
})

describe('fluxWriteBack concurrency', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values({
      id: 'user-conc-1',
      name: 'Concurrency User',
      email: 'conc@example.com',
    })
    await db.insert(schema.userFlux).values({
      userId: 'user-conc-1',
      flux: 10000,
    })
  })

  it('concurrent flush() calls should not double-deduct', async () => {
    // Insert 100 unsettled logs, each consuming 10 flux
    const logs = Array.from({ length: 100 }, (_, i) => ({
      userId: 'user-conc-1',
      model: `model-${i}`,
      status: 200,
      durationMs: 100,
      fluxConsumed: 10,
      settled: false,
    }))
    await db.insert(schema.llmRequestLog).values(logs)

    // Fire 5 concurrent flush() calls
    const wb1 = createFluxWriteBack(db)
    const wb2 = createFluxWriteBack(db)
    const wb3 = createFluxWriteBack(db)
    const wb4 = createFluxWriteBack(db)
    const wb5 = createFluxWriteBack(db)

    await Promise.all([
      wb1.flush(),
      wb2.flush(),
      wb3.flush(),
      wb4.flush(),
      wb5.flush(),
    ])

    // Total deduction should be exactly 100 * 10 = 1000, not more
    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, 'user-conc-1'),
    })
    expect(record.flux).toBe(9000)

    // All logs must be settled
    const unsettled = await db.query.llmRequestLog.findMany({
      where: and(
        eq(schema.llmRequestLog.userId, 'user-conc-1'),
        eq(schema.llmRequestLog.settled, false),
      ),
    })
    expect(unsettled).toHaveLength(0)

    // Exactly 100 audit entries (not 500 from double-processing)
    const audits = await db.query.fluxAuditLog.findMany({
      where: eq(schema.fluxAuditLog.userId, 'user-conc-1'),
    })
    expect(audits).toHaveLength(100)
  })

  it('interleaved inserts during flush should not be lost', async () => {
    // Reset flux
    await db.update(schema.userFlux)
      .set({ flux: 5000 })
      .where(eq(schema.userFlux.userId, 'user-conc-1'))

    // Clean up previous audit logs to simplify assertions
    await db.delete(schema.fluxAuditLog)
      .where(eq(schema.fluxAuditLog.userId, 'user-conc-1'))

    // Insert first batch
    await db.insert(schema.llmRequestLog).values(
      Array.from({ length: 10 }, (_, i) => ({
        userId: 'user-conc-1',
        model: `batch1-${i}`,
        status: 200,
        durationMs: 100,
        fluxConsumed: 20,
        settled: false,
      })),
    )

    const wb = createFluxWriteBack(db)

    // First flush settles batch 1
    await wb.flush()

    // Insert second batch AFTER first flush
    await db.insert(schema.llmRequestLog).values(
      Array.from({ length: 10 }, (_, i) => ({
        userId: 'user-conc-1',
        model: `batch2-${i}`,
        status: 200,
        durationMs: 100,
        fluxConsumed: 30,
        settled: false,
      })),
    )

    // Second flush should only settle batch 2
    await wb.flush()

    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, 'user-conc-1'),
    })
    // 5000 - (10*20) - (10*30) = 5000 - 200 - 300 = 4500
    expect(record.flux).toBe(4500)

    // Verify audit entries count: 10 from batch1 + 10 from batch2
    const audits = await db.query.fluxAuditLog.findMany({
      where: eq(schema.fluxAuditLog.userId, 'user-conc-1'),
    })
    expect(audits).toHaveLength(20)
  })
})
