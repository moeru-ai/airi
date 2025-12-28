import type { Logg } from '@guiiai/logg'
import type { Neuri, NeuriContext } from 'neuri'

import type { EventManager } from './event-manager'
import type { BotEvent, MineflayerWithAgents, UserIntentPayload } from './types'

import { withRetry } from '@moeru/std'
import { system, user } from 'neuri/openai'

import { handleLLMCompletion } from './completion'
import { generateStatusPrompt } from './prompt'

export class Orchestrator {
  private isProcessing = false

  constructor(
    private readonly deps: {
      eventManager: EventManager
      neuri: Neuri
      logger: Logg
    },
  ) {}

  public init(bot: MineflayerWithAgents): void {
    this.deps.eventManager.on<UserIntentPayload>('user_intent', async (event) => {
      await this.handleUserIntent(bot, event)
    })
  }

  private async handleUserIntent(bot: MineflayerWithAgents, event: BotEvent<UserIntentPayload>): Promise<void> {
    const { payload, source } = event
    const { content, metadata } = payload
    const username = metadata?.displayName || source.id

    // Layered Architecture: Check for inhibition from Reflex layer
    if (event.handled) {
      this.deps.logger.log('Orchestrator: Intent already handled by Reflex layer, inhibiting Conscious processing')
      return
    }

    if (this.isProcessing) {
      this.deps.logger.warn('Still processing previous intent, skipping or queuing (TBD)')
      // For now, let's just abort or we could queue. Implementation plan said we'd decide.
      // Let's implement a simple queue or at least a lock.
      return
    }

    this.isProcessing = true
    this.deps.logger.withFields({ username, content }).log('Orchestrator: Handling user intent')

    try {
      // 1. Update memory
      bot.memory.chatHistory.push(user(`${username}: ${content}`))

      // 2. Planning
      const plan = await bot.planning.createPlan(content)
      this.deps.logger.withFields({ plan }).log('Orchestrator: Plan created')

      // 3. Execution
      await bot.planning.executePlan(plan)
      this.deps.logger.log('Orchestrator: Plan executed successfully')

      // 4. Response Generation
      const statusPrompt = await generateStatusPrompt(bot)
      const response = await this.deps.neuri.handleStateless(
        [...bot.memory.chatHistory, system(statusPrompt)],
        async (c: NeuriContext) => {
          this.deps.logger.log('Orchestrator: thinking...')
          return withRetry<NeuriContext, string>(
            ctx => handleLLMCompletion(ctx, bot, this.deps.logger),
            {
              retry: 3,
              retryDelay: 1000,
            },
          )(c)
        },
      )

      // 5. Reply
      if (response) {
        this.deps.logger.withFields({ response }).log('Orchestrator: Responded')
        if (source.reply) {
          source.reply(response)
        }
        else {
          bot.bot.chat(response)
        }
      }
    }
    catch (error) {
      this.deps.logger.withError(error).warn('Orchestrator: Failed to process intent')
      const errorMessage = `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
      if (source.reply) {
        source.reply(errorMessage)
      }
      else {
        bot.bot.chat(errorMessage)
      }
    }
    finally {
      this.isProcessing = false
    }
  }
}
