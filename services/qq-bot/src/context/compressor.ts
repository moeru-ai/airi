import type { AiriClient } from '../airi-client'
import type { Conversation } from '../db/conversation-repo'
import type { OpenAIMessage } from '../types/context'

import { createLogger } from '../utils/logger'
import { normalizeContent } from '../utils/normalize-content'
import { estimateTokens } from '../utils/token-estimator'

export interface CompressorConfig {
  /** Trigger compression at threshold * maxContextWindow. */
  threshold: number
  /** Compression strategy. */
  strategy: 'truncate' | 'llm-summary'
  /** Rounds dropped for truncate strategy. */
  truncateRounds: number
  /** Keep latest N rounds for llm-summary strategy. */
  keepRecentRounds: number
  /** Prompt template used for llm-summary strategy. */
  summaryPrompt: string
}

const SUMMARY_OVERHEAD_PREFIX = '[摘要]'
const SUMMARY_TIMEOUT_MS = 20_000

export class ContextCompressor {
  private readonly logger = createLogger('context-compressor')
  private readonly pendingSummaries = new Map<string, (text: string) => void>()

  constructor(
    private readonly config: CompressorConfig,
    private readonly airiClient?: AiriClient,
  ) {
    if (config.strategy === 'llm-summary' && airiClient)
      this.registerSummaryListener()
  }

  async compress(
    conversation: Conversation,
    maxContextWindow: number,
  ): Promise<{ messages: OpenAIMessage[], tokenUsage: number }> {
    const thresholdLimit = Math.max(1, Math.floor(maxContextWindow * this.config.threshold))

    let messages = this.parseConversationContent(conversation.content)
    let tokenUsage = estimateTokens(messages)

    if (tokenUsage < thresholdLimit)
      return { messages, tokenUsage }

    if (this.config.strategy === 'truncate') {
      messages = this.truncateOldestRounds(messages, this.config.truncateRounds)
    }
    else {
      messages = await this.compressBySummary(messages, conversation.sessionId)
    }

    tokenUsage = estimateTokens(messages)

    // Defensive fallback: keep halving oldest history until under threshold.
    while (tokenUsage >= thresholdLimit && messages.length > 1) {
      const cutIndex = Math.floor(messages.length / 2)
      messages = messages.slice(cutIndex)
      tokenUsage = estimateTokens(messages)
    }

    return { messages, tokenUsage }
  }

  private parseConversationContent(content: string | null): OpenAIMessage[] {
    if (!content)
      return []

    try {
      const parsed = JSON.parse(content) as unknown
      if (!Array.isArray(parsed))
        return []

      const messages: OpenAIMessage[] = []
      for (const item of parsed) {
        if (!item || typeof item !== 'object')
          continue

        const role = (item as { role?: unknown }).role
        const messageContent = (item as { content?: unknown }).content

        if ((role === 'system' || role === 'user' || role === 'assistant') && typeof messageContent === 'string')
          messages.push({ role, content: messageContent })
      }

      return messages
    }
    catch {
      this.logger.warn('Failed to parse conversation content in compressor, using empty history')
      return []
    }
  }

  private truncateOldestRounds(messages: OpenAIMessage[], truncateRounds: number): OpenAIMessage[] {
    const dropCount = Math.max(0, truncateRounds) * 2
    if (dropCount <= 0)
      return messages

    return messages.slice(Math.min(dropCount, messages.length))
  }

  private async compressBySummary(messages: OpenAIMessage[], sessionId: string): Promise<OpenAIMessage[]> {
    const keepCount = Math.max(0, this.config.keepRecentRounds) * 2

    if (messages.length <= keepCount)
      return messages

    const splitIndex = Math.max(0, messages.length - keepCount)
    const earlier = messages.slice(0, splitIndex)
    const recent = messages.slice(splitIndex)

    const summary = await this.generateSummary(earlier, sessionId)
    if (!summary) {
      this.logger.warn('Summary generation failed, fallback to truncate strategy')
      return this.truncateOldestRounds(messages, this.config.truncateRounds)
    }

    return [
      {
        role: 'system',
        content: `${SUMMARY_OVERHEAD_PREFIX}\n${summary}`,
      },
      ...recent,
    ]
  }

  private registerSummaryListener(): void {
    this.airiClient?.onEvent('output:gen-ai:chat:message', (event: any) => {
      const summarySessionId = event.data?.['gen-ai:chat']?.input?.data?.overrides?.sessionId
      const rawContent: unknown = event.data?.message?.content

      if (!summarySessionId || !summarySessionId.startsWith('ctx-summary:'))
        return

      const resolve = this.pendingSummaries.get(summarySessionId)
      if (!resolve)
        return

      this.pendingSummaries.delete(summarySessionId)
      const content = normalizeContent(rawContent)
      resolve(content.trim())
    })
  }

  private async generateSummary(messages: OpenAIMessage[], sessionId: string): Promise<string | null> {
    if (!this.airiClient)
      return null

    const summarySessionId = `ctx-summary:${sessionId}:${Date.now()}`
    const historyText = messages
      .map(message => `${message.role}: ${message.content}`)
      .join('\n')

    const payload = {
      type: 'input:text' as const,
      data: {
        text: `${this.config.summaryPrompt}\n\n对话历史：\n${historyText}`,
        textRaw: `${this.config.summaryPrompt}\n\n对话历史：\n${historyText}`,
        overrides: {
          sessionId: summarySessionId,
          messagePrefix: '(ContextCompressor): ',
        },
      } as any,
    }

    try {
      await this.airiClient.ensureConnected({ timeout: 10_000 })
      const sent = this.airiClient.send(payload)
      if (!sent)
        return null
      return await this.waitForSummary(summarySessionId)
    }
    catch {
      return null
    }
  }

  private waitForSummary(summarySessionId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingSummaries.delete(summarySessionId)
        resolve(null)
      }, SUMMARY_TIMEOUT_MS)

      this.pendingSummaries.set(summarySessionId, (text) => {
        clearTimeout(timer)
        resolve(text.length > 0 ? text : null)
      })
    })
  }
}
