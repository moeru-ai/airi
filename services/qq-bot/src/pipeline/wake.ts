// src/pipeline/wake.ts
// ─────────────────────────────────────────────────────────────
// ② WakeStage：唤醒判定（private > @bot > reply > keyword > random）
// ─────────────────────────────────────────────────────────────

import type { WakeConfig } from '../config.js'
import type { StageResult, WakeReason } from '../types/context.js'
import type { QQMessageEvent } from '../types/event.js'
import type { ReplySegment } from '../types/message.js'
import type { BotMessageTracker } from '../utils/bot-message-tracker.js'

import { findAtTarget, hasSegmentType, removeAtSegments } from '../types/message.js'
import { PipelineStage } from './stage.js'

export class WakeStage extends PipelineStage {
  readonly name = 'WakeStage'
  private readonly regexKeywords: RegExp[]

  constructor(
    private readonly config: WakeConfig,
    private readonly botMessageTracker?: BotMessageTracker,
  ) {
    super()
    this.initLogger()
    this.regexKeywords = config.keywordMatchMode === 'regex'
      ? config.keywords.map((keyword) => {
          try {
            return new RegExp(keyword, 'i')
          }
          catch {
            this.logger.warn(`Invalid wake regex keyword skipped: ${keyword}`)
            return /^$/
          }
        })
      : []
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const botQQ = event.context.extensions._botQQ ?? ''
    const { source, text } = event

    let wakeReason: WakeReason | undefined

    if (source.type === 'private' && this.config.alwaysWakeInPrivate)
      wakeReason = 'private'

    if (!wakeReason && botQQ && findAtTarget(event.chain, botQQ)) {
      wakeReason = 'at'
      event.chain = removeAtSegments(event.chain, botQQ)
    }

    if (!wakeReason) {
      const replySegment = event.chain.find(
        (seg): seg is ReplySegment => seg.type === 'reply',
      )
      if (replySegment && this.botMessageTracker?.isBotMessage(replySegment.data.id))
        wakeReason = 'reply'
    }

    if (!wakeReason && this.matchKeyword(text))
      wakeReason = 'keyword'

    if (!wakeReason && hasSegmentType(event.chain, 'poke'))
      wakeReason = 'poke'

    if (!wakeReason && source.type === 'group' && this.config.randomWakeRate > 0) {
      if (Math.random() < this.config.randomWakeRate)
        wakeReason = 'random'
    }

    if (!wakeReason)
      return { action: 'skip' }

    event.context.isWakeUp = true
    event.context.wakeReason = wakeReason
    return { action: 'continue' }
  }

  private matchKeyword(text: string): boolean {
    if (!text || this.config.keywords.length === 0)
      return false

    const normalized = text.toLowerCase()
    switch (this.config.keywordMatchMode) {
      case 'prefix':
        return this.config.keywords.some(keyword => normalized.startsWith(keyword.toLowerCase()))
      case 'contains':
        return this.config.keywords.some(keyword => normalized.includes(keyword.toLowerCase()))
      case 'regex':
        return this.regexKeywords.some(regex => regex.test(text))
      default: {
        const _never: never = this.config.keywordMatchMode
        return _never
      }
    }
  }
}
