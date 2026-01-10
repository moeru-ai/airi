import type { Logg } from '@guiiai/logg'

import type { EventManager } from '../perception/event-manager'
import type { BotEvent, MineflayerWithAgents, StimulusPayload } from '../types'

import type { ReflexContextState } from './context'

import { greetingBehavior } from './behaviors/greeting'
import { ReflexRuntime } from './runtime'

export class ReflexManager {
  private bot: MineflayerWithAgents | null = null
  private readonly runtime: ReflexRuntime

  private readonly onStimulusHandler = (event: BotEvent<StimulusPayload>) => {
    this.onStimulus(event)
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
    this.deps.eventManager.on<StimulusPayload>('stimulus', this.onStimulusHandler)
  }

  public destroy(): void {
    this.deps.eventManager.off<StimulusPayload>('stimulus', this.onStimulusHandler)
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

  private onStimulus(event: BotEvent<StimulusPayload>): void {
    const bot = this.bot
    if (!bot)
      return

    const now = Date.now()

    this.runtime.getContext().updateNow(now)
    this.runtime.getContext().updateSocial({
      lastSpeaker: event.source.id,
      lastMessage: event.payload.content,
      lastMessageAt: now,
    })

    const behaviorId = this.runtime.tick(bot, 0)
    if (behaviorId) {
      event.handled = true
    }
  }
}
