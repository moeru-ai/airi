/**
 * Request rate limiter
 * Controls request frequency to Twitter to avoid triggering limits
 */
export class RateLimiter {
  private requestHistory: number[] = []
  private maxRequests: number
  private timeWindow: number

  /**
   * Create rate limiter
   * @param maxRequests Maximum requests within time window
   * @param timeWindow Time window size (milliseconds)
   */
  constructor(maxRequests: number = 20, timeWindow: number = 60000) {
    this.maxRequests = maxRequests
    this.timeWindow = timeWindow
  }

  /**
   * Check if request can be sent
   */
  canRequest(): boolean {
    this.cleanOldRequests()
    return this.requestHistory.length < this.maxRequests
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requestHistory.push(Date.now())
  }

  /**
   * Get wait time until next available request (milliseconds)
   * Returns 0 if request can be sent now
   */
  getWaitTime(): number {
    if (this.canRequest()) {
      return 0
    }

    const oldestRequest = this.requestHistory[0]
    return oldestRequest + this.timeWindow - Date.now()
  }

  /**
   * Clean expired request records
   */
  private cleanOldRequests(): void {
    const now = Date.now()
    const cutoff = now - this.timeWindow
    this.requestHistory = this.requestHistory.filter(time => time >= cutoff)
  }

  /**
   * Wait until request can be sent
   */
  async waitUntilReady(): Promise<void> {
    const waitTime = this.getWaitTime()
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    this.recordRequest()
  }
}
