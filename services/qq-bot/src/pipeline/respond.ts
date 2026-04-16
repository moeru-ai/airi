// src/pipeline/respond.ts
// ─────────────────────────────────────────────────────────────
// ⑦ RespondStage：触发 Dispatcher 发送，并回调限流冷却
// ─────────────────────────────────────────────────────────────

import type { StageResult } from '../types/context.js'
import type { QQMessageEvent } from '../types/event.js'

import { PipelineStage } from './stage.js'

export class RespondStage extends PipelineStage {
  readonly name = 'RespondStage'

  constructor() {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const payload = event.context.response
    if (!payload)
      return { action: 'skip' }

    return { action: 'respond', payload }
  }
}
