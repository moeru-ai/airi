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
      onBehaviorEnd?: () => void
      onModeChange?: (mode: ReflexModeId) => void
    },
  ) { }

  public getContext(): ReflexContext {
    return this.context
  }

  public getMode(): ReflexModeId {
    return this.mode
  }

  /**
   * Single entrypoint for mode changes. Runs onExit/onEnter side effects and notifies onModeChange
   * only when the mode actually changes. Pass bot when available so mode handlers can perform
   * movement/interrupt cleanup.
   */
  public transitionMode(mode: ReflexModeId, bot: MineflayerWithAgents | null): void {
    if (mode === this.mode)
      return

    this.deps.onModeChange?.(mode)

    const prev = this.mode
    this.onExitMode(prev, bot)
    this.mode = mode
    this.onEnterMode(mode, bot)
  }

  private onEnterMode(mode: ReflexModeId, _bot: MineflayerWithAgents | null): void {
    if (mode !== 'social')
      return
  }

  private onExitMode(mode: ReflexModeId, _bot: MineflayerWithAgents | null): void {
    if (mode !== 'social')
      return
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
      holding: bot.bot.heldItem?.name ?? null,
    })

    const selfPos = entity.position
    const maxNearbyDistance = 32
    const players = Object.entries(bot.bot.players ?? {})
      .filter(([name]) => name !== bot.bot.username)
      .reduce((acc, [name, player]) => {
        const pos = player?.entity?.position
        if (!pos)
          return acc
        let distance: number | null = null
        try {
          distance = selfPos.distanceTo(pos)
        }
        catch {
          distance = null
        }
        if (distance === null || distance > maxNearbyDistance)
          return acc
        acc.push({
          name,
          distance,
          holding: player?.entity?.heldItem?.name ?? null,
        })
        return acc
      }, [] as Array<{ name: string, distance: number, holding: string | null }>)

    const formatMinecraftTime = (timeOfDay?: number): string => {
      if (typeof timeOfDay !== 'number')
        return 'Unknown time'

      const hours24 = (6 + Math.floor(timeOfDay / 1000)) % 24
      const minutes = Math.floor(((timeOfDay % 1000) * 60) / 1000)

      const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
      const suffix = hours24 >= 12 ? 'PM' : 'AM'
      return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`
    }

    this.context.updateEnvironment({
      time: formatMinecraftTime(bot.bot.time?.timeOfDay),
      weather: bot.bot.isRaining ? 'rain' : 'clear',
      nearbyPlayers: players,
    })

    // Allow explicit modes like 'work' / 'wander' to remain until changed by caller.
    // Otherwise, compute from context automatically.
    // TODO: consider letting 'alert' preempt work/wander so survival can override tasks.
    if (this.mode !== 'work' && this.mode !== 'wander') {
      const nextMode = selectMode(this.context.getSnapshot())
      this.transitionMode(nextMode, bot)
    }

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
          this.deps.onBehaviorEnd?.()
        })
      }
      else {
        // Synchronous behavior ends immediately.
        this.activeBehaviorId = null
        this.deps.onBehaviorEnd?.()
      }

      return best.behavior.id
    }
    catch (err) {
      this.deps.logger.withError(err as Error).error('ReflexRuntime: behavior failed')
      this.activeBehaviorId = null
      this.activeBehaviorUntil = null
      this.deps.onBehaviorEnd?.()
      return null
    }
  }
}
