import type { Logg } from '@guiiai/logg'
import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

import type {
  PerceptionContext,
  PerceptionEventDefinition,
  PerceptionSignal,
  RawPerceptionEventBase,
} from './types'

export function definePerceptionEvent<TArgs extends any[], TExtract>(
  definition: PerceptionEventDefinition<TArgs, TExtract>,
): PerceptionEventDefinition<TArgs, TExtract> {
  return definition
}

interface WindowCounter {
  head: number
  windowSize: number
  counts: number[]
  triggers: number[]
  total: number
  lastEventSlot: number
  lastFireSlot: number | null
  lastFireTotal: number
}

interface RegisteredListener {
  event: string
  handler: (...args: any[]) => void
}

export interface EventRegistryDeps {
  logger: Logg
  onSignal: (signal: PerceptionSignal) => void
  onRawEvent?: (event: RawPerceptionEventBase & Record<string, any>) => void
}

const SLOT_MS = 20
const DEFAULT_WINDOW_MS = 2000

export interface CounterSnapshot {
  key: string
  total: number
  window: number[]
  triggers: number[]
  lastFireSlot: number | null
  lastFireTotal: number
}

export interface SaliencySnapshot {
  slot: number
  counters: CounterSnapshot[]
}

export class EventRegistry {
  private definitions: Map<string, PerceptionEventDefinition> = new Map()
  private counters: Map<string, WindowCounter> = new Map()
  private listeners: RegisteredListener[] = []
  private currentSlot = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private context: PerceptionContext | null = null
  private maxDistance = 32

  constructor(private readonly deps: EventRegistryDeps) { }

  public register(definition: PerceptionEventDefinition): void {
    this.definitions.set(definition.id, definition)

    if (definition.saliency) {
      const windowMs = definition.saliency.windowMs ?? DEFAULT_WINDOW_MS
      const windowSize = Math.max(1, Math.round(windowMs / SLOT_MS))
      this.counters.set(definition.saliency.key, this.createCounter(windowSize))
    }
  }

  public registerAll(definitions: PerceptionEventDefinition[]): void {
    for (const def of definitions) {
      this.register(def)
    }
  }

  public start(): void {
    if (this.timer)
      return

    this.timer = setInterval(() => {
      this.currentSlot += 1
      this.advanceWindows()
    }, SLOT_MS)
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  public getDebugSnapshot(): SaliencySnapshot {
    const counters: CounterSnapshot[] = []

    for (const [key, counter] of this.counters.entries()) {
      counters.push({
        key,
        total: counter.total,
        window: this.exportWindow(counter),
        triggers: this.exportTriggers(counter),
        lastFireSlot: counter.lastFireSlot,
        lastFireTotal: counter.lastFireTotal,
      })
    }

    return {
      slot: this.currentSlot,
      counters,
    }
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

  public getSignalTypes(): string[] {
    const types = new Set<string>()
    for (const def of this.definitions.values()) {
      types.add(def.signal.type)
    }
    return Array.from(types)
  }

  public getDefinitions(): PerceptionEventDefinition[] {
    return Array.from(this.definitions.values())
  }

  public getSaliencyKeys(): string[] {
    return Array.from(this.counters.keys())
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

    if (def.routes.includes('reflex'))
      this.deps.onRawEvent?.(rawEvent)

    if (def.saliency) {
      const shouldEmit = this.incrementAndCheck(def.saliency.key, def.saliency.threshold)
      if (!shouldEmit)
        return
    }

    const signal: PerceptionSignal = {
      type: def.signal.type,
      description: def.signal.description(extracted, timestamp),
      sourceId: def.id,
      confidence: 1.0,
      timestamp,
      metadata: def.signal.metadata?.(extracted) ?? extracted,
    }

    if (def.routes.includes('conscious'))
      this.deps.onSignal(signal)
  }

  private incrementAndCheck(key: string, threshold: number): boolean {
    const counter = this.counters.get(key)
    if (!counter)
      return true

    counter.counts[counter.head] = (counter.counts[counter.head] ?? 0) + 1
    counter.total += 1
    counter.lastEventSlot = this.currentSlot

    if (counter.total >= threshold) {
      counter.lastFireSlot = this.currentSlot
      counter.lastFireTotal = counter.total
      counter.triggers[counter.head] = 1
      this.resetCounter(counter)
      return true
    }

    return false
  }

  private createCounter(windowSize: number): WindowCounter {
    return {
      head: 0,
      windowSize,
      counts: new Array(windowSize).fill(0),
      triggers: new Array(windowSize).fill(0),
      total: 0,
      lastEventSlot: 0,
      lastFireSlot: null,
      lastFireTotal: 0,
    }
  }

  private resetCounter(counter: WindowCounter): void {
    counter.total = 0
    counter.counts.fill(0)
    // do not reset triggers; they are historical markers for debug
  }

  private advanceWindows(): void {
    for (const counter of this.counters.values()) {
      counter.head = (counter.head + 1) % counter.windowSize
      const expired = counter.counts[counter.head] ?? 0
      if (expired > 0) {
        counter.total = Math.max(0, counter.total - expired)
      }
      counter.counts[counter.head] = 0
      counter.triggers[counter.head] = 0
    }
  }

  private exportWindow(counter: WindowCounter): number[] {
    const out = new Array<number>(counter.windowSize)
    for (let i = 0; i < counter.windowSize; i++) {
      const idx = (counter.head + 1 + i) % counter.windowSize
      out[i] = counter.counts[idx] ?? 0
    }
    return out
  }

  private exportTriggers(counter: WindowCounter): number[] {
    const out = new Array<number>(counter.windowSize)
    for (let i = 0; i < counter.windowSize; i++) {
      const idx = (counter.head + 1 + i) % counter.windowSize
      out[i] = counter.triggers[idx] ?? 0
    }
    return out
  }
}

export * from './types'
