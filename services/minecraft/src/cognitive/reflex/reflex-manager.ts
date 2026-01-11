import type { Logg } from '@guiiai/logg'

import type { EventBus, TracedEvent } from '../os'
import type { PerceptionSignal } from '../perception/types/signals'
import type { MineflayerWithAgents } from '../types'
import type { ReflexContextState } from './context'

import { DebugService } from '../../debug'
import { greetingBehavior } from './behaviors/greeting'
import { lookAtBehavior } from './behaviors/look-at'
import { ReflexRuntime } from './runtime'

export class ReflexManager {
  private bot: MineflayerWithAgents | null = null
  private readonly runtime: ReflexRuntime
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly deps: {
      eventBus: EventBus
      logger: Logg
    },
  ) {
    this.runtime = new ReflexRuntime({
      logger: this.deps.logger,
    })

    this.runtime.registerBehavior(greetingBehavior)
    this.runtime.registerBehavior(lookAtBehavior)
  }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot
    // Subscribe to all signals from RuleEngine
    this.unsubscribe = this.deps.eventBus.subscribe('signal:*', (event) => {
      this.onSignal(event as TracedEvent<PerceptionSignal>)
    })
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.bot = null
  }

  public getContextSnapshot(): ReflexContextState {
    return this.runtime.getContext().getSnapshot()
  }

  private onSignal(event: TracedEvent<PerceptionSignal>): void {
    const bot = this.bot
    if (!bot)
      return

    const signal = event.payload
    const now = Date.now()

    // Create log message (can be throttled later if too spammy)
    this.deps.logger.withFields({
      type: signal.type,
      description: signal.description,
    }).log('ReflexManager: signal received')

    // Update Context
    this.runtime.getContext().updateNow(now)
    this.runtime.getContext().updateAttention({
      lastSignalType: signal.type,
      lastSignalSourceId: signal.sourceId ?? null,
      lastSignalAt: now,
    })

    // If it's a chat message (simulated via signal for now, or direct?)
    // For now we rely on signal metadata or separate chat event.
    // Assuming 'signal:social:chat' or similar might exist later.
    // For greeting behavior compatibility, we might need to map specific signals to social state.

    // Trigger behavior selection
    this.runtime.tick(bot, 0)

    // Emit reflex state for observability
    DebugService.getInstance().emitReflexState({
      mode: this.runtime.getMode(),
      activeBehaviorId: this.runtime.getActiveBehaviorId(),
      context: this.runtime.getContext().getSnapshot(),
    })
  }
}
