import type { Logg } from '@guiiai/logg'

import type { EventBus } from '../os'
import type { MineflayerWithAgents } from '../types'
import type { PerceptionFrame } from './frame'
import type { RawPerceptionEvent } from './types/raw-events'
import type { PerceptionStage } from './types/stage'

import { DebugService } from '../../debug'
import { EventRegistry } from './events'
import { allEventDefinitions } from './events/definitions'
import { PerceptionAPI } from './perception-api'

export class PerceptionPipeline {
  private readonly perception: PerceptionAPI
  private readonly eventRegistry: EventRegistry
  private bot: MineflayerWithAgents | null = null
  private initialized = false

  private readonly stages: PerceptionStage[]

  private saliencyEmitTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly deps: {
      eventBus: EventBus
      logger: Logg
    },
  ) {
    this.perception = new PerceptionAPI({ logger: this.deps.logger })

    this.eventRegistry = new EventRegistry({
      logger: this.deps.logger,
      onSignal: (signal) => {
        this.deps.eventBus.emit({
          type: `signal:${signal.type}`,
          payload: signal,
          source: { component: 'perception', id: 'event-registry' },
        })
      },
      onRawEvent: (event) => {
        const eventType = `raw:${event.modality}:${event.kind}`
        this.deps.eventBus.emit({
          type: eventType,
          payload: Object.freeze(event),
          source: { component: 'perception', id: event.source },
        })
      },
    })
    this.eventRegistry.registerAll(allEventDefinitions)

    this.stages = [
      {
        name: 'entity_update',
        handle: (frame) => {
          if (frame.kind !== 'world_raw')
            return frame

          const raw = frame.raw as RawPerceptionEvent

          // Feed entity updates to PerceptionAPI
          if ('entityId' in raw && 'entityType' in raw) {
            const entityRaw = raw as RawPerceptionEvent & { entityId: string, entityType: string, displayName?: string, pos?: { x: number, y: number, z: number } }
            if (entityRaw.entityType === 'player') {
              this.perception.updateEntity(entityRaw.entityId, {
                id: entityRaw.entityId,
                type: 'player',
                name: entityRaw.displayName,
                position: entityRaw.pos as any,
                isSneaking: 'sneaking' in entityRaw ? (entityRaw as any).sneaking : undefined,
              })
            }
          }

          return frame
        },
      },
      {
        name: 'attention',
        handle: (frame) => {
          if (frame.kind !== 'world_raw')
            return frame

          const raw = frame.raw as RawPerceptionEvent
          // Legacy pipeline saliency disabled; EventRegistry is the source of truth.
          // Keep raw emission for now in case some other component still ingests frames.
          this.emitRawToEventBus(raw)
          return frame
        },
      },
    ]
  }

  public init(bot: MineflayerWithAgents): void {
    this.initialized = true
    this.bot = bot

    this.deps.logger.withFields({ maxDistance: 32 }).log('PerceptionPipeline: init')

    this.eventRegistry.start()
    this.eventRegistry.attachToBot(bot.bot, 32)

    this.saliencyEmitTimer = setInterval(() => {
      if (!this.initialized)
        return
      DebugService.getInstance().emit('saliency', this.eventRegistry.getDebugSnapshot())
    }, 100)
  }

  public destroy(): void {
    this.deps.logger.log('PerceptionPipeline: destroy')

    if (this.bot) {
      this.eventRegistry.detachFromBot(this.bot.bot)
    }
    this.eventRegistry.stop()
    this.bot = null

    if (this.saliencyEmitTimer) {
      clearInterval(this.saliencyEmitTimer)
      this.saliencyEmitTimer = null
    }
    this.initialized = false
  }

  /**
   * Get the PerceptionAPI for querying entity beliefs
   */
  public getPerceptionAPI(): PerceptionAPI {
    return this.perception
  }

  /**
   * Get all registered signal types from the EventRegistry
   * Used by consumers (e.g., Brain) to dynamically subscribe to signals
   */
  public getSignalTypes(): string[] {
    return this.eventRegistry.getSignalTypes()
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

  /**
   * Emit a raw perception event to the EventBus
   * This bridges the perception system to the rule engine
   */
  private emitRawToEventBus(raw: RawPerceptionEvent): void {
    const eventType = `raw:${raw.modality}:${raw.kind}`

    this.deps.eventBus.emit({
      type: eventType,
      payload: Object.freeze(raw),
      source: {
        component: 'perception',
        id: raw.source,
      },
    })
  }
}
