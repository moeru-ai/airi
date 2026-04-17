// src/pipeline/rate-limit.ts
// ─────────────────────────────────────────────────────────────
// ③ RateLimitStage：会话/用户/全局滑动窗口 + 冷却控制
// ─────────────────────────────────────────────────────────────

import type { RateLimitConfig } from '../config.js'
import type { StageResult } from '../types/context.js'
import type { QQMessageEvent } from '../types/event.js'

import { createTextResponse } from '../types/response.js'
import { CooldownTracker, SlidingWindowRateLimiter } from '../utils/rate-limiter.js'
import { PipelineStage } from './stage.js'

export class RateLimitStage extends PipelineStage {
  readonly name = 'RateLimitStage'

  private readonly perSessionLimiter: SlidingWindowRateLimiter
  private readonly perUserLimiter: SlidingWindowRateLimiter
  private readonly globalLimiter: SlidingWindowRateLimiter
  private readonly cooldownTracker: CooldownTracker
  private cleanupTimer?: ReturnType<typeof setInterval>

  constructor(private readonly config: RateLimitConfig) {
    super()
    this.initLogger()

    this.perSessionLimiter = new SlidingWindowRateLimiter(config.perSession.max, config.perSession.windowMs)
    this.perUserLimiter = new SlidingWindowRateLimiter(config.perUser.max, config.perUser.windowMs)
    this.globalLimiter = new SlidingWindowRateLimiter(config.global.max, config.global.windowMs)
    this.cooldownTracker = new CooldownTracker(config.cooldownMs)

    this.cleanupTimer = setInterval(() => {
      this.perSessionLimiter.cleanup()
      this.perUserLimiter.cleanup()
      this.globalLimiter.cleanup()
    }, 5 * 60 * 1000)

    this.cleanupTimer.unref()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const sessionKey = event.source.sessionId
    const userKey = event.source.userId
    const globalKey = 'global'

    if (this.cooldownTracker.isOnCooldown(sessionKey))
      return this.onLimited(event, 'cooldown')

    if (!this.perSessionLimiter.check(sessionKey))
      return this.onLimited(event, 'perSession')

    if (!this.perUserLimiter.check(userKey))
      return this.onLimited(event, 'perUser')

    if (!this.globalLimiter.check(globalKey))
      return this.onLimited(event, 'global')

    this.perSessionLimiter.record(sessionKey)
    this.perUserLimiter.record(userKey)
    this.globalLimiter.record(globalKey)

    event.context.rateLimitPassed = true
    return { action: 'continue' }
  }

  startCooldown(sessionKey: string): void {
    this.cooldownTracker.startCooldown(sessionKey)
  }

  dispose(): void {
    if (this.cleanupTimer)
      clearInterval(this.cleanupTimer)
  }

  private onLimited(event: QQMessageEvent, dimension: string): StageResult {
    this.logger.debug(`Rate limited by ${dimension} for event ${event.id}`)
    if (this.config.onLimited === 'notify' && this.config.notifyMessage) {
      return {
        action: 'respond',
        payload: createTextResponse(this.config.notifyMessage, event.id),
      }
    }
    return { action: 'skip' }
  }
}
