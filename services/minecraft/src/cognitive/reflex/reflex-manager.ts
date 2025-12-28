import type { Logg } from '@guiiai/logg'

import type { EventManager } from '../perception/event-manager'
import type { BotEvent, MineflayerWithAgents, StimulusPayload } from '../types'

export class ReflexManager {
  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) {}

  public init(bot: MineflayerWithAgents): void {
    // Listen to stimuli as a "subconscious" filter
    this.deps.eventManager.on<StimulusPayload>('stimulus', (event) => {
      this.onStimulus(bot, event)
    })

    // TODO: Listen to world_update for physical reflexes (dodge, flee)
  }

  private onStimulus(bot: MineflayerWithAgents, event: BotEvent<StimulusPayload>): void {
    const { content } = event.payload
    const lowerContent = content.toLowerCase().trim()

    if (lowerContent === 'hi' || lowerContent === 'hello') {
      this.deps.logger.log('Reflex: Handling greeting')

      const reply = 'Hi there! (Reflex)'
      if (event.source.reply) {
        event.source.reply(reply)
      }
      else {
        bot.bot.chat(reply)
      }

      event.handled = true
    }
  }
}
