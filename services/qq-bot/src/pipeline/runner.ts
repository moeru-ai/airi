// src/pipeline/runner.ts
// ─────────────────────────────────────────────────────────────
// 流水线执行引擎：Filter -> PassiveRecord -> Wake -> RateLimit -> ContextInject -> Conversation -> Process -> Decorate -> Respond
// ─────────────────────────────────────────────────────────────

import type { AiriClient } from '../airi-client.js'
import type { BotConfig } from '../config.js'
import type { SemanticRetriever } from '../context/semantic-retriever.js'
import type { ConversationRepo } from '../db/conversation-repo.js'
import type { MessageHistoryRepo } from '../db/message-history-repo.js'
import type { ResponseDispatcher } from '../dispatcher/index.js'
import type { QQMessageEvent } from '../types/event.js'
import type { PipelineStage } from './stage.js'

import { ContextCompressor } from '../context/compressor.js'
import { BotMessageTracker } from '../utils/bot-message-tracker.js'
import { createLogger } from '../utils/logger.js'
import { ConversationStage } from './conversation.js'
import { DecorateStage } from './decorate.js'
import { FilterStage } from './filter.js'
import { PassiveRecordStage } from './passive-record.js'
import { ProcessStage } from './process.js'
import { RateLimitStage } from './rate-limit.js'
import { RespondStage } from './respond.js'
import { ContextInjectStage } from './session.js'
import { WakeStage } from './wake.js'

const logger = createLogger('runner')

export class PipelineRunner {
  private botQQ = ''
  private readonly stages: PipelineStage[]

  private readonly passiveRecordStage: PassiveRecordStage
  private readonly rateLimitStage: RateLimitStage
  private readonly contextInjectStage: ContextInjectStage
  private readonly conversationStage: ConversationStage
  private readonly processStage: ProcessStage

  constructor(
    config: BotConfig,
    airiClient: AiriClient,
    private readonly dispatcher: ResponseDispatcher,
    private readonly messageHistoryRepo: MessageHistoryRepo,
    conversationRepo: ConversationRepo,
    semanticRetriever?: SemanticRetriever,
    botMessageTracker?: BotMessageTracker,
  ) {
    const tracker = botMessageTracker ?? new BotMessageTracker()

    const sessionConfig = config.session ?? {
      maxHistoryPerSession: 50,
      contextWindow: 20,
      timeoutMs: 30 * 60 * 1_000,
      isolateByTopic: false,
    }
    const processConfig = config.process ?? {
      replyTimeoutMs: 60_000,
      sendMaxRetries: 3,
      commands: { prefix: '/', enabled: ['help', 'status', 'new', 'switch', 'history', 'clear'] },
    }
    const semanticRetrievalConfig = config.semanticRetrieval ?? {
      enabled: true,
      topK: 5,
    }
    const compressionConfig = config.compression ?? {
      enabled: true,
      threshold: 0.82,
      strategy: 'llm-summary' as const,
      truncateRounds: 2,
      keepRecentRounds: 4,
      maxContextWindow: 8192,
      summaryPrompt: '基于完整对话历史，生成关键要点和进展的简洁摘要。',
    }

    const compressor = compressionConfig.enabled
      ? new ContextCompressor(
          {
            threshold: compressionConfig.threshold,
            strategy: compressionConfig.strategy,
            truncateRounds: compressionConfig.truncateRounds,
            keepRecentRounds: compressionConfig.keepRecentRounds,
            summaryPrompt: compressionConfig.summaryPrompt,
          },
          airiClient,
        )
      : undefined

    this.passiveRecordStage = new PassiveRecordStage({
      maxHistoryPerSession: sessionConfig.maxHistoryPerSession,
      timeoutMs: sessionConfig.timeoutMs,
    }, messageHistoryRepo, semanticRetrievalConfig.enabled ? semanticRetriever : undefined)
    this.rateLimitStage = new RateLimitStage(config.rateLimit ?? {
      perSession: { max: 10, windowMs: 60_000 },
      perUser: { max: 10, windowMs: 60_000 },
      global: { max: 60, windowMs: 60_000 },
      cooldownMs: 3_000,
      onLimited: 'silent',
      notifyMessage: '请稍后再试~',
    })
    this.contextInjectStage = new ContextInjectStage(
      sessionConfig,
      this.passiveRecordStage,
      messageHistoryRepo,
      semanticRetrievalConfig.topK,
      semanticRetrievalConfig.enabled ? semanticRetriever : undefined,
    )
    this.conversationStage = new ConversationStage(
      conversationRepo,
      compressor,
      compressionConfig.maxContextWindow,
    )
    this.processStage = new ProcessStage(processConfig, airiClient, conversationRepo)

    this.stages = [
      new FilterStage(config.filter ?? {
        blacklistUsers: [],
        blacklistGroups: [],
        whitelistMode: false,
        whitelistGroups: [],
        whitelistUsers: [],
        ignoreSystemUsers: ['2854196310'],
        ignoreEmptyMessages: true,
      }),
      this.passiveRecordStage,
      new WakeStage(config.wake ?? {
        keywords: [],
        keywordMatchMode: 'contains',
        randomWakeRate: 0,
        alwaysWakeInPrivate: true,
      }, tracker),
      this.rateLimitStage,
      this.contextInjectStage,
      this.conversationStage,
      this.processStage,
      new DecorateStage(config.decorate ?? {
        maxMessageLength: 4500,
        splitStrategy: 'multi-message',
        autoReply: true,
        contentFilter: { enabled: false, replacements: {} },
      }),
      new RespondStage(),
    ]
  }

  setBotQQ(botQQ: string): void {
    this.botQQ = botQQ
  }

  async run(event: QQMessageEvent): Promise<void> {
    event.context.extensions._botQQ = this.botQQ

    try {
      for (const stage of this.stages) {
        try {
          const result = await stage.run(event)

          if (result.action === 'skip')
            return

          if (result.action === 'respond') {
            if (event.context.extensions.proc_clearSession)
              this.clearSession(event.source.sessionId)

            await this.dispatcher.send(event, result.payload)
            if (event.context.rateLimitPassed)
              this.rateLimitStage.startCooldown(event.source.sessionId)
            return
          }

          if (stage === this.processStage && event.context.response?.kind === 'message') {
            const assistantMessage = event.context.response.segments
              .filter(segment => segment.type === 'text')
              .map(segment => segment.data.text)
              .join('')
              .trim()

            if (assistantMessage.length > 0)
              await this.conversationStage.afterProcess(event, event.text, assistantMessage)
          }

          if (event.stopped)
            return
        }
        catch (err) {
          logger.error(`Stage failed: ${stage.name} (event=${event.id})`, err as Error)
          return
        }
      }

      if (event.context.response) {
        if (event.context.extensions.proc_clearSession)
          this.clearSession(event.source.sessionId)

        await this.dispatcher.send(event, event.context.response)
        if (event.context.rateLimitPassed)
          this.rateLimitStage.startCooldown(event.source.sessionId)
      }
      else {
        logger.debug(`No response generated for event ${event.id}`)
      }
    }
    finally {
      const release = event.context.extensions._conversationRelease as (() => void) | undefined
      event.context.extensions._conversationRelease = undefined
      release?.()
    }
  }

  clearSession(sessionId: string): void {
    this.passiveRecordStage.clearSession(sessionId)
  }

  async preheatPassiveRecords(sessionIds: string[]): Promise<void> {
    await this.passiveRecordStage.preheat(sessionIds)
  }

  async listKnownSessionIds(): Promise<string[]> {
    return await this.messageHistoryRepo.listSessionIds()
  }

  async pruneHistory(maxHistoryRows: number): Promise<number> {
    let totalChanges = 0
    const sessionIds = await this.messageHistoryRepo.listSessionIds()
    for (const sessionId of sessionIds)
      totalChanges += await this.messageHistoryRepo.prune(sessionId, maxHistoryRows)

    return totalChanges
  }

  getPassiveRecordStage(): PassiveRecordStage {
    return this.passiveRecordStage
  }
}
