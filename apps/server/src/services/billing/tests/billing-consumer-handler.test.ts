import type { Database } from '../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { createBillingConsumerHandler } from '../billing-consumer-handler'

import * as schema from '../../../schemas'

describe('billingConsumerHandler', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values({
      id: 'user-billing-handler-1',
      name: 'Billing Handler User',
      email: 'billing-handler@example.com',
    })
  })

  beforeEach(async () => {
    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-handler-1'))
  })

  it('writes debit transaction metadata so token usage can be shown in the UI', async () => {
    const handler = createBillingConsumerHandler(db)

    await handler.handleMessage({
      streamMessageId: '1-0',
      event: {
        eventId: 'evt-1',
        eventType: 'flux.debited',
        aggregateId: 'user-billing-handler-1',
        userId: 'user-billing-handler-1',
        requestId: 'req-1',
        occurredAt: '2026-03-27T00:00:00.000Z',
        schemaVersion: 1,
        payload: {
          amount: 3,
          balanceAfter: 97,
          source: 'llm.request',
          description: 'gpt-5',
          metadata: { promptTokens: 111, completionTokens: 222 },
        },
      },
    })

    const [txRecord] = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.requestId, 'req-1'))

    expect(txRecord).toMatchObject({
      userId: 'user-billing-handler-1',
      type: 'debit',
      amount: 3,
      balanceBefore: 100,
      balanceAfter: 97,
      requestId: 'req-1',
      description: 'gpt-5',
      metadata: {
        promptTokens: 111,
        completionTokens: 222,
        source: 'llm.request',
      },
    })
  })
})
