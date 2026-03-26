import { pid } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'

import { createDrizzle, migrateDatabase } from '../libs/db'
import { parseEnv } from '../libs/env'
import { createRedis } from '../libs/redis'
import { createBillingMqService } from '../services/billing-mq'
import { createOutboxDispatcher } from '../services/outbox-dispatcher'
import { createOutboxService } from '../services/outbox-service'

function parsePositiveInteger(rawValue: string, envKey: string): number {
  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive integer`)
  }

  return parsed
}

export async function runOutboxDispatcher(): Promise<void> {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const env = parseEnv(globalThis.process.env)
  const logger = useLogger('outbox-dispatcher').useGlobalConfig()
  const { db, pool } = createDrizzle(env.DATABASE_URL)
  const redis = createRedis(env.REDIS_URL)

  await db.execute('SELECT 1')
  await migrateDatabase(db)
  await redis.connect()

  const abortController = new AbortController()
  const claimedBy = env.OUTBOX_DISPATCHER_NAME ?? `outbox-dispatcher-${pid}`

  const shutdown = (signalName: string) => {
    if (abortController.signal.aborted) {
      return
    }

    logger.withFields({ signalName }).log('Stopping outbox dispatcher')
    abortController.abort()
  }

  globalThis.process.once('SIGINT', () => shutdown('SIGINT'))
  globalThis.process.once('SIGTERM', () => shutdown('SIGTERM'))

  try {
    const outboxService = createOutboxService(db)
    const billingMqService = createBillingMqService(redis, {
      stream: env.BILLING_EVENTS_STREAM,
    })
    const dispatcher = createOutboxDispatcher(outboxService, billingMqService)

    await dispatcher.run({
      claimedBy,
      signal: abortController.signal,
      batchSize: parsePositiveInteger(env.OUTBOX_DISPATCHER_BATCH_SIZE, 'OUTBOX_DISPATCHER_BATCH_SIZE'),
      claimTtlMs: parsePositiveInteger(env.OUTBOX_DISPATCHER_CLAIM_TTL_MS, 'OUTBOX_DISPATCHER_CLAIM_TTL_MS'),
      pollIntervalMs: parsePositiveInteger(env.OUTBOX_DISPATCHER_POLL_MS, 'OUTBOX_DISPATCHER_POLL_MS'),
    })
  }
  finally {
    await redis.quit()
    await pool.end()
  }
}
