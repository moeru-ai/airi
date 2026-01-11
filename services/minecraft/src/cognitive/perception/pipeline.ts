import type { Logg } from '@guiiai/logg'

import type { MineflayerWithAgents } from '../types'
import type { EventManager } from './event-manager'
import type { PerceptionFrame } from './frame'
import type { PerceptionSignal } from './types/signals'
import type { PerceptionStage } from './types/stage'

import { AttentionDetector } from './attention-detector'
import { createPerceptionFrameFromRawEvent } from './frame'
import { MineflayerPerceptionCollector } from './mineflayer-perception-collector'
import { RawEventBuffer } from './raw-event-buffer'

export class PerceptionPipeline {
  private readonly buffer = new RawEventBuffer()
  private readonly detector: AttentionDetector
  private collector: MineflayerPerceptionCollector | null = null
  private initialized = false

  private readonly stages: PerceptionStage[]

  private currentFrame: PerceptionFrame | null = null

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
      logger: this.deps.logger,
      onAttention: (signal) => {
        // This is only called synchronously while we're handling a specific frame.
        // Attach derived signals to that frame; router stage will emit them.
        this.currentFrame?.signals.push({
          type: 'perception_signal',
          payload: signal,
        })
      },
    })

    this.stages = [
      {
        name: 'attention',
        tick: (deltaMs) => {
          this.detector.tick(deltaMs)
        },
        handle: (frame) => {
          if (frame.kind !== 'world_raw')
            return frame

          this.currentFrame = frame
          try {
            const raw = frame.raw as any
            this.detector.ingest(raw)
          }
          finally {
            this.currentFrame = null
          }
          return frame
        },
      },
      {
        name: 'router',
        handle: (frame) => {
          if (frame.kind === 'chat_raw') {
            const raw = frame.raw as { username: string, message: string }

            // Convert chat to PerceptionSignal
            const signal: PerceptionSignal = {
              type: 'chat_message',
              description: `Chat from ${raw.username}: "${raw.message}"`,
              sourceId: raw.username,
              timestamp: Date.now(),
              confidence: 1.0,
              metadata: {
                username: raw.username,
                message: raw.message,
              },
            }

            this.deps.eventManager.emit<PerceptionSignal>({
              type: 'perception',
              payload: signal,
              source: {
                type: 'minecraft',
                id: raw.username,
              },
              timestamp: Date.now(),
            })
          }

          // Emit all perception signals centrally as BotEvents
          for (const signalWrapper of frame.signals) {
            if (signalWrapper.type !== 'perception_signal')
              continue

            const signal = signalWrapper.payload as PerceptionSignal

            this.deps.eventManager.emit<PerceptionSignal>({
              type: 'perception',
              payload: signal,
              source: { type: 'minecraft', id: 'perception' },
              timestamp: Date.now(),
            })
          }

          return frame
        },
      },
    ]
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
        this.ingest(createPerceptionFrameFromRawEvent(event))
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

  public ingest(frame: PerceptionFrame): void {
    if (!this.initialized)
      return
    this.buffer.push(frame)
    this.collectedSinceStats++
  }

  public tick(deltaMs: number): void {
    if (!this.initialized)
      return

    const startedAt = Date.now()

    for (const stage of this.stages) {
      stage.tick?.(deltaMs)
    }

    const frames = this.buffer.drain()
    this.processedSinceStats += frames.length
    for (const frame of frames) {
      let current: PerceptionFrame | null = frame
      for (const stage of this.stages) {
        if (!current)
          break
        try {
          current = stage.handle(current)
        }
        catch (err) {
          this.deps.logger.withError(err as Error).error('PerceptionPipeline: stage error')
          break
        }
      }
    }

    const now = Date.now()
    if (now - this.lastStatsAt >= 2000) {
      this.deps.logger.withFields({
        deltaMs,
        tickCostMs: now - startedAt,
        queueDepth: this.buffer.size(),
        drained: frames.length,
        collected: this.collectedSinceStats,
        processed: this.processedSinceStats,
      }).log('PerceptionPipeline: stats')

      this.lastStatsAt = now
      this.collectedSinceStats = 0
      this.processedSinceStats = 0
    }
  }
}
