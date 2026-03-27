import process, { pid } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'

import { createDrizzle, migrateDatabase } from '../libs/db'
import { parseEnv } from '../libs/env'
import { initializeExternalDependency } from '../libs/external-dependency'
import { createRedis } from '../libs/redis'
import { createBillingConsumerHandler } from '../services/billing/billing-consumer-handler'
import { createBillingMqService } from '../services/billing/billing-mq'
import { createBillingMqWorker } from '../services/billing/billing-mq-worker'

function parsePositiveInteger(rawValue: string, envKey: string): number {
  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive integer`)
  }

  return parsed
}

export async function runBillingConsumer(): Promise<void> {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const env = parseEnv(process.env)
  const logger = useLogger('billing-consumer').useGlobalConfig()
  const { db, pool } = await initializeExternalDependency(
    'Database',
    logger,
    async (attempt) => {
      const connection = createDrizzle(env.DATABASE_URL)

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
  const consumer = env.BILLING_EVENTS_CONSUMER_NAME ?? `billing-consumer-${pid}`

  const shutdown = (signalName: string) => {
    if (abortController.signal.aborted) {
      return
    }

    logger.withFields({ signalName }).log('Stopping billing consumer')
    abortController.abort()
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  try {
    const mq = createBillingMqService(redis, {
      stream: env.BILLING_EVENTS_STREAM,
    })

    const handler = createBillingConsumerHandler(db)
    const worker = createBillingMqWorker(mq)

    await worker.run({
      group: 'billing-consumer',
      consumer,
      signal: abortController.signal,
      batchSize: parsePositiveInteger(env.BILLING_EVENTS_BATCH_SIZE, 'BILLING_EVENTS_BATCH_SIZE'),
      blockMs: parsePositiveInteger(env.BILLING_EVENTS_BLOCK_MS, 'BILLING_EVENTS_BLOCK_MS'),
      minIdleTimeMs: parsePositiveInteger(env.BILLING_EVENTS_MIN_IDLE_MS, 'BILLING_EVENTS_MIN_IDLE_MS'),
      onMessage: message => handler.handleMessage(message),
    })
  }
  finally {
    await redis.quit()
    await pool.end()
  }
}
