import type { Logg } from '@guiiai/logg'

import type { EventManager } from '../perception/event-manager'
import type { BotEvent, MineflayerWithAgents, UserIntentPayload } from '../types'

export class ReflexManager {
  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) {}

  public init(bot: MineflayerWithAgents): void {
    // Listen to user intents as a "subconscious" filter
    this.deps.eventManager.on<UserIntentPayload>('user_intent', (event) => {
      this.handleUserIntent(bot, event)
    })

    // TODO: Listen to world_update for physical reflexes (dodge, flee)
  }

  private handleUserIntent(bot: MineflayerWithAgents, event: BotEvent<UserIntentPayload>): void {
    const { content } = event.payload
    const lowerContent = content.toLowerCase().trim()

    // MCP Skeleton: Simple "hi" reflex
    if (lowerContent === 'hi' || lowerContent === 'hello') {
      this.deps.logger.log('Reflex: Handling greeting')

      const reply = 'Hi there! (Reflex)'
      if (event.source.reply) {
        event.source.reply(reply)
      }
      else {
        bot.bot.chat(reply)
      }

      // Mark as handled to inhibit Conscious layer (Orchestrator)
      event.handled = true
    }
  }
}
