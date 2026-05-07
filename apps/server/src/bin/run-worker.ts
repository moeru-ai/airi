import process, { pid } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'

import { createDrizzle, migrateDatabase } from '../libs/db'
import { parseEnv } from '../libs/env'
import { initializeExternalDependency } from '../libs/external-dependency'
import { createMqWorker } from '../libs/mq'
import { createRedis } from '../libs/redis'
import { createBillingConsumerHandler } from '../services/billing/billing-consumer-handler'
import { createBillingMq } from '../services/billing/billing-events'

/**
 * Entry point for the `worker` Railway role: the singular non-API process
 * responsible for background work. Currently runs the billing-event Redis
 * Stream consumer; future async tasks (when needed) co-locate under this
 * role following CLAUDE.md "Railway role 越少越好维护".
 *
 * Pairs symmetrically with `runApiServer` — `api` fronts requests, `worker`
 * does everything else.
 */
export async function runWorker(): Promise<void> {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const env = parseEnv(process.env)
  const logger = useLogger('worker').useGlobalConfig()
  const { db, pool } = await initializeExternalDependency(
    'Database',
    logger,
    async (attempt) => {
      const connection = createDrizzle(env)

      try {
        await connection.db.execute('SELECT 1')
        logger.log(`Connected to database on attempt ${attempt}`)
        await migrateDatabase(connection.db)
        logger.log(`Applied schema on attempt ${attempt}`)
        return connection
      }
      catch (error) {
        await connection.pool.end()
        throw error
      }
    },
  )
  const redis = await initializeExternalDependency(
    'Redis',
    logger,
    async (attempt) => {
      const instance = createRedis(env.REDIS_URL)

      try {
        await instance.connect()
        logger.log(`Connected to Redis on attempt ${attempt}`)
        return instance
      }
      catch (error) {
        instance.disconnect()
        throw error
      }
    },
  )

  const abortController = new AbortController()
  const consumer = env.BILLING_EVENTS_CONSUMER_NAME ?? `worker-${pid}`

  const shutdown = (signalName: string) => {
    if (abortController.signal.aborted) {
      return
    }

    logger.withFields({ signalName }).log('Stopping worker')
    abortController.abort()
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  try {
    const mq = createBillingMq(redis, {
      stream: env.BILLING_EVENTS_STREAM,
    })

    const handler = createBillingConsumerHandler(db)
    const mqWorker = createMqWorker(mq)

    // NOTICE:
    // The Redis Stream consumer group name is intentionally kept as
    // 'billing-consumer' even though the Railway role is now `worker`.
    // Reason: Redis Streams use the consumer group name as the durable
    // identifier for "who has acked which messages". Renaming the group
    // would orphan all currently-pending entries — they'd have no acker and
    // would either redeliver to a fresh group or sit forever in the old
    // group. Group name is an internal Redis identifier; the user-facing
    // role name `worker` is what's exposed in deployment / docs / logs.
    // Source: https://redis.io/docs/latest/develop/data-types/streams/#consumer-groups
    await mqWorker.run({
      group: 'billing-consumer',
      consumer,
      signal: abortController.signal,
      batchSize: env.BILLING_EVENTS_BATCH_SIZE,
      blockMs: env.BILLING_EVENTS_BLOCK_MS,
      minIdleTimeMs: env.BILLING_EVENTS_MIN_IDLE_MS,
      onMessage: message => handler.handleMessage(message),
    })
  }
  finally {
    await redis.quit()
    await pool.end()
  }
}
