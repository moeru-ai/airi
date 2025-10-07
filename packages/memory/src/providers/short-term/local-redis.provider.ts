import type { RedisOptions } from 'ioredis'

import type { ShortTermMemoryOptions } from '../../types/short-term'
import type { ListClient } from './base-short-term.provider'

import Redis from 'ioredis'

import { BaseShortTermMemoryProvider } from './base-short-term.provider'

const DEFAULT_MAX_RETRY_ATTEMPTS = 5
const DEFAULT_RETRY_DELAY_MS = 200

export interface LocalRedisShortTermMemoryOptions extends ShortTermMemoryOptions {
  client?: Redis
  connection?: RedisOptions
  maxRetryAttempts?: number
  retryDelayMs?: number
}

export class LocalRedisShortTermMemoryProvider extends BaseShortTermMemoryProvider {
  private readonly redis: Redis
  private readonly maxRetryAttempts: number
  private readonly retryDelayMs: number

  constructor(options: LocalRedisShortTermMemoryOptions = {}) {
    const maxRetryAttempts = options.maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    const redisClient = options.client ?? LocalRedisShortTermMemoryProvider.createClient(options, maxRetryAttempts, retryDelayMs)

    super(redisClient as unknown as ListClient, options)
    this.redis = redisClient
    this.maxRetryAttempts = maxRetryAttempts
    this.retryDelayMs = retryDelayMs
  }

  protected async onInitialize(): Promise<void> {
    let attempt = 0

    while (attempt <= this.maxRetryAttempts) {
      try {
        if (this.redis.status === 'wait') {
          await this.redis.connect()
        }

        await this.redis.ping()
        return
      }
      catch (error) {
        attempt += 1

        if (attempt > this.maxRetryAttempts) {
          throw error
        }

        await this.delay(this.retryDelayMs * attempt)
      }
    }
  }

  private static createClient(
    options: LocalRedisShortTermMemoryOptions,
    maxRetryAttempts: number,
    retryDelayMs: number,
  ): Redis {
    const redis = new Redis({
      lazyConnect: true,
      ...(options.connection ?? {}),
      retryStrategy(times: number) {
        if (times > maxRetryAttempts) {
          return null
        }

        return Math.min(times * retryDelayMs, 1000)
      },
    })

    return redis
  }

  private async delay(durationMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, durationMs))
  }
}
