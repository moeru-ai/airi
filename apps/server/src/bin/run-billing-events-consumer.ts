import type { BillingStreamMessage } from '../services/billing-mq'

import { pid } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'

import { parseEnv } from '../libs/env'
import { createRedis } from '../libs/redis'
import { createBillingMqService } from '../services/billing-mq'
import { createBillingMqWorker } from '../services/billing-mq-worker'
import { fluxRedisKey } from '../services/flux'

function parsePositiveInteger(rawValue: string, envKey: string): number {
  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive integer`)
  }

  return parsed
}

export interface RunBillingEventsConsumerOptions {
  group: string
  loggerName: string
  handleMessage?: (message: BillingStreamMessage, redis: ReturnType<typeof createRedis>) => Promise<void>
}

export async function runBillingEventsConsumer(options: RunBillingEventsConsumerOptions): Promise<void> {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const env = parseEnv(globalThis.process.env)
  const logger = useLogger(options.loggerName).useGlobalConfig()
  const redis = createRedis(env.REDIS_URL)

  await redis.connect()

  const abortController = new AbortController()
  const consumer = env.BILLING_EVENTS_CONSUMER_NAME ?? `${options.group}-${pid}`

  const shutdown = async (signalName: string) => {
    if (abortController.signal.aborted) {
      return
    }

    logger.withFields({ signalName }).log('Stopping billing MQ consumer')
    abortController.abort()
  }

  globalThis.process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  globalThis.process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  try {
    const mq = createBillingMqService(redis, {
      stream: env.BILLING_EVENTS_STREAM,
    })

    const worker = createBillingMqWorker(mq)
    const handleMessage = options.handleMessage ?? (async (message: BillingStreamMessage) => {
      logger.withFields({
        group: options.group,
        consumer,
        eventId: message.event.eventId,
        eventType: message.event.eventType,
        aggregateId: message.event.aggregateId,
        userId: message.event.userId,
        streamMessageId: message.streamMessageId,
      }).log('Consumed billing MQ event')
    })

    await worker.run({
      group: options.group,
      consumer,
      signal: abortController.signal,
      batchSize: parsePositiveInteger(env.BILLING_EVENTS_BATCH_SIZE, 'BILLING_EVENTS_BATCH_SIZE'),
      blockMs: parsePositiveInteger(env.BILLING_EVENTS_BLOCK_MS, 'BILLING_EVENTS_BLOCK_MS'),
      minIdleTimeMs: parsePositiveInteger(env.BILLING_EVENTS_MIN_IDLE_MS, 'BILLING_EVENTS_MIN_IDLE_MS'),
      onMessage: message => handleMessage(message, redis),
    })
  }
  finally {
    await redis.quit()
  }
}

export async function handleCacheSyncMessage(
  message: BillingStreamMessage,
  redis: ReturnType<typeof createRedis>,
): Promise<void> {
  if ((message.event.eventType === 'flux.credited' || message.event.eventType === 'flux.debited')
    && message.event.payload.balanceAfter != null) {
    await redis.set(fluxRedisKey(message.event.userId), String(message.event.payload.balanceAfter))
  }
}
