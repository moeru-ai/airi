import type { Logg } from '@guiiai/logg'

import type { EventManager } from '../perception/event-manager'
import type { PerceptionSignal } from '../perception/types/signals'
import type { BotEvent, MineflayerWithAgents } from '../types'
import type { ReflexContextState } from './context'

import { greetingBehavior } from './behaviors/greeting'
import { ReflexRuntime } from './runtime'

export class ReflexManager {
  private bot: MineflayerWithAgents | null = null
  private readonly runtime: ReflexRuntime

  private readonly onPerceptionHandler = (event: BotEvent<PerceptionSignal>) => {
    this.onPerception(event)
  }

  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) {
    this.runtime = new ReflexRuntime({
      logger: this.deps.logger,
    })

    this.runtime.registerBehavior(greetingBehavior)
  }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot
    this.deps.eventManager.on<PerceptionSignal>('perception', this.onPerceptionHandler)
  }

  public destroy(): void {
    this.deps.eventManager.off<PerceptionSignal>('perception', this.onPerceptionHandler)
    this.bot = null
  }

  public getContextSnapshot(): ReflexContextState {
    return this.runtime.getContext().getSnapshot()
  }

  private onPerception(event: BotEvent<PerceptionSignal>): void {
    const bot = this.bot
    if (!bot)
      return

    const signal = event.payload
    const message = `Signal triggered: ${signal.type} - ${signal.description}`
    bot.bot.chat(message)

    const now = Date.now()
    this.runtime.getContext().updateNow(now)
    this.runtime.getContext().updateSocial({
      lastSpeaker: event.source.id,
      lastMessage: message,
      lastMessageAt: now,
    })

    const behaviorId = this.runtime.tick(bot, 0)
    if (behaviorId)
      event.handled = true
  }
}
