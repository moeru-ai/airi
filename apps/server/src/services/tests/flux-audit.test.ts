import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxAuditService } from '../flux-audit'

import * as schema from '../../schemas'

describe('fluxAuditService', () => {
  let db: any
  let service: ReturnType<typeof createFluxAuditService>

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values({
      id: 'user-audit',
      name: 'Audit User',
      email: 'audit@example.com',
    })
    service = createFluxAuditService(db)
  })

  it('log should insert a single audit entry', async () => {
    await service.log({
      userId: 'user-audit',
      type: 'addition',
      amount: 500,
      description: 'Stripe payment',
      metadata: { stripeSessionId: 'sess_123' },
    })

    const { records } = await service.getHistory('user-audit', 10, 0)
    expect(records).toHaveLength(1)
    expect(records[0].type).toBe('addition')
    expect(records[0].amount).toBe(500)
  })

  it('logBatch should insert multiple entries', async () => {
    await service.logBatch([
      { userId: 'user-audit', type: 'consumption', amount: -10, description: 'gpt-4o' },
      { userId: 'user-audit', type: 'consumption', amount: -5, description: 'gpt-4o-mini' },
    ])

    const { records } = await service.getHistory('user-audit', 10, 0)
    expect(records).toHaveLength(3) // 1 from previous test + 2 batch
  })

  it('logBatch with empty array should be a no-op', async () => {
    await service.logBatch([])
    const { records } = await service.getHistory('user-audit', 10, 0)
    expect(records).toHaveLength(3)
  })

  it('getHistory should paginate correctly with hasMore', async () => {
    const { records, hasMore } = await service.getHistory('user-audit', 2, 0)
    expect(records).toHaveLength(2)
    expect(hasMore).toBe(true)
  })

  it('getHistory should return hasMore=false on last page', async () => {
    const { records, hasMore } = await service.getHistory('user-audit', 10, 0)
    expect(records).toHaveLength(3)
    expect(hasMore).toBe(false)
  })

  it('getHistory should respect offset', async () => {
    const { records } = await service.getHistory('user-audit', 10, 2)
    expect(records).toHaveLength(1)
  })

  it('getHistory should return records ordered by createdAt desc', async () => {
    const { records } = await service.getHistory('user-audit', 10, 0)
    for (let i = 1; i < records.length; i++) {
      expect(new Date(records[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(records[i].createdAt).getTime())
    }
  })
})
