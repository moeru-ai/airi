// src/pipeline/filter.ts
// ─────────────────────────────────────────────────────────────
// ① FilterStage：黑白名单、系统号、空消息过滤
// ─────────────────────────────────────────────────────────────

import type { FilterConfig } from '../config'
import type { StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'

import { PipelineStage } from './stage'

const DEFAULT_SYSTEM_USERS = ['2854196310']

export class FilterStage extends PipelineStage {
  readonly name = 'FilterStage'

  private readonly systemUsers: Set<string>
  private readonly blackUsers: Set<string>
  private readonly blackGroups: Set<string>
  private readonly whiteUsers: Set<string>
  private readonly whiteGroups: Set<string>

  constructor(private readonly config: FilterConfig) {
    super()
    this.initLogger()

    this.systemUsers = new Set([...DEFAULT_SYSTEM_USERS, ...config.ignoreSystemUsers])
    this.blackUsers = new Set(config.blacklistUsers)
    this.blackGroups = new Set(config.blacklistGroups)
    this.whiteUsers = new Set(config.whitelistUsers)
    this.whiteGroups = new Set(config.whitelistGroups)
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const { source, text, chain } = event

    if (this.systemUsers.has(source.userId))
      return { action: 'skip' }

    if (this.blackUsers.has(source.userId))
      return { action: 'skip' }

    if (source.groupId && this.blackGroups.has(source.groupId))
      return { action: 'skip' }

    if (this.config.whitelistMode) {
      const userAllowed = this.whiteUsers.has(source.userId)
      const groupAllowed = source.groupId ? this.whiteGroups.has(source.groupId) : false
      if (!userAllowed && !groupAllowed)
        return { action: 'skip' }
    }

    if (this.config.ignoreEmptyMessages) {
      const isEmptyText = text.trim().length === 0
      const isOnlyFace = chain.length > 0 && chain.every(seg => seg.type === 'face')
      if (isEmptyText && isOnlyFace)
        return { action: 'skip' }
    }

    return { action: 'continue' }
  }
}
