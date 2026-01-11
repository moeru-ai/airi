import type { Logg } from '@guiiai/logg'

import type { MineflayerWithAgents } from '../types'
import type { EventManager } from './event-manager'
import type { PerceptionFrame } from './frame'
import type { PerceptionSignal } from './types/signals'
import type { PerceptionStage } from './types/stage'

import { DebugService } from '../../debug-server'
import { SaliencyDetector } from './saliency-detector'
import { createPerceptionFrameFromRawEvent } from './frame'
import { MineflayerPerceptionCollector } from './mineflayer-perception-collector'

export class PerceptionPipeline {
  private readonly detector: SaliencyDetector
  private collector: MineflayerPerceptionCollector | null = null
  private initialized = false

  private readonly stages: PerceptionStage[]

  private currentFrame: PerceptionFrame | null = null

  private saliencyEmitTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) {
    this.detector = new SaliencyDetector({
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

    this.deps.logger.withFields({ maxDistance: 32 }).log('PerceptionPipeline: init')

    this.detector.start()

    this.saliencyEmitTimer = setInterval(() => {
      if (!this.initialized)
        return
      DebugService.getInstance().emit('saliency', this.detector.getDebugSnapshot({ maxKeys: 30 }))
    }, 100)

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

    if (this.saliencyEmitTimer) {
      clearInterval(this.saliencyEmitTimer)
      this.saliencyEmitTimer = null
    }

    this.detector.stop()
    this.initialized = false
  }

  public ingest(frame: PerceptionFrame): void {
    if (!this.initialized)
      return

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
}
