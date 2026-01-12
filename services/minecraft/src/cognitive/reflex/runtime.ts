import type { Logg } from '@guiiai/logg'

import type { PerceptionAPI } from '../perception/perception-api'
import type { MineflayerWithAgents } from '../types'
import type { ReflexModeId } from './modes'
import type { ReflexBehavior } from './types/behavior'

import { ReflexContext } from './context'
import { selectMode } from './modes'

export class ReflexRuntime {
  private readonly context = new ReflexContext()
  private readonly behaviors: ReflexBehavior[] = []
  private readonly runHistory = new Map<string, { lastRunAt: number }>()

  private mode: ReflexModeId = 'idle'
  private activeBehaviorId: string | null = null
  private activeBehaviorUntil: number | null = null

  public constructor(
    private readonly deps: {
      logger: Logg
    },
  ) { }

  public getContext(): ReflexContext {
    return this.context
  }

  public getMode(): ReflexModeId {
    return this.mode
  }

  public getActiveBehaviorId(): string | null {
    return this.activeBehaviorId
  }

  public registerBehavior(behavior: ReflexBehavior): void {
    this.behaviors.push(behavior)
  }

  public tick(bot: MineflayerWithAgents, deltaMs: number, perception: PerceptionAPI): string | null {
    const now = Date.now()

    this.context.updateNow(now)

    const entity = bot.bot.entity
    if (!entity)
      return null

    // TODO: future refactor: update ReflexContext via world_update/self_update events instead of polling Mineflayer state.
    this.context.updateSelf({
      location: entity.position,
      health: bot.bot.health ?? 0,
      food: bot.bot.food ?? 0,
      oxygen: bot.bot.oxygenLevel ?? 0,
      holding: bot.bot.heldItem?.name ?? null,
    })

    this.context.updateEnvironment({
      time: bot.bot.time?.isDay ? 'day' : 'night',
      weather: bot.bot.isRaining ? 'rain' : 'clear',
      nearbyPlayers: Object.keys(bot.bot.players ?? {})
        .filter(p => p !== bot.bot.username)
        .map(name => ({ name })),
    })

    this.mode = selectMode(this.context.getSnapshot())

    if (this.activeBehaviorUntil && now < this.activeBehaviorUntil)
      return null

    this.activeBehaviorId = null
    this.activeBehaviorUntil = null

    const ctx = this.context.getSnapshot()
    const api = { bot, context: this.context, perception }

    let best: { behavior: ReflexBehavior, score: number } | null = null
    for (const behavior of this.behaviors) {
      if (!behavior.modes.includes(this.mode))
        continue

      if (!behavior.when(ctx, api))
        continue

      const score = behavior.score(ctx, api)
      if (score <= 0)
        continue

      const history = this.runHistory.get(behavior.id)
      const cooldownMs = behavior.cooldownMs ?? 0
      if (history && cooldownMs > 0 && now - history.lastRunAt < cooldownMs)
        continue

      if (!best || score > best.score)
        best = { behavior, score }
    }

    if (!best)
      return null

    this.activeBehaviorId = best.behavior.id
    this.runHistory.set(best.behavior.id, { lastRunAt: now })

    try {
      const maybePromise = best.behavior.run(api)
      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        this.activeBehaviorUntil = now + Math.max(deltaMs, 50)
        void (maybePromise as Promise<void>).finally(() => {
          // Behavior ends naturally; next tick can run a new one.
          this.activeBehaviorUntil = null
          this.activeBehaviorId = null
        })
      }
      else {
        // Synchronous behavior ends immediately.
        this.activeBehaviorId = null
      }

      this.deps.logger.withFields({
        mode: this.mode,
        behavior: best.behavior.id,
        score: best.score,
      }).log('ReflexRuntime: selected')

      return best.behavior.id
    }
    catch (err) {
      this.deps.logger.withError(err as Error).error('ReflexRuntime: behavior failed')
      this.activeBehaviorId = null
      this.activeBehaviorUntil = null
      return null
    }
  }
}
