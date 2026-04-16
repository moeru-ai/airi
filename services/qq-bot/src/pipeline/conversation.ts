import type { ContextCompressor } from '../context/compressor'
import type { ConversationRepo } from '../db/conversation-repo'
import type { OpenAIMessage, StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'

import { KeyedMutex } from '../utils/async-mutex'
import { estimateTokens } from '../utils/token-estimator'
import { PipelineStage } from './stage'

export class ConversationStage extends PipelineStage {
  readonly name = 'ConversationStage'
  private readonly mutex = new KeyedMutex()

  constructor(
    private readonly repo: ConversationRepo,
    private readonly compressor?: ContextCompressor,
    private readonly maxContextWindow: number = 8192,
  ) {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const sessionId = event.source.sessionId

    // 获取 per-session 锁，保证同 session 的 execute→afterProcess 串行
    const release = await this.mutex.acquire(sessionId)
    event.context.extensions._conversationRelease = release

    let conversation = await this.repo.getCurrent(sessionId)
    if (!conversation)
      conversation = await this.repo.create(sessionId)

    let messages = this.parseConversationHistory(conversation.content)

    if (this.compressor) {
      const compressed = await this.compressor.compress(conversation, this.maxContextWindow)
      messages = compressed.messages

      await this.repo.update(conversation.conversationId, {
        content: JSON.stringify(messages),
        tokenUsage: compressed.tokenUsage,
      })
    }

    else {
      await this.repo.update(conversation.conversationId, {
        tokenUsage: estimateTokens(messages),
      })
    }

    event.context.conversationHistory = messages
    event.context.conversationId = conversation.conversationId

    return { action: 'continue' }
  }

  async afterProcess(event: QQMessageEvent, userMessage: string, assistantMessage: string): Promise<void> {
    const conversationId = event.context.conversationId
    if (!conversationId)
      return

    try {
      // 重新从 DB 读取最新状态，而非使用 event 上的旧快照
      const fresh = await this.repo.getById(conversationId)
      const history = fresh ? this.parseConversationHistory(fresh.content) : []

      history.push({ role: 'user', content: userMessage })
      history.push({ role: 'assistant', content: assistantMessage })

      await this.repo.update(conversationId, {
        content: JSON.stringify(history),
        tokenUsage: estimateTokens(history),
      })
    }
    finally {
      // 释放锁，允许下一个同 session 事件进入
      const release = event.context.extensions._conversationRelease as (() => void) | undefined
      release?.()
    }
  }

  private parseConversationHistory(content: string | null): OpenAIMessage[] {
    if (!content)
      return []

    try {
      const parsed = JSON.parse(content) as unknown
      if (!Array.isArray(parsed))
        return []

      return parsed.filter((item): item is OpenAIMessage => {
        if (!item || typeof item !== 'object')
          return false

        const role = (item as { role?: unknown }).role
        const messageContent = (item as { content?: unknown }).content

        return (
          (role === 'system' || role === 'user' || role === 'assistant')
          && typeof messageContent === 'string'
        )
      })
    }
    catch {
      this.logger.warn('Failed to parse conversation.content, reset to empty history')
      return []
    }
  }
}
