import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxWriteBack } from '../flux-write-back'

import * as schema from '../../schemas'

describe('fluxWriteBack', () => {
  let db: any
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
