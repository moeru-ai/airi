/**
 * Rule Engine - Orchestrates rule matching and signal generation
 *
 * This is the main entry point for the rule system.
 * Uses pure functions internally, with state managed via EventBus.
 */

import type { Logg } from '@guiiai/logg'

import type { EventBus, TracedEvent } from '../../event-bus'
import type {
  DetectorGroupBy,
  DetectorMode,
  DetectorsState,
  DetectorState,
  ParsedRule,
  Rule,
  TypeScriptRule,
} from './types'

import { loadRulesFromDirectory } from './loader'
import { matchEventType, matchWhere, renderMetadata, renderTemplate } from './matcher'
import {
  calculateWindowSlots,
  createDetectorState,
  DEFAULT_SLOT_MS,
  processEvent as processDetector,
} from './temporal-detector'
import { isTypeScriptRule } from './types'

const GLOBAL_GROUP_KEY = '__global__'
const MAX_DETECTOR_DECISIONS = 200

export type DetectorDecision = 'fired' | 'ignored_out_of_order' | 'matched_not_fired'

export interface DetectorDecisionSnapshot {
  readonly count: number
  readonly decision: DetectorDecision
  readonly eventTs: number
  readonly groupKey: string
  readonly mode: DetectorMode
  readonly ruleName: string
  readonly threshold: number
  readonly windowMs: number
}

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
  private readonly detectorDecisions: DetectorDecisionSnapshot[] = []
  // NOTICE: Keep detector states mutable in a Map on the hot path to avoid
  // per-event object spreads/freezes; only export frozen snapshots for debug reads.
  private readonly detectors: Map<string, DetectorState> = new Map()
  private readonly rules: Rule[] = []
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly deps: {
      config: RuleEngineConfig
      eventBus: EventBus
      logger: Logg
    },
  ) { }

  /**
   * Destroy the engine: unsubscribe from events
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.rules.length = 0
    this.detectors.clear()
    this.detectorDecisions.length = 0
  }

  /**
   * Get recent detector decisions for debugging/devtools.
   */
  public getDetectorDecisionSnapshot(limit: number = 50): readonly DetectorDecisionSnapshot[] {
    const safeLimit = Math.max(0, Math.floor(limit))
    if (safeLimit === 0) {
      return Object.freeze([])
    }

    return Object.freeze(this.detectorDecisions.slice(-safeLimit))
  }

  /**
   * Get current detector states (for debugging)
   */
  public getDetectorStates(): DetectorsState {
    return toDetectorSnapshot(this.detectors)
  }

  /**
   * Get loaded rules (for debugging)
   */
  public getRules(): readonly Rule[] {
    return Object.freeze([...this.rules])
  }

  /**
   * Initialize the engine: load rules and subscribe to events
   */
  public init(): void {
    // Load YAML rules
    const yamlRules = loadRulesFromDirectory(this.deps.config.rulesDir)
    this.rules.push(...yamlRules)

    this.deps.logger.withFields({
      ruleCount: yamlRules.length,
      rules: yamlRules.map(r => r.name),
      rulesDir: this.deps.config.rulesDir,
    }).log('RuleEngine: loaded rules')

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

    // Initialize detector for TS rule
    const windowSlots = calculateWindowSlots(2000, this.deps.config.slotMs ?? DEFAULT_SLOT_MS)
    this.detectors.set(rule.name, createDetectorState(windowSlots))

    this.deps.logger.withFields({ ruleName: rule.name }).log('RuleEngine: registered TS rule')
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
      confidence: rule.signal.confidence ?? 1.0,
      description,
      metadata,
      sourceId,
      timestamp: Date.now(),
      type: rule.signal.type,
    })

    // Emit as child of source event
    this.deps.eventBus.emitChild(sourceEvent, {
      payload: signal,
      source: { component: 'perception', id: rule.name },
      type: `signal:${signal.type}`,
    })
  }

  /**
   * Process an event through all matching rules
   */
  private processEvent(event: TracedEvent): void {
    const nowMs = resolveEventTimeMs(event)
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

    // Get detector state
    const detectorState = this.detectors.get(rule.name)
    if (!detectorState) {
      return
    }

    // Call TypeScript handler
    const result = rule.process(event.payload, detectorState)

    // Update detector state
    this.detectors.set(rule.name, result.newDetectorState)

    // If fired, emit signal event
    if (result.fired && result.signal) {
      this.deps.eventBus.emitChild(event, {
        payload: result.signal,
        source: { component: 'perception', id: rule.name },
        type: `signal:${result.signal.type}`,
      })
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

    const groupKey = resolveDetectorGroupKey(event.payload, rule.detector.groupBy)
    const stateKey = buildDetectorStateKey(rule.name, groupKey)

    // Get or create detector state
    let detectorState = this.detectors.get(stateKey)
    if (!detectorState) {
      const windowSlots = calculateWindowSlots(rule.detector.windowMs, slotMs)
      detectorState = createDetectorState(windowSlots, nowMs)
    }

    if (nowMs < detectorState.lastUpdateMs) {
      this.recordDetectorDecision(Object.freeze({
        count: detectorState.total,
        decision: 'ignored_out_of_order',
        eventTs: nowMs,
        groupKey,
        mode: rule.detector.mode,
        ruleName: rule.name,
        threshold: rule.detector.threshold,
        windowMs: rule.detector.windowMs,
      }))
      return
    }

    // Process through detector
    const [fired, newDetectorState] = processDetector(detectorState, {
      mode: rule.detector.mode,
      nowMs,
      slotMs,
      threshold: rule.detector.threshold,
      windowMs: rule.detector.windowMs,
    })

    // Update state
    this.detectors.set(stateKey, newDetectorState)

    this.recordDetectorDecision(Object.freeze({
      count: newDetectorState.total,
      decision: fired ? 'fired' : 'matched_not_fired',
      eventTs: nowMs,
      groupKey,
      mode: rule.detector.mode,
      ruleName: rule.name,
      threshold: rule.detector.threshold,
      windowMs: rule.detector.windowMs,
    }))

    // If fired, emit signal
    if (fired) {
      this.emitSignal(rule, event)
    }
  }

  private recordDetectorDecision(snapshot: DetectorDecisionSnapshot): void {
    this.detectorDecisions.push(snapshot)
    if (this.detectorDecisions.length > MAX_DETECTOR_DECISIONS) {
      this.detectorDecisions.splice(0, this.detectorDecisions.length - MAX_DETECTOR_DECISIONS)
    }
  }
}

/**
 * Factory function to create RuleEngine
 */
export function createRuleEngine(deps: {
  config: RuleEngineConfig
  eventBus: EventBus
  logger: Logg
}): RuleEngine {
  return new RuleEngine(deps)
}

function buildDetectorStateKey(ruleName: string, groupKey: string): string {
  return `${ruleName}::${groupKey}`
}

function resolveDetectorGroupKey(payload: unknown, groupBy?: DetectorGroupBy): string {
  if (groupBy === 'global') {
    return GLOBAL_GROUP_KEY
  }

  if (payload && typeof payload === 'object') {
    const record = payload as { entityId?: unknown, sourceId?: unknown }
    const entityId = typeof record.entityId === 'string' && record.entityId.length > 0
      ? record.entityId
      : undefined
    const sourceId = typeof record.sourceId === 'string' && record.sourceId.length > 0
      ? record.sourceId
      : undefined

    if (groupBy === 'entityId') {
      return entityId ?? GLOBAL_GROUP_KEY
    }

    if (groupBy === 'sourceId') {
      return sourceId ?? GLOBAL_GROUP_KEY
    }

    // NOTICE: Keep backward compatibility when detector.groupBy is omitted.
    return entityId ?? sourceId ?? GLOBAL_GROUP_KEY
  }

  return GLOBAL_GROUP_KEY
}

function resolveEventTimeMs(event: TracedEvent): number {
  const payload = event.payload as null | { timestamp?: unknown }
  if (payload && typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)) {
    return payload.timestamp
  }

  return event.timestamp
}

function toDetectorSnapshot(detectors: ReadonlyMap<string, DetectorState>): DetectorsState {
  const snapshot: Record<string, DetectorState> = Object.create(null)
  for (const [stateKey, detectorState] of detectors.entries()) {
    snapshot[stateKey] = detectorState
  }

  return Object.freeze(snapshot)
}
