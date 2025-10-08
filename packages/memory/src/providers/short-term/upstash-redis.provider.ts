import type { ShortTermMemoryOptions } from '../../types/short-term'
import type { ListClient } from './base-short-term.provider'

import { env } from 'node:process'

import { Redis } from '@upstash/redis'

import { BaseShortTermMemoryProvider } from './base-short-term.provider'

export interface UpstashRedisShortTermMemoryOptions extends ShortTermMemoryOptions {
  client?: Redis
  url?: string
  token?: string
}

export class UpstashRedisShortTermMemoryProvider extends BaseShortTermMemoryProvider {
  private readonly redis: Redis

  constructor(options: UpstashRedisShortTermMemoryOptions = {}) {
    const redisClient = options.client ?? UpstashRedisShortTermMemoryProvider.createClient(options)
    super(redisClient as unknown as ListClient, options)
    this.redis = redisClient
  }

  protected async onInitialize(): Promise<void> {
    await this.redis.ping()
  }

  private static createClient(options: UpstashRedisShortTermMemoryOptions): Redis {
    const url = options.url ?? env.UPSTASH_KV_REST_API_URL ?? env.UPSTASH_KV_URL ?? env.UPSTASH_REDIS_REST_URL
    const token = options.token ?? env.UPSTASH_KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error('Upstash Redis configuration is missing. Provide url/token or set UPSTASH_KV_REST_API_URL/UPSTASH_KV_URL and UPSTASH_KV_REST_API_TOKEN.')
    }

    return new Redis({ url, token })
  }
}
