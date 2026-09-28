import process from 'node:process'

import { writeFile } from 'node:fs/promises'

import Redis from 'ioredis'
import pg from 'pg'

import { like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { integer, maxValue, minValue, number, parse, pipe } from 'valibot'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { migrateDatabase } from '../../../../libs/db'
import { userFluxMeterDebtRedisKey, userFluxRedisKey } from '../../../../utils/redis-keys'
import { createConfigKVService } from '../../../adapters/config-kv'
import { createConfigKVStore } from '../../../adapters/config-kv/store'
import { createRequestLogService } from '../../request-log'
import { createBillingService } from '../billing-service'
import { createFluxMeter } from '../flux-meter'

import * as schema from '../../../../schemas'

const requests = parse(pipe(number(), integer(), minValue(32), maxValue(10_000)), Number(process.env.BILLING_LOAD_REQUESTS ?? 256))
const concurrency = parse(pipe(number(), integer(), minValue(1), maxValue(128)), Number(process.env.BILLING_LOAD_CONCURRENCY ?? 16))
const databaseUrl = new URL(process.env.BILLING_LOAD_DATABASE_URL ?? 'postgres://billing_load:billing_load@127.0.0.1:55432/airi_billing_load_test')
const redisUrl = new URL(process.env.BILLING_LOAD_REDIS_URL ?? 'redis://127.0.0.1:56379/15')
if (process.env.BILLING_LOAD_TEST !== '1'
  || !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
  || databaseUrl.search !== ''
  || databaseUrl.hash !== ''
  || !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
  || databaseUrl.pathname !== '/airi_billing_load_test'
  || redisUrl.protocol !== 'redis:'
  || redisUrl.search !== ''
  || redisUrl.hash !== ''
  || !['127.0.0.1', 'localhost'].includes(redisUrl.hostname)
  || redisUrl.pathname !== '/15') {
  throw new Error('Billing load tests require explicit opt-in and dedicated loopback PostgreSQL/Redis databases')
}

const pool = new pg.Pool({ connectionString: databaseUrl.href, max: 20, connectionTimeoutMillis: 5000, statement_timeout: 15_000 })
let statementCount = 0
let walletLockCount = 0
const db = drizzle(pool, {
  schema,
  logger: {
    logQuery(query) {
      statementCount += 1
      if (query.includes('"user_flux"') && query.includes('for update'))
        walletLockCount += 1
    },
  },
})
const redis = new Redis(redisUrl.href, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null })
const billing = createBillingService(db, redis, createConfigKVService(createConfigKVStore(db, redis)))
const logs = createRequestLogService(db)
const speech = createFluxMeter(redis, billing, {
  name: 'billing-load-speech',
  resolveRuntime: async () => ({ unitsPerFlux: 100, debtTtlSeconds: 60 }),
})
const runId = `billing-load-${crypto.randomUUID()}`
const accounts: string[] = []
const pricing = { fluxPerUsd: 1000, multiplier: 1.5 }
const policy = { minimumBalance: 1, costPricing: { openrouter: pricing } }
const initialBalance = 1_000_000
const results: Array<{ scenario: string, requests: number, concurrency: number, elapsedMs: number, throughput: number, p95Ms: number, p99Ms: number, errors: number, maxPoolWaiters: number, statements: number, walletLocks: number }> = []
let postgresVersion = ''

function receipt(userId: string, requestId: string, costUsd: number | undefined) {
  return {
    userId,
    requestId,
    model: 'load-model',
    provider: 'openrouter',
    pricing,
    observation: { status: 200, durationMs: 0 },
    usage: { source: 'provider_reported' as const, generationId: `gen-${requestId}`, costUsd, providerUsage: { cost: costUsd, prompt_tokens: 100, completion_tokens: 50 } },
  }
}

beforeAll(async () => {
  await redis.connect()
  await migrateDatabase(db)
  const version = await pool.query<{ server_version: string }>('SHOW server_version')
  postgresVersion = version.rows[0].server_version
  console.info(JSON.stringify({ event: 'billing.load.environment', postgres: version.rows[0].server_version, node: process.version, requests, concurrency, poolMax: 20 }))
  const warmupUser = `${runId}-warmup`
  accounts.push(warmupUser)
  await db.insert(schema.userFlux).values({ userId: warmupUser, flux: initialBalance })
  for (let index = 0; index < 16; index += 1)
    await billing.settleLlmCost(receipt(warmupUser, `warmup-${index}`, 0.002))
})

afterAll(async () => {
  try {
    await writeFile('billing-load-results.json', JSON.stringify({ recordedAt: new Date().toISOString(), postgres: postgresVersion, node: process.version, requests, concurrency, poolMax: 20, results }, null, 2))
    await db.delete(schema.llmRequestAttempt).where(like(schema.llmRequestAttempt.userId, `${runId}%`))
    await db.delete(schema.llmRequestLog).where(like(schema.llmRequestLog.userId, `${runId}%`))
    await db.delete(schema.fluxTransaction).where(like(schema.fluxTransaction.userId, `${runId}%`))
    await db.delete(schema.llmRequestSettlement).where(like(schema.llmRequestSettlement.userId, `${runId}%`))
    await db.delete(schema.userFlux).where(like(schema.userFlux.userId, `${runId}%`))
    if (redis.status === 'ready' && accounts.length > 0) {
      await redis.del(...accounts.flatMap(userId => [
        userFluxRedisKey(userId),
        userFluxMeterDebtRedisKey(userId, 'billing-load-speech'),
      ]))
    }
  }
  finally {
    redis.disconnect()
    await pool.end()
  }
})

it.each(['many-users', 'hot-account', 'replay', 'concurrent-replay', 'underfunded', 'pending', 'zero', 'mixed-speech'] as const)('billing load: %s', async (scenario) => {
  const prefix = `${runId}-${scenario}`
  const users = Array.from({ length: scenario === 'many-users' ? 32 : 1 }, (_, index) => `${prefix}-${index}`)
  accounts.push(...users)
  const startingBalance = scenario === 'underfunded' ? 101 : initialBalance
  const replay = scenario === 'replay' || scenario === 'concurrent-replay'
  await db.insert(schema.userFlux).values(users.map(userId => ({ userId, flux: startingBalance })))
  const replayReceipt = receipt(users[0], `${prefix}-replay`, 0.002)
  if (replay) {
    await billing.beginLlmRequest({ ...replayReceipt, policy })
    if (scenario === 'replay')
      await billing.settleLlmCost(replayReceipt)
  }

  const durations: number[] = []
  const errors: unknown[] = []
  let nextIndex = 0
  let maxPoolWaiters = 0
  const statementsBefore = statementCount
  const walletLocksBefore = walletLockCount
  const startedAt = performance.now()
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextIndex < requests) {
      const index = nextIndex++
      const userId = users[index % users.length]
      const requestId = `${prefix}-${index}`
      const started = performance.now()
      try {
        if (replay) {
          const result = await billing.settleLlmCost(replayReceipt)
          expect(result.charged).toBe(3)
        }
        else if (scenario === 'mixed-speech' && index % 2 === 1) {
          const result = await speech.accumulate({ userId, requestId, units: 100, currentBalance: initialBalance })
          expect(result.fluxDebited).toBe(1)
        }
        else {
          const entry = { userId, requestId, model: 'load-model', status: 200, durationMs: 0, fluxConsumed: 0 }
          await logs.beginRequest(entry)
          await billing.beginLlmRequest({ ...entry, policy })
          const observer = logs.observeAttempts(userId, requestId)
          const attemptId = await observer.start({ gateway: 'openrouter.ai', credentialId: 'synthetic-key', model: 'load-model' })
          await observer.finish(attemptId, { state: 'headers_received', status: 200 })
          let costUsd: number | undefined = 0.002
          if (scenario === 'zero')
            costUsd = 0
          else if (scenario === 'pending')
            costUsd = undefined
          const result = await billing.settleLlmCost({ ...receipt(userId, requestId, costUsd), observation: { status: 200, durationMs: 0, attemptId } })
          if (scenario === 'underfunded') {
            expect(result.charged).toBeGreaterThanOrEqual(0)
            expect(result.charged).toBeLessThanOrEqual(3)
          }
          else {
            expect(result.charged).toBe(costUsd === 0.002 ? 3 : 0)
          }
          expect(result.pending).toBe(scenario === 'pending')
          await logs.logRequest({ ...entry, attemptId, fluxConsumed: result.charged })
        }
      }
      catch (error) {
        errors.push(error)
      }
      finally {
        durations.push(performance.now() - started)
        maxPoolWaiters = Math.max(maxPoolWaiters, pool.waitingCount)
      }
    }
  }))
  const elapsedMs = performance.now() - startedAt
  durations.sort((left, right) => left - right)
  const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1]
  const p99Ms = durations[Math.ceil(durations.length * 0.99) - 1]
  const throughput = requests / (elapsedMs / 1000)
  const statements = statementCount - statementsBefore
  const walletLocks = walletLockCount - walletLocksBefore
  results.push({ scenario, requests, concurrency, elapsedMs, throughput, p95Ms, p99Ms, errors: errors.length, maxPoolWaiters, statements, walletLocks })
  console.info(JSON.stringify({ event: 'billing.load.result', scenario, requests, concurrency, elapsedMs, throughput, p95Ms, p99Ms, errors: errors.length, maxPoolWaiters }))
  expect(errors).toEqual([])

  const ledger = await db.select().from(schema.fluxTransaction).where(like(schema.fluxTransaction.userId, `${prefix}%`))
  const settlements = await db.select().from(schema.llmRequestSettlement).where(like(schema.llmRequestSettlement.userId, `${prefix}%`))
  const wallets = await db.select().from(schema.userFlux).where(like(schema.userFlux.userId, `${prefix}%`))
  const totalDebited = ledger.reduce((sum, entry) => sum + entry.amount, 0)
  const speechCount = scenario === 'mixed-speech' ? Math.floor(requests / 2) : 0
  let expectedDebit = (requests - speechCount) * 3 + speechCount
  if (scenario === 'pending' || scenario === 'zero')
    expectedDebit = 0
  else if (replay)
    expectedDebit = 3
  else if (scenario === 'underfunded')
    expectedDebit = Math.min(startingBalance, requests * 3)
  expect(totalDebited).toBe(expectedDebit)
  expect(wallets.reduce((sum, wallet) => sum + wallet.flux, 0) + totalDebited).toBe(users.length * startingBalance)
  expect(wallets.every(wallet => wallet.flux >= 0)).toBe(true)
  for (const wallet of wallets) {
    const accountDebits = ledger.filter(entry => entry.userId === wallet.userId).reduce((sum, entry) => sum + entry.amount, 0)
    expect(wallet.flux + accountDebits).toBe(startingBalance)
  }
  expect(ledger.every(entry => entry.amount > 0 && entry.balanceBefore - entry.balanceAfter === entry.amount)).toBe(true)
  expect(new Set(ledger.map(entry => entry.requestId)).size).toBe(ledger.length)
  expect(settlements).toHaveLength(replay ? 1 : requests - speechCount)
  expect(settlements.every(entry => entry.billingStatus === (scenario === 'pending' ? 'pending' : 'settled'))).toBe(true)
  expect(settlements.reduce((sum, entry) => sum + (entry.chargedFlux ?? 0), 0)).toBe(expectedDebit - speechCount)
  const requestLogs = await db.select({ id: schema.llmRequestLog.id }).from(schema.llmRequestLog).where(like(schema.llmRequestLog.userId, `${prefix}%`))
  const attempts = await db.select({ id: schema.llmRequestAttempt.id }).from(schema.llmRequestAttempt).where(like(schema.llmRequestAttempt.userId, `${prefix}%`))
  expect(requestLogs).toHaveLength(replay ? 0 : requests - speechCount)
  expect(attempts).toHaveLength(replay ? 0 : requests - speechCount)
  expect(p95Ms).toBeLessThan(2000)
  expect(p99Ms).toBeLessThan(5000)
  expect(throughput).toBeGreaterThan(25)
  expect(statements).toBeLessThanOrEqual(requests * 18)
  if (scenario === 'pending') {
    expect(walletLocks).toBe(requests)
    expect(statements).toBeLessThanOrEqual(requests * 11)
  }
  if (scenario === 'replay') {
    expect(walletLocks).toBe(requests)
    expect(statements).toBeLessThanOrEqual(requests * 4)
  }
})
