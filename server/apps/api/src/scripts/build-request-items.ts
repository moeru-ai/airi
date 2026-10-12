#!/usr/bin/env node

import process from 'node:process'

import { errorMessageFrom } from '@moeru/std'
import { nonEmpty, object, optional, parse, pipe, string } from 'valibot'

import { createDrizzle } from '../libs/db'
import { createRequestLogService } from '../services/domain/request-log'

const envSchema = object({
  DATABASE_URL: pipe(string(), nonEmpty('DATABASE_URL is required')),
  // Resume from the cursor that an earlier run printed.
  AFTER_CREATED_AT: optional(string()),
  AFTER_ID: optional(string()),
})

/** One row can hold 16 MiB of content, so a page stays small. */
const pageSize = 50

/**
 * Builds `llm_request_item` rows for request log rows that were written before the item table.
 *
 * Use when:
 * - The item table is deployed and the write path is correct in production.
 *
 * The run is safe to stop and to start again. Each row replaces its own items.
 */
async function main(): Promise<void> {
  const env = parse(envSchema, process.env)
  const { db, pool } = createDrizzle({ DATABASE_URL: env.DATABASE_URL, DB_POOL_MAX: 2, DB_POOL_IDLE_TIMEOUT_MS: 30000, DB_POOL_CONNECTION_TIMEOUT_MS: 5000, DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: 10000 })
  const logs = createRequestLogService(db)
  let after = env.AFTER_CREATED_AT && env.AFTER_ID ? { createdAt: new Date(env.AFTER_CREATED_AT), id: env.AFTER_ID } : undefined
  let rows = 0
  let failed = 0
  try {
    do {
      const page = await logs.buildItems({ after, limit: pageSize })
      rows += page.rows
      failed += page.failed
      after = page.next
      if (after)
        process.stdout.write(`rows=${rows} failed=${failed} AFTER_CREATED_AT=${after.createdAt.toISOString()} AFTER_ID=${after.id}\n`)
    } while (after)
  }
  finally {
    await pool.end()
  }
  process.stdout.write(`done rows=${rows} failed=${failed}\n`)
  if (failed > 0)
    process.exitCode = 1
}

void main().catch((error: unknown) => {
  process.stderr.write(`${errorMessageFrom(error) ?? 'Unknown error'}\n`)
  process.exit(1)
})
