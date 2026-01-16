import type { PerceptionFrame } from './frame'

export class RawEventBuffer {
  private queue: PerceptionFrame[] = []

  public push(event: PerceptionFrame): void {
    this.queue.push(event)
  }

  public size(): number {
    return this.queue.length
  }

  public drain(): PerceptionFrame[] {
    if (this.queue.length === 0)
      return []
    const drained = this.queue
    this.queue = []
    return drained
  }

  public clear(): void {
    this.queue = []
  }
}
