import type { Logg } from '@guiiai/logg'

import type { EventBus } from '../event-bus'
import type { MineflayerWithAgents } from '../types'

import { EventRegistry } from './events'
import { allEventDefinitions } from './events/definitions'

export class PerceptionPipeline {
  private bot: MineflayerWithAgents | null = null
  private readonly eventRegistry: EventRegistry

  constructor(
    private readonly deps: {
      eventBus: EventBus
      logger: Logg
    },
  ) {
    this.eventRegistry = new EventRegistry({
      logger: this.deps.logger,
      onRawEvent: (event) => {
        const eventType = `raw:${event.modality}:${event.kind}`
        this.deps.eventBus.emit({
          payload: Object.freeze(event),
          source: { component: 'perception', id: event.source },
          type: eventType,
        })
      },
    })
    this.eventRegistry.registerAll(allEventDefinitions)
  }

  public destroy(): void {
    this.deps.logger.log('PerceptionPipeline: destroy')

    if (this.bot) {
      this.eventRegistry.detachFromBot(this.bot.bot)
    }
    this.eventRegistry.stop()
    this.bot = null
  }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot

    this.deps.logger.withFields({ maxDistance: 32 }).log('PerceptionPipeline: init')

    this.eventRegistry.attachToBot(bot.bot, 32)
  }
}
