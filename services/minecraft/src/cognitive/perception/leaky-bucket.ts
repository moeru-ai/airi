export interface LeakyBucketConfig {
  capacity: number
  leakPerSecond: number
  trigger: number
}

export class LeakyBucket { // Shoutout to Makito for this idea
  private value = 0
  private readonly capacity: number
  private readonly leakPerMs: number
  private readonly trigger: number

  constructor(config: LeakyBucketConfig) {
    this.capacity = config.capacity
    this.leakPerMs = config.leakPerSecond / 1000
    this.trigger = config.trigger
  }

  public tick(deltaMs: number): void {
    if (deltaMs <= 0)
      return
    this.value = Math.max(0, this.value - this.leakPerMs * deltaMs)
  }

  public add(amount: number): { fired: boolean, value: number } {
    const next = Math.min(this.capacity, this.value + amount)
    const fired = this.value < this.trigger && next >= this.trigger
    this.value = next
    return { fired, value: this.value }
  }

  public getValue(): number {
    return this.value
  }
}
