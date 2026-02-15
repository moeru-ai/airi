import type { Logg } from '@guiiai/logg'

import type { EventBus } from '../os'
import type { MineflayerWithAgents } from '../types'

import { EventRegistry } from './events'
import { allEventDefinitions } from './events/definitions'
import { PerceptionAPI } from './perception-api'

export class PerceptionPipeline {
  private readonly perception: PerceptionAPI
  private readonly eventRegistry: EventRegistry
  private bot: MineflayerWithAgents | null = null

  constructor(
    private readonly deps: {
      eventBus: EventBus
      logger: Logg
    },
  ) {
    this.perception = new PerceptionAPI({ logger: this.deps.logger })

    this.eventRegistry = new EventRegistry({
      logger: this.deps.logger,
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
  }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot

    this.deps.logger.withFields({ maxDistance: 32 }).log('PerceptionPipeline: init')

    this.eventRegistry.attachToBot(bot.bot, 32)
  }

  public destroy(): void {
    this.deps.logger.log('PerceptionPipeline: destroy')

    if (this.bot) {
      this.eventRegistry.detachFromBot(this.bot.bot)
    }
    this.eventRegistry.stop()
    this.bot = null
  }

  /**
   * Get the PerceptionAPI for querying entity beliefs
   */
  public getPerceptionAPI(): PerceptionAPI {
    return this.perception
  }
}
