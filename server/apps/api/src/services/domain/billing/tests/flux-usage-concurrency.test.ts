import type { Database } from '../../../../libs/db'

import { env } from 'node:process'

import { sum } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { createDrizzle, migrateDatabase } from '../../../../libs/db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { fluxTransaction, fluxUsage, userFlux } from '../../../../schemas'
import { createBillingService } from '../billing-service'

const databaseUrl = env.BILLING_TEST_DATABASE_URL
let database: ReturnType<typeof createDrizzle> | undefined
let db: Database

beforeAll(async () => {
  if (!databaseUrl)
    return
  const target = new URL(databaseUrl)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/flux_usage_test')
    throw new Error('Concurrent billing tests require the dedicated local flux_usage_test database')
  database = createDrizzle({
    DATABASE_URL: databaseUrl,
    DB_POOL_MAX: 16,
    DB_POOL_IDLE_TIMEOUT_MS: 1000,
    DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
    DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: 1000,
  })
  db = database.db
  await migrateDatabase(db)
})

afterAll(async () => {
  await database?.pool.end()
})

it.skipIf(!databaseUrl)('conserves mixed fees across concurrent connections and duplicate events', async () => {
  await db.delete(fluxTransaction)
  await db.delete(fluxUsage)
  await db.delete(userFlux)
  await db.insert(userFlux).values({ userId: 'concurrent', flux: 500 })
  const redis = createTestRedis()
  const billing = createBillingService(db, redis)
  const calls: Array<() => Promise<unknown>> = []
  for (let index = 0; index < 100; index++) {
    const requestId = `event-${index}`
    const receipt = { userId: 'concurrent', source: { type: 'llm', id: requestId }, amountMicroFlux: 600_000 }
    calls.push(() => billing.postFluxUsage(receipt))
    calls.push(() => billing.postFluxUsage({ userId: 'concurrent', source: { type: 'tts', id: requestId }, amountMicroFlux: 550_000 }))
    calls.push(() => billing.postFluxUsage(receipt))
  }
  await Promise.all(calls.map(call => call()))
  const wallet = await billing.getWallet('concurrent')
  expect(wallet).toMatchObject({ flux: 385, unsettledMicroFlux: 0 })
  expect(await db.select().from(fluxUsage)).toHaveLength(200)
  const [debits] = await db.select({ total: sum(fluxTransaction.amount) }).from(fluxTransaction)
  const [fees] = await db.select({ total: sum(fluxUsage.amountMicroFlux) }).from(fluxUsage)
  expect(Number(debits.total)).toBe(115)
  expect(Number(fees.total)).toBe(115_000_000)
})
