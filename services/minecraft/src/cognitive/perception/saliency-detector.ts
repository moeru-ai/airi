import type { Logg } from '@guiiai/logg'

import type { SaliencyRuleBook } from './saliency-rules'
import type { RawPerceptionEvent } from './types/raw-events'
import type { PerceptionSignal } from './types/signals'

import { EVENT_KEYS, SALIENCY_RULES, WINDOW_SIZE } from './saliency-rules'

/**
 * Circular buffer counter for a single event type
 */
interface WindowCounter {
  /** Current head position in circular buffer */
  head: number
  /** Event counts per slot */
  counts: number[]
  /** Trigger markers per slot (1 = fired in this slot) */
  triggers: number[]
  /** Running total of counts in window */
  total: number
  /** Slot when last event was received */
  lastEventSlot: number
  /** Slot when threshold was last triggered */
  lastFireSlot: number | null
  /** Total count when last fired */
  lastFireTotal: number
}

/**
 * Debug snapshot data for a single counter
 */
export interface CounterSnapshot {
  key: string
  total: number
  window: number[]
  triggers: number[]
  lastFireSlot: number | null
  lastFireTotal: number
}

/**
 * Debug snapshot for the entire saliency system
 */
export interface SaliencySnapshot {
  slot: number
  counters: CounterSnapshot[]
}

export class SaliencyDetector {
  /** Fixed set of counters - one per event key, never deleted */
  private readonly counters: Map<string, WindowCounter> = new Map()

  /** Current slot (advances every slotMs) */
  private currentSlot = 0

  /** Timer for advancing slots */
  private timer: ReturnType<typeof setInterval> | null = null

  /** Milliseconds per slot */
  private readonly slotMs = 20

  constructor(
    private readonly deps: {
      logger: Logg
      onAttention: (signal: PerceptionSignal) => void
      rules?: SaliencyRuleBook
    },
  ) {
    // Initialize all counters at construction (fixed set)
    for (const key of EVENT_KEYS) {
      this.counters.set(key, this.createCounter())
    }
  }

  public start(): void {
    if (this.timer)
      return

    this.timer = setInterval(() => {
      this.currentSlot += 1
      this.advanceWindows()
    }, this.slotMs)
  }

  public stop(): void {
    if (!this.timer)
      return
    clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Process an incoming perception event
   */
  public ingest(event: RawPerceptionEvent): void {
    const rule = this.lookupRule(event)
    if (!rule)
      return

    if (rule.predicate && !rule.predicate(event))
      return

    const counter = this.counters.get(rule.key)
    if (!counter) {
      // Unknown key - should not happen with fixed key set
      return
    }

    // Increment count in current slot
    counter.counts[counter.head] = (counter.counts[counter.head] ?? 0) + 1
    counter.total += 1
    counter.lastEventSlot = this.currentSlot

    // Check threshold
    if (counter.total >= rule.threshold) {
      counter.lastFireSlot = this.currentSlot
      counter.lastFireTotal = counter.total
      counter.triggers[counter.head] = 1
      this.resetCounter(counter)
      this.emitSignal(rule.buildSignal(event))
    }
  }

  /**
   * Get debug snapshot for visualization
   * Returns all counters in fixed order (always same keys, same order)
   */
  public getDebugSnapshot(): SaliencySnapshot {
    const counters: CounterSnapshot[] = []

    for (const key of EVENT_KEYS) {
      const counter = this.counters.get(key)
      if (!counter)
        continue

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

  /**
   * Advance all windows by one slot
   * Never deletes counters - they persist with zeroed values
   */
  private advanceWindows(): void {
    for (const counter of this.counters.values()) {
      // Move head forward in circular buffer
      counter.head = (counter.head + 1) % WINDOW_SIZE

      // Subtract expired slot from total
      const expired = counter.counts[counter.head] ?? 0
      if (expired > 0) {
        counter.total = Math.max(0, counter.total - expired)
      }

      // Clear the slot for new data
      counter.counts[counter.head] = 0
      counter.triggers[counter.head] = 0
    }
  }

  /**
   * Create a new counter with zeroed circular buffer
   */
  private createCounter(): WindowCounter {
    return {
      head: 0,
      counts: new Array(WINDOW_SIZE).fill(0),
      triggers: new Array(WINDOW_SIZE).fill(0),
      total: 0,
      lastEventSlot: 0,
      lastFireSlot: null,
      lastFireTotal: 0,
    }
  }

  /**
   * Reset counter counts (after threshold triggered)
   * Note: We only reset the counts, not triggers - triggers are visual markers
   * that should persist until they naturally expire in the circular buffer
   */
  private resetCounter(counter: WindowCounter): void {
    counter.total = 0
    counter.counts.fill(0)
    // Don't reset triggers - they're historical markers for visualization
  }

  /**
   * Export window data in chronological order (oldest -> newest)
   */
  private exportWindow(counter: WindowCounter): number[] {
    const out = new Array<number>(WINDOW_SIZE)
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const idx = (counter.head + 1 + i) % WINDOW_SIZE
      out[i] = counter.counts[idx] ?? 0
    }
    return out
  }

  /**
   * Export trigger markers in chronological order (oldest -> newest)
   */
  private exportTriggers(counter: WindowCounter): number[] {
    const out = new Array<number>(WINDOW_SIZE)
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const idx = (counter.head + 1 + i) % WINDOW_SIZE
      out[i] = counter.triggers[idx] ?? 0
    }
    return out
  }

  /**
   * Find matching rule for an event
   */
  private lookupRule(event: RawPerceptionEvent) {
    const rules = this.deps.rules ?? SALIENCY_RULES
    return rules[event.modality]?.[event.kind]
  }

  /**
   * Emit a perception signal via callback
   */
  private emitSignal(signal: PerceptionSignal): void {
    // this.deps.logger.withFields({
    //   type: signal.type,
    //   desc: signal.description,
    //   meta: signal.metadata,
    // }).log('SaliencyDetector: emit')

    this.deps.onAttention(signal)
  }
}
