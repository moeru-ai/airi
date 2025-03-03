/**
 * 请求频率限制器
 * 控制对 Twitter 的请求频率，避免触发限制
 */
export class RateLimiter {
  private requestHistory: number[] = []
  private maxRequests: number
  private timeWindow: number

  /**
   * 创建频率限制器
   * @param maxRequests 时间窗口内的最大请求数
   * @param timeWindow 时间窗口大小（毫秒）
   */
  constructor(maxRequests: number = 20, timeWindow: number = 60000) {
    this.maxRequests = maxRequests
    this.timeWindow = timeWindow
  }

  /**
   * 检查是否可以发送请求
   */
  canRequest(): boolean {
    this.cleanOldRequests()
    return this.requestHistory.length < this.maxRequests
  }

  /**
   * 记录一次请求
   */
  recordRequest(): void {
    this.requestHistory.push(Date.now())
  }

  /**
   * 获取下次可请求的等待时间（毫秒）
   * 如果当前可以请求，返回0
   */
  getWaitTime(): number {
    if (this.canRequest()) {
      return 0
    }

    const oldestRequest = this.requestHistory[0]
    return oldestRequest + this.timeWindow - Date.now()
  }

  /**
   * 清理过期的请求记录
   */
  private cleanOldRequests(): void {
    const now = Date.now()
    const cutoff = now - this.timeWindow
    this.requestHistory = this.requestHistory.filter(time => time >= cutoff)
  }

  /**
   * 等待直到可以发送请求
   */
  async waitUntilReady(): Promise<void> {
    const waitTime = this.getWaitTime()
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    this.recordRequest()
  }
}
