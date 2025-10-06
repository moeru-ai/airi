import type { IMemoryProvider, MemorySearchResult, Message } from '../../interfaces/memory.interface'
import type { ShortTermMemoryOptions } from '../../types/short-term'

import { DEFAULT_MEMORY_NAMESPACE, DEFAULT_SHORT_TERM_MAX_MESSAGES, DEFAULT_SHORT_TERM_TTL_SECONDS } from '../../utils/constants'
import { deserializeMessage, serializeMessage } from '../../utils/messages'

export interface ListClient {
  rpush: (key: string, ...values: string[]) => Promise<unknown>
  lrange: (key: string, start: number, stop: number) => Promise<string[]>
  ltrim: (key: string, start: number, stop: number) => Promise<unknown>
  expire: (key: string, ttlSeconds: number) => Promise<unknown>
  del: (key: string) => Promise<unknown>
}

export abstract class BaseShortTermMemoryProvider implements IMemoryProvider {
  protected readonly namespace: string
  protected readonly maxMessages: number
  protected readonly ttlSeconds: number

  protected constructor(
    protected readonly client: ListClient,
    options: ShortTermMemoryOptions = {},
  ) {
    this.namespace = options.namespace ?? DEFAULT_MEMORY_NAMESPACE
    this.maxMessages = options.maxMessages ?? DEFAULT_SHORT_TERM_MAX_MESSAGES
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_SHORT_TERM_TTL_SECONDS
  }

  async initialize(): Promise<void> {
    await this.onInitialize()
  }

  protected async onInitialize(): Promise<void> {

  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const key = this.sessionKey(sessionId)
    const payload = serializeMessage(message)

    await this.client.rpush(key, payload)
    await this.trimQueue(key)
    await this.ensureTtl(key)
  }

  async getRecentMessages(sessionId: string, limit = this.maxMessages): Promise<Message[]> {
    const key = this.sessionKey(sessionId)
    const payloads = await this.client.lrange(key, 0, -1)

    if (!payloads || payloads.length === 0) {
      return []
    }

    return payloads
      .slice(-Math.min(limit, this.maxMessages))
      .map(deserializeMessage)
  }

  async searchSimilar(_query: string, _userId: string, _limit = 10): Promise<MemorySearchResult[]> {
    return []
  }

  async saveLongTermMemory(_message: Message, _userId: string): Promise<void> {

  }

  async clearSession(sessionId: string): Promise<void> {
    const key = this.sessionKey(sessionId)
    await this.client.del(key)
  }

  protected sessionKey(sessionId: string): string {
    return `${this.namespace}:session:${sessionId}`
  }

  protected async trimQueue(key: string): Promise<void> {
    try {
      await this.client.ltrim(key, -this.maxMessages, -1)
    }
    catch {
      await this.rewriteQueueWithLimit(key)
    }
  }

  private async rewriteQueueWithLimit(key: string): Promise<void> {
    try {
      const payloads = await this.client.lrange(key, 0, -1)
      if (!payloads || payloads.length <= this.maxMessages) {
        return
      }

      const sliced = payloads.slice(-this.maxMessages)
      await this.client.del(key)
      for (const item of sliced) {
        await this.client.rpush(key, item)
      }
    }
    catch {
    }
  }

  protected async ensureTtl(key: string): Promise<void> {
    try {
      if (this.ttlSeconds > 0) {
        await this.client.expire(key, this.ttlSeconds)
      }
    }
    catch {
    }
  }
}
