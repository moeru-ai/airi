import type { RawPerceptionEvent } from './raw-events'

export class RawEventBuffer {
  private queue: RawPerceptionEvent[] = []

  public push(event: RawPerceptionEvent): void {
    this.queue.push(event)
  }

  public drain(): RawPerceptionEvent[] {
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
