/**
 * 追踪 bot 发送的消息 ID，供 WakeStage 判断回复对象。
 * 使用 Set + FIFO 淘汰策略，避免无限增长。
 */
export class BotMessageTracker {
  private readonly sentIds = new Set<string>()
  private readonly maxSize: number

  constructor(maxSize = 5000) {
    this.maxSize = maxSize
  }

  track(messageId: string | number): void {
    const id = String(messageId)
    this.sentIds.add(id)
    if (this.sentIds.size > this.maxSize) {
      const first = this.sentIds.values().next().value
      if (first)
        this.sentIds.delete(first)
    }
  }

  isBotMessage(messageId: string | number): boolean {
    return this.sentIds.has(String(messageId))
  }
}
