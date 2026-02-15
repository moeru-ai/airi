/**
 * Rule Engine - Orchestrates rule matching and signal generation
 *
 * This is the main entry point for the rule system.
 * Uses pure functions internally, with state managed via EventBus.
 */

import type { Logg } from '@guiiai/logg'

import type { EventBus, TracedEvent } from '../../event-bus'
import type {
  AccumulatorsState,
  ParsedRule,
  Rule,
  TypeScriptRule,
} from './types'

import {
  calculateWindowSlots,
  createAccumulatorState,
  DEFAULT_SLOT_MS,
  processEvent as processAccumulator,
} from './accumulator'
import { loadRulesFromDirectory } from './loader'
import { matchEventType, matchWhere, renderMetadata, renderTemplate } from './matcher'
import { isTypeScriptRule } from './types'

/**
 * Rule Engine configuration
 */
export interface RuleEngineConfig {
  /** Directory containing YAML rules */
  readonly rulesDir: string
  /** Slot duration in ms (default: 20) */
  readonly slotMs?: number
}

/**
 * Rule Engine - subscribes to EventBus and processes events through rules
 */
export class RuleEngine {
  private readonly rules: Rule[] = []
  private accumulators: AccumulatorsState = {}
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly deps: {
      eventBus: EventBus
      logger: Logg
      config: RuleEngineConfig
    },
  ) { }

  /**
   * Initialize the engine: load rules and subscribe to events
   */
  public init(): void {
    // Load YAML rules
    const yamlRules = loadRulesFromDirectory(this.deps.config.rulesDir)
    this.rules.push(...yamlRules)

    this.deps.logger.withFields({
      rulesDir: this.deps.config.rulesDir,
      ruleCount: yamlRules.length,
      rules: yamlRules.map(r => r.name),
    }).log('RuleEngine: loaded rules')

    // Initialize accumulators for each rule
    for (const rule of this.rules) {
      if (!isTypeScriptRule(rule)) {
        const windowSlots = calculateWindowSlots(
          rule.accumulator.windowMs,
          this.deps.config.slotMs ?? DEFAULT_SLOT_MS,
        )
        this.accumulators = Object.freeze({
          ...this.accumulators,
          [rule.name]: createAccumulatorState(windowSlots),
        })
      }
    }

    // Subscribe to all raw events
    this.unsubscribe = this.deps.eventBus.subscribe('raw:*', (event) => {
      this.processEvent(event)
    })
  }

  /**
   * Register a TypeScript rule (escape hatch for complex logic)
   */
  public registerTypeScriptRule(rule: TypeScriptRule): void {
    this.rules.push(rule)

    // Initialize accumulator for TS rule
    const windowSlots = calculateWindowSlots(2000, this.deps.config.slotMs ?? DEFAULT_SLOT_MS)
    this.accumulators = Object.freeze({
      ...this.accumulators,
      [rule.name]: createAccumulatorState(windowSlots),
    })

    this.deps.logger.withFields({ ruleName: rule.name }).log('RuleEngine: registered TS rule')
  }

  /**
   * Destroy the engine: unsubscribe from events
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.rules.length = 0
    this.accumulators = {}
  }

  /**
   * Get current accumulator states (for debugging)
   */
  public getAccumulatorStates(): AccumulatorsState {
    return this.accumulators
  }

  /**
   * Get loaded rules (for debugging)
   */
  public getRules(): readonly Rule[] {
    return Object.freeze([...this.rules])
  }

  /**
   * Process an event through all matching rules
   */
  private processEvent(event: TracedEvent): void {
    const nowMs = Date.now()
    const slotMs = this.deps.config.slotMs ?? DEFAULT_SLOT_MS

    for (const rule of this.rules) {
      try {
        if (isTypeScriptRule(rule)) {
          this.processTypeScriptRule(rule, event, nowMs)
        }
        else {
          this.processYamlRule(rule, event, nowMs, slotMs)
        }
      }
      catch (err) {
        this.deps.logger
          .withError(err as Error)
          .withFields({ ruleName: isTypeScriptRule(rule) ? rule.name : rule.name })
          .error('RuleEngine: rule processing failed')
      }
    }
  }

  /**
   * Process event through a YAML rule
   */
  private processYamlRule(
    rule: ParsedRule,
    event: TracedEvent,
    nowMs: number,
    slotMs: number,
  ): void {
    // Check event type match
    if (!matchEventType(rule.trigger.eventType, event.type)) {
      return
    }

    // Check where conditions
    if (!matchWhere(rule.trigger.where, event.payload)) {
      return
    }

    // Get or create accumulator state
    let accState = this.accumulators[rule.name]
    if (!accState) {
      const windowSlots = calculateWindowSlots(rule.accumulator.windowMs, slotMs)
      accState = createAccumulatorState(windowSlots)
    }

    // Process through accumulator
    const [fired, newAccState] = processAccumulator(accState, rule.accumulator.threshold, nowMs, slotMs)

    // Update state
    this.accumulators = Object.freeze({
      ...this.accumulators,
      [rule.name]: newAccState,
    })

    // If fired, emit signal
    if (fired) {
      this.emitSignal(rule, event)
    }
  }

  /**
   * Process event through a TypeScript rule
   */
  private processTypeScriptRule(
    rule: TypeScriptRule,
    event: TracedEvent,
    _nowMs: number,
  ): void {
    // Check event pattern match
    if (!matchEventType(rule.eventPattern, event.type)) {
      return
    }

    // Get accumulator state
    const accState = this.accumulators[rule.name]
    if (!accState) {
      return
    }

    // Call TypeScript handler
    const result = rule.process(event.payload, accState)

    // Update accumulator state
    this.accumulators = Object.freeze({
      ...this.accumulators,
      [rule.name]: result.newAccumulatorState,
    })

    // If fired, emit signal event
    if (result.fired && result.signal) {
      this.deps.eventBus.emitChild(event, {
        type: `signal:${result.signal.type}`,
        payload: result.signal,
        source: { component: 'perception', id: rule.name },
      })
    }
  }

  /**
   * Emit a signal from a YAML rule
   */
  private emitSignal(rule: ParsedRule, sourceEvent: TracedEvent): void {
    const payload = sourceEvent.payload as Record<string, unknown>

    // Build context for template rendering
    const context: Record<string, unknown> = {
      ...payload,
      _event: sourceEvent,
      _rule: rule,
    }

    // Render description and metadata
    const description = renderTemplate(rule.signal.description, context)
    const metadata = renderMetadata(rule.signal.metadata, context)

    // Get sourceId from payload if available
    const sourceId = (payload as { entityId?: string, sourceId?: string })?.entityId
      ?? (payload as { entityId?: string, sourceId?: string })?.sourceId

    const signal = Object.freeze({
      type: rule.signal.type,
      description,
      confidence: rule.signal.confidence ?? 1.0,
      metadata,
      sourceId,
      timestamp: Date.now(),
    })

    // Emit as child of source event
    this.deps.eventBus.emitChild(sourceEvent, {
      type: `signal:${signal.type}`,
      payload: signal,
      source: { component: 'perception', id: rule.name },
    })
  }
}

/**
 * Factory function to create RuleEngine
 */
export function createRuleEngine(deps: {
  eventBus: EventBus
  logger: Logg
  config: RuleEngineConfig
}): RuleEngine {
  return new RuleEngine(deps)
}
