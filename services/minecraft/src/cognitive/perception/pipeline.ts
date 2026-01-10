import type { Logg } from '@guiiai/logg'

import type { MineflayerWithAgents } from '../types'
import type { EventManager } from './event-manager'
import type { RawPerceptionEvent } from './raw-events'

import { AttentionDetector } from './attention-detector'
import { MineflayerPerceptionCollector } from './mineflayer-perception-collector'
import { RawEventBuffer } from './raw-event-buffer'

export class PerceptionPipeline {
  private readonly buffer = new RawEventBuffer()
  private readonly detector: AttentionDetector
  private collector: MineflayerPerceptionCollector | null = null
  private initialized = false

  private lastStatsAt = 0
  private collectedSinceStats = 0
  private processedSinceStats = 0

  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) {
    this.detector = new AttentionDetector({
      eventManager: this.deps.eventManager,
      logger: this.deps.logger,
    })
  }

  public init(bot: MineflayerWithAgents): void {
    this.initialized = true

    this.lastStatsAt = Date.now()
    this.collectedSinceStats = 0
    this.processedSinceStats = 0

    this.deps.logger.withFields({ maxDistance: 32 }).log('PerceptionPipeline: init')

    this.collector = new MineflayerPerceptionCollector({
      logger: this.deps.logger,
      emitRaw: (event) => {
        this.collect(event)
      },
      maxDistance: 32,
    })
    this.collector.init(bot)
  }

  public destroy(): void {
    this.deps.logger.log('PerceptionPipeline: destroy')
    this.collector?.destroy()
    this.collector = null
    this.buffer.clear()
    this.initialized = false
  }

  public collect(event: RawPerceptionEvent): void {
    if (!this.initialized)
      return
    this.buffer.push(event)
    this.collectedSinceStats++
  }

  public tick(deltaMs: number): void {
    if (!this.initialized)
      return

    const startedAt = Date.now()

    this.detector.tick(deltaMs)

    const events = this.buffer.drain()
    this.processedSinceStats += events.length
    for (const event of events) {
      try {
        this.detector.ingest(event)
      }
      catch (err) {
        this.deps.logger.withError(err as Error).error('PerceptionPipeline: detector error')
      }
    }

    const now = Date.now()
    if (now - this.lastStatsAt >= 2000) {
      this.deps.logger.withFields({
        deltaMs,
        tickCostMs: now - startedAt,
        queueDepth: this.buffer.size(),
        drained: events.length,
        collected: this.collectedSinceStats,
        processed: this.processedSinceStats,
      }).log('PerceptionPipeline: stats')

      this.lastStatsAt = now
      this.collectedSinceStats = 0
      this.processedSinceStats = 0
    }
  }
}
