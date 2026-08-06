import type { Logg } from '@guiiai/logg'
import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

import type {
  PerceptionContext,
  PerceptionEventDefinition,
  RawPerceptionEventBase,
} from './types'

export function definePerceptionEvent<TArgs extends any[], TExtract>(
  definition: PerceptionEventDefinition<TArgs, TExtract>,
): PerceptionEventDefinition<TArgs, TExtract> {
  return definition
}

interface RegisteredListener {
  event: string
  handler: (...args: any[]) => void
}

export interface EventRegistryDeps {
  logger: Logg
  onRawEvent: (event: RawPerceptionEventBase & Record<string, any>) => void
}

export class EventRegistry {
  private definitions: Map<string, PerceptionEventDefinition> = new Map()
  private listeners: RegisteredListener[] = []
  private context: PerceptionContext | null = null
  private maxDistance = 32

  constructor(private readonly deps: EventRegistryDeps) { }

  public register(definition: PerceptionEventDefinition): void {
    this.definitions.set(definition.id, definition)
  }

  public registerAll(definitions: PerceptionEventDefinition[]): void {
    for (const def of definitions) {
      this.register(def)
    }
  }

  public stop(): void {
    // NOTICE: Nullify context so that any stale mineflayer listeners that fire
    // after stop() (but before detachFromBot()) are silently ignored by the
    // guard at the top of handleMineflayerEvent.
    this.context = null
  }

  public attachToBot(bot: Bot, maxDistance = 32): void {
    this.maxDistance = maxDistance
    this.context = this.createContext(bot)

    for (const [_id, def] of this.definitions) {
      const handler = (...args: any[]) => {
        this.handleMineflayerEvent(def, args)
      }

      bot.on(def.mineflayer.event as any, handler)
      this.listeners.push({ event: def.mineflayer.event, handler })
    }
  }

  public detachFromBot(bot: Bot): void {
    for (const { event, handler } of this.listeners) {
      bot.off(event as any, handler)
    }
    this.listeners = []
    this.context = null
  }

  private createContext(bot: Bot): PerceptionContext {
    const distanceToPos = (pos: Vec3): number | null => {
      const selfPos = bot.entity?.position
      if (!selfPos || !pos)
        return null
      try {
        return selfPos.distanceTo(pos)
      }
      catch {
        return null
      }
    }

    const distanceTo = (entity: any): number | null => {
      const pos = entity?.position
      if (!pos)
        return null
      return distanceToPos(pos)
    }

    return {
      bot,
      selfUsername: bot.username,
      maxDistance: this.maxDistance,
      distanceTo,
      distanceToPos,
      isSelf: (entity: any) => entity?.username === bot.username,
      entityId: (entity: any) => String(entity?.id ?? entity?.uuid ?? entity?.username ?? 'unknown'),
    }
  }

  public getDefinitions(): PerceptionEventDefinition[] {
    return Array.from(this.definitions.values())
  }

  private handleMineflayerEvent(def: PerceptionEventDefinition, args: any[]): void {
    if (!this.context)
      return

    if (def.mineflayer.filter && !def.mineflayer.filter(this.context, ...args)) {
      return
    }

    const extracted = def.mineflayer.extract(this.context, ...args)
    const timestamp = Date.now()

    const rawEvent: RawPerceptionEventBase & Record<string, any> = {
      modality: def.modality,
      kind: def.kind,
      timestamp,
      source: 'minecraft',
      ...extracted,
    }

    this.deps.onRawEvent(rawEvent)
  }
}

export * from './types'
