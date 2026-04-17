// src/utils/rate-limiter.ts
// ─────────────────────────────────────────────────────────────
// 功能：滑动窗口限流 + 冷却追踪，供 RateLimitStage 使用。
// ─────────────────────────────────────────────────────────────

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {
    if (max <= 0)
      throw new Error(`SlidingWindowRateLimiter max must be > 0, got ${max}`)
    if (windowMs <= 0)
      throw new Error(`SlidingWindowRateLimiter windowMs must be > 0, got ${windowMs}`)
  }

  check(key: string): boolean {
    const now = Date.now()
    const timestamps = this.windows.get(key)
    if (!timestamps)
      return true

    const cutoff = now - this.windowMs
    while (timestamps.length > 0 && timestamps[0]! <= cutoff)
      timestamps.shift()

    return timestamps.length < this.max
  }

  record(key: string): void {
    const timestamps = this.windows.get(key) ?? []
    timestamps.push(Date.now())
    this.windows.set(key, timestamps)
  }

  tryConsume(key: string): boolean {
    if (!this.check(key))
      return false
    this.record(key)
    return true
  }

  cleanup(): void {
    const cutoff = Date.now() - this.windowMs
    for (const [key, timestamps] of this.windows) {
      while (timestamps.length > 0 && timestamps[0]! <= cutoff)
        timestamps.shift()
      if (timestamps.length === 0)
        this.windows.delete(key)
    }
  }
}

export class CooldownTracker {
  private readonly cooldowns = new Map<string, number>()

  constructor(private readonly cooldownMs: number) {
    if (cooldownMs < 0)
      throw new Error(`CooldownTracker cooldownMs must be >= 0, got ${cooldownMs}`)
  }

  isOnCooldown(key: string): boolean {
    const expiresAt = this.cooldowns.get(key)
    if (expiresAt == null)
      return false
    if (Date.now() >= expiresAt) {
      this.cooldowns.delete(key)
      return false
    }
    return true
  }

  startCooldown(key: string): void {
    if (this.cooldownMs === 0)
      return
    this.cooldowns.set(key, Date.now() + this.cooldownMs)
  }
}
