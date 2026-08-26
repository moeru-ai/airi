import type { Logg } from '@guiiai/logg'
import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

import type {
  PerceptionContext,
  PerceptionEventDefinition,
  RawPerceptionEventBase,
} from './types'

export interface EventRegistryDeps {
  logger: Logg
  onRawEvent: (event: RawPerceptionEventBase & Record<string, any>) => void
}

interface RegisteredListener {
  event: string
  handler: (...args: any[]) => void
}

export class EventRegistry {
  private context: null | PerceptionContext = null
  private definitions: Map<string, PerceptionEventDefinition> = new Map()
  private listeners: RegisteredListener[] = []
  private maxDistance = 32

  constructor(private readonly deps: EventRegistryDeps) { }

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

  public getDefinitions(): PerceptionEventDefinition[] {
    return Array.from(this.definitions.values())
  }

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

  private createContext(bot: Bot): PerceptionContext {
    const distanceToPos = (pos: Vec3): null | number => {
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

    const distanceTo = (entity: any): null | number => {
      const pos = entity?.position
      if (!pos)
        return null
      return distanceToPos(pos)
    }

    return {
      bot,
      distanceTo,
      distanceToPos,
      entityId: (entity: any) => String(entity?.id ?? entity?.uuid ?? entity?.username ?? 'unknown'),
      isSelf: (entity: any) => entity?.username === bot.username,
      maxDistance: this.maxDistance,
      selfUsername: bot.username,
    }
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
      kind: def.kind,
      modality: def.modality,
      source: 'minecraft',
      timestamp,
      ...extracted,
    }

    this.deps.onRawEvent(rawEvent)
  }
}

export function definePerceptionEvent<TArgs extends any[], TExtract>(
  definition: PerceptionEventDefinition<TArgs, TExtract>,
): PerceptionEventDefinition<TArgs, TExtract> {
  return definition
}

export * from './types'
