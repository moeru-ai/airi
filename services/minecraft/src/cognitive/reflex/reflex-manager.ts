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

  public tick(deltaMs: number): void {
    if (!this.bot)
      return

    this.runtime.tick(this.bot, deltaMs)
  }

  public getContextSnapshot(): ReflexContextState {
    return this.runtime.getContext().getSnapshot()
  }

  private onPerception(event: BotEvent<PerceptionSignal>): void {
    const bot = this.bot
    if (!bot)
      return

    const signal = event.payload
    // Only care about chat messages for now for social context
    if (signal.type !== 'chat_message')
      return

    const now = Date.now()
    const message = signal.metadata.message || signal.description

    this.runtime.getContext().updateNow(now)
    this.runtime.getContext().updateSocial({
      lastSpeaker: event.source.id,
      lastMessage: message,
      lastMessageAt: now,
    })

    const behaviorId = this.runtime.tick(bot, 0)
    if (behaviorId) {
      event.handled = true
    }
  }
}
