import type { Logg } from '@guiiai/logg'

import { DEFAULT_THRESHOLD, DEFAULT_WINDOW_TICKS, SALIENCY_RULES, type SaliencyRuleBook } from './saliency-rules'
import type { RawPerceptionEvent } from './types/raw-events'
import type { PerceptionSignal } from './types/signals'

type WindowCounter = {
  windowTicks: number
  head: number
  counts: number[]
  triggers: number[]
  total: number
  lastEventSlot: number
  lastFireSlot: number | null
  lastFireTotal: number
}

export class SaliencyDetector {
  private readonly counters = new Map<string, WindowCounter>()

  private currentSlot = 0

  private timer: ReturnType<typeof setInterval> | null = null

  private readonly slotMs = 20

  private lastStatsAt = 0
  private emittedSinceStats: Record<string, number> = {}

  constructor(
    private readonly deps: {
      logger: Logg
      onAttention: (signal: PerceptionSignal) => void
      rules?: SaliencyRuleBook
      windowTicks?: number
      threshold?: number
    },
  ) { }

  public start(): void {
    if (this.timer)
      return

    this.timer = setInterval(() => {
      this.currentSlot += 1
      this.advanceWindows()

      const now = Date.now()
      if (now - this.lastStatsAt >= 2000) {
        this.lastStatsAt = now
        this.emittedSinceStats = {}
      }
    }, this.slotMs)
  }

  public stop(): void {
    if (!this.timer)
      return
    clearInterval(this.timer)
    this.timer = null
  }

  public ingest(event: RawPerceptionEvent): void {
    const rule = this.lookupRule(event)
    if (!rule)
      return

    if (rule.predicate && !rule.predicate(event))
      return

    const tick = this.currentSlot
    const windowTicks = rule.windowTicks ?? this.deps.windowTicks ?? DEFAULT_WINDOW_TICKS
    const threshold = rule.threshold ?? this.deps.threshold ?? DEFAULT_THRESHOLD
    const key = rule.key(event)

    const counter = this.getOrCreateCounter(key, windowTicks)

    counter.counts[counter.head] = (counter.counts[counter.head] ?? 0) + 1
    counter.total += 1
    counter.lastEventSlot = tick

    if (counter.total >= threshold) {
      counter.lastFireSlot = tick
      counter.lastFireTotal = counter.total
      counter.triggers[counter.head] = 1
      this.resetCounter(counter)
      const signal = rule.buildSignal(event)
      this.emitSignal(signal)
    }
  }

  public getDebugSnapshot(options?: { maxKeys?: number }): {
    slot: number
    keys: Array<{
      key: string
      total: number
      windowTicks: number
      window: number[]
      triggers: number[]
      lastFireSlot: number | null
      lastFireTotal: number
    }>
  } {
    const maxKeys = options?.maxKeys ?? 30

    const rows = Array.from(this.counters.entries()).map(([key, counter]) => {
      const window = this.exportWindow(counter)
      const triggers = this.exportTriggers(counter)
      const triggerSum = triggers.reduce((acc, v) => acc + (v ? 1 : 0), 0)
      const firedRecently = counter.lastFireSlot !== null && (this.currentSlot - counter.lastFireSlot) <= counter.windowTicks

      return {
        key,
        total: counter.total,
        windowTicks: counter.windowTicks,
        window,
        triggers,
        lastFireSlot: counter.lastFireSlot,
        lastFireTotal: counter.lastFireTotal,
        _triggerSum: triggerSum,
        _firedRecently: firedRecently,
      }
    })

    // Ensure keys with triggers/recent fires stay visible even if total was reset.
    rows.sort((a, b) => {
      if (a._triggerSum !== b._triggerSum)
        return b._triggerSum - a._triggerSum

      const af = a._firedRecently ? 1 : 0
      const bf = b._firedRecently ? 1 : 0
      if (af !== bf)
        return bf - af

      const at = a.lastFireSlot ?? -1
      const bt = b.lastFireSlot ?? -1
      if (at !== bt)
        return bt - at

      return b.total - a.total
    })

    return {
      slot: this.currentSlot,
      keys: rows.slice(0, maxKeys).map(({ _triggerSum: _ts, _firedRecently: _fr, ...row }) => row),
    }
  }

  private advanceWindows(): void {
    for (const [key, counter] of this.counters.entries()) {
      counter.head = (counter.head + 1) % counter.windowTicks
      const expired = counter.counts[counter.head] ?? 0
      if (expired > 0) {
        counter.total = Math.max(0, counter.total - expired)
        counter.counts[counter.head] = 0
      }
      else {
        counter.counts[counter.head] = 0
      }

      counter.triggers[counter.head] = 0

      if (counter.total === 0 && this.currentSlot - counter.lastEventSlot >= counter.windowTicks) {
        this.counters.delete(key)
      }
    }
  }

  private getOrCreateCounter(key: string, windowTicks: number): WindowCounter {
    const existing = this.counters.get(key)
    if (existing && existing.windowTicks === windowTicks)
      return existing

    const created: WindowCounter = {
      windowTicks,
      head: 0,
      counts: Array.from({ length: windowTicks }, () => 0),
      triggers: Array.from({ length: windowTicks }, () => 0),
      total: 0,
      lastEventSlot: this.currentSlot,
      lastFireSlot: null,
      lastFireTotal: 0,
    }
    this.counters.set(key, created)
    return created
  }

  private resetCounter(counter: WindowCounter): void {
    counter.total = 0
    counter.counts.fill(0)
  }

  private exportWindow(counter: WindowCounter): number[] {
    const w = counter.windowTicks
    const out = new Array<number>(w)
    // Oldest -> newest. The newest bucket is at `head`.
    for (let i = 0; i < w; i++) {
      const idx = (counter.head + 1 + i) % w
      out[i] = counter.counts[idx] ?? 0
    }
    return out
  }

  private exportTriggers(counter: WindowCounter): number[] {
    const w = counter.windowTicks
    const out = new Array<number>(w)
    // Oldest -> newest. The newest bucket is at `head`.
    for (let i = 0; i < w; i++) {
      const idx = (counter.head + 1 + i) % w
      out[i] = counter.triggers[idx] ?? 0
    }
    return out
  }

  private lookupRule(event: RawPerceptionEvent) {
    const rules = this.deps.rules ?? SALIENCY_RULES
    return rules[event.modality]?.[event.kind]
  }

  private emitSignal(signal: PerceptionSignal): void {
    const key = `emit.${signal.type}.${signal.metadata.action || 'unknown'}`
    this.emittedSinceStats[key] = (this.emittedSinceStats[key] ?? 0) + 1

    this.deps.logger.withFields({
      type: signal.type,
      desc: signal.description,
      meta: signal.metadata,
    }).log('SaliencyDetector: emit')

    this.deps.onAttention(signal)
  }
}
