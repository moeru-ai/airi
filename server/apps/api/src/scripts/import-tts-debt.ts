import { readFile } from 'node:fs/promises'
import { argv, env } from 'node:process'

import Redis from 'ioredis'

import { array, check, minValue, nonEmpty, number, object, parse, pipe, safeInteger, string } from 'valibot'

import { createDrizzle } from '../libs/db'
import { priceSpeechUsage, speechPricingSchema } from '../services/domain/billing/billing'
import { createBillingService } from '../services/domain/billing/billing-service'

const snapshotSchema = object({
  batchId: pipe(string(), nonEmpty()),
  entries: pipe(array(object({
    userId: pipe(string(), nonEmpty()),
    units: pipe(number(), safeInteger(), minValue(0)),
    pricing: speechPricingSchema,
  })), check(entries => new Set(entries.map(entry => entry.userId)).size === entries.length, 'Snapshot contains duplicate wallets')),
})

/**
 * Imports a frozen Redis debt export after the schema migration and before new writers start.
 * Reusing the batch ID and unchanged input is idempotent. This script never deletes Redis counters.
 *
 * Call stack:
 * main
 *   -> createBillingService
 *     -> postFluxUsage
 *       -> PostgreSQL wallet lock, fee posting, and integer debit
 */
async function main() {
  const file = argv[2]
  if (!file)
    throw new Error('Pass a frozen TTS debt snapshot file')
  const snapshot = parse(snapshotSchema, JSON.parse(await readFile(file, 'utf8')))
  const entries = snapshot.entries.map(entry => ({ ...entry, costMicroFlux: priceSpeechUsage(entry.units, entry.pricing) }))
  const total = entries.reduce((sum, entry) => sum + BigInt(entry.costMicroFlux), 0n)
  console.info(JSON.stringify({ batchId: snapshot.batchId, wallets: entries.length, totalMicroFlux: total.toString(), apply: argv.includes('--apply') }))
  if (!argv.includes('--apply'))
    return
  const databaseUrl = parse(pipe(string(), nonEmpty()), env.FLUX_IMPORT_DATABASE_URL)
  const redisUrl = parse(pipe(string(), nonEmpty()), env.FLUX_IMPORT_REDIS_URL)
  const database = createDrizzle({
    DATABASE_URL: databaseUrl,
    DB_POOL_MAX: 1,
    DB_POOL_IDLE_TIMEOUT_MS: 1000,
    DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
    DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: 1000,
  })
  const redis = new Redis(redisUrl)
  const billing = createBillingService(database.db, redis)
  try {
    for (const entry of entries) {
      await billing.postFluxUsage({
        userId: entry.userId,
        source: { type: 'tts_debt_import', id: `${snapshot.batchId}:${entry.userId}` },
        amountMicroFlux: entry.costMicroFlux,
      })
    }
    console.info(JSON.stringify({ imported: entries.length }))
  }
  finally {
    redis.disconnect()
    await database.pool.end()
  }
}

await main()
