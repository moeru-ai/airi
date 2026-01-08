import type { Logg } from '@guiiai/logg'

import type { MineflayerWithAgents } from '../types'
import type { EventManager } from './event-manager'
import type { RawPerceptionEvent } from './raw-events'

import { AttentionDetector } from './attention-detector'
import { RawEventBuffer } from './raw-event-buffer'

export class PerceptionPipeline {
  private readonly buffer = new RawEventBuffer()
  private readonly detector: AttentionDetector
  private initialized = false

  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) {
    this.detector = new AttentionDetector({ eventManager: this.deps.eventManager })
  }

  public init(_bot: MineflayerWithAgents): void {
    this.initialized = true
  }

  public destroy(): void {
    this.buffer.clear()
    this.initialized = false
  }

  public collect(event: RawPerceptionEvent): void {
    if (!this.initialized)
      return
    this.buffer.push(event)
  }

  public tick(deltaMs: number): void {
    if (!this.initialized)
      return

    this.detector.tick(deltaMs)

    const events = this.buffer.drain()
    for (const event of events) {
      try {
        this.detector.ingest(event)
      }
      catch (err) {
        this.deps.logger.withError(err as Error).error('PerceptionPipeline: detector error')
      }
    }
  }
}
