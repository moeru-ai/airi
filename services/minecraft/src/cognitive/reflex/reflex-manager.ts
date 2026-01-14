import type { Logg } from '@guiiai/logg'

import type { TaskExecutor } from '../action/task-executor'
import type { EventBus, TracedEvent } from '../os'
import type { PerceptionAPI } from '../perception/perception-api'
import type { PerceptionSignal } from '../perception/types/signals'
import type { MineflayerWithAgents } from '../types'
import type { ReflexContextState } from './context'

import { DebugService } from '../../debug'
import { greetingBehavior } from './behaviors/greeting'
import { lookAtBehavior } from './behaviors/look-at'
import { teabagBehavior } from './behaviors/teabag'
import { ReflexRuntime } from './runtime'

export class ReflexManager {
  private bot: MineflayerWithAgents | null = null
  private readonly runtime: ReflexRuntime
  private unsubscribe: (() => void) | null = null
  private unsubscribeTaskExecutor: (() => void) | null = null
  private inFlightActionsCount = 0

  constructor(
    private readonly deps: {
      eventBus: EventBus
      perception: PerceptionAPI
      taskExecutor: TaskExecutor
      logger: Logg
    },
  ) {
    this.runtime = new ReflexRuntime({
      logger: this.deps.logger,
    })

    this.runtime.registerBehavior(greetingBehavior)
    this.runtime.registerBehavior(lookAtBehavior)
    this.runtime.registerBehavior(teabagBehavior)
  }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot
    // Subscribe to all signals from RuleEngine
    this.unsubscribe = this.deps.eventBus.subscribe('signal:*', (event) => {
      this.onSignal(event as TracedEvent<PerceptionSignal>)
    })

    const onStarted = () => {
      if (this.inFlightActionsCount === 0)
        this.runtime.setMode('work')
      this.inFlightActionsCount++
    }

    const onEnded = () => {
      this.inFlightActionsCount = Math.max(0, this.inFlightActionsCount - 1)
      if (this.inFlightActionsCount === 0)
        this.runtime.setMode('idle')
    }

    this.deps.taskExecutor.on('action:started', onStarted)
    this.deps.taskExecutor.on('action:completed', onEnded)
    this.deps.taskExecutor.on('action:failed', onEnded)

    this.unsubscribeTaskExecutor = () => {
      // Node's EventEmitter supports off() but we keep a fallback for compatibility.
      ; (this.deps.taskExecutor as any).off?.('action:started', onStarted)
      ; (this.deps.taskExecutor as any).off?.('action:completed', onEnded)
      ; (this.deps.taskExecutor as any).off?.('action:failed', onEnded)
      ; (this.deps.taskExecutor as any).removeListener?.('action:started', onStarted)
      ; (this.deps.taskExecutor as any).removeListener?.('action:completed', onEnded)
      ; (this.deps.taskExecutor as any).removeListener?.('action:failed', onEnded)
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    if (this.unsubscribeTaskExecutor) {
      this.unsubscribeTaskExecutor()
      this.unsubscribeTaskExecutor = null
    }
    this.inFlightActionsCount = 0
    this.bot = null
  }

  public getContextSnapshot(): ReflexContextState {
    return this.runtime.getContext().getSnapshot()
  }

  public getMode(): ReturnType<ReflexRuntime['getMode']> {
    return this.runtime.getMode()
  }

  public updateEnvironment(patch: Partial<ReflexContextState['environment']>): void {
    this.runtime.getContext().updateEnvironment(patch)
  }

  private onSignal(event: TracedEvent<PerceptionSignal>): void {
    const bot = this.bot
    if (!bot)
      return

    const signal = event.payload
    const now = Date.now()

    // Update Context
    this.runtime.getContext().updateNow(now)
    this.runtime.getContext().updateAttention({
      lastSignalType: signal.type,
      lastSignalSourceId: signal.sourceId ?? null,
      lastSignalAt: now,
    })

    if (signal.type === 'social_gesture') {
      this.runtime.getContext().updateSocial({
        lastGesture: (signal.metadata as any)?.gesture ?? 'unknown',
        lastGestureAt: now,
      })
    }

    // If it's a chat message (simulated via signal for now, or direct?)
    // For now we rely on signal metadata or separate chat event.
    // Assuming 'signal:social:chat' or similar might exist later.
    // For greeting behavior compatibility, we might need to map specific signals to social state.

    // Trigger behavior selection
    this.runtime.tick(bot, 0, this.deps.perception)

    // Emit reflex state for observability
    DebugService.getInstance().emitReflexState({
      mode: this.runtime.getMode(),
      activeBehaviorId: this.runtime.getActiveBehaviorId(),
      context: this.runtime.getContext().getSnapshot(),
    })
  }
}
