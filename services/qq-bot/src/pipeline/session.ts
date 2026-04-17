// src/pipeline/session.ts
// ─────────────────────────────────────────────────────────────
// ⑤ ContextInjectStage：注入会话历史上下文
// ─────────────────────────────────────────────────────────────

import type { SessionConfig } from '../config.js'
import type { SemanticRetriever } from '../context/semantic-retriever.js'
import type { MessageHistoryRepo } from '../db/message-history-repo.js'
import type { StageResult } from '../types/context.js'
import type { QQMessageEvent } from '../types/event.js'
import type { PassiveRecordStage } from './passive-record.js'

import { PipelineStage } from './stage.js'

export class ContextInjectStage extends PipelineStage {
  readonly name = 'ContextInjectStage'

  constructor(
    private readonly config: SessionConfig,
    private readonly passiveRecord: PassiveRecordStage,
    private readonly messageHistoryRepo: MessageHistoryRepo,
    private readonly semanticTopK: number,
    private readonly semanticRetriever?: SemanticRetriever,
  ) {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    // 将被动记录阶段缓存的结构化历史注入上下文，供 ProcessStage 序列化后喂给 LLM。
    event.context.sessionHistory = this.passiveRecord.getRecent(
      event.source.sessionId,
      this.config.contextWindow,
    )

    if (this.semanticRetriever && event.context.isWakeUp) {
      const dbRecent = await this.messageHistoryRepo.getRecent(
        event.source.sessionId,
        this.config.contextWindow,
      )

      const relevant = await this.semanticRetriever.findRelevant(
        event.source.sessionId,
        event.text,
        this.semanticTopK,
        dbRecent.map(row => row.id),
      )

      event.context.semanticHistory = relevant
    }

    return { action: 'continue' }
  }

  clearSession(sessionId: string): void {
    this.passiveRecord.clearSession(sessionId)
  }
}
