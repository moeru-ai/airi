/**
 * YAML Rule DSL Types
 *
 * These types define the structure of YAML rule files.
 * All types are immutable (Readonly) to enforce FP principles.
 */

/**
 * Comparison operators for where clauses
 */
export type ComparisonOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'contains'

/**
 * A single condition in a where clause
 * Can be a direct value (equality) or an object with operator
 */
export type WhereCondition
  = | string
    | number
    | boolean
    | { readonly eq?: unknown }
    | { readonly ne?: unknown }
    | { readonly lt?: number }
    | { readonly lte?: number }
    | { readonly gt?: number }
    | { readonly gte?: number }
    | { readonly in?: readonly unknown[] }
    | { readonly contains?: string }

/**
 * Where clause - conditions to match against event payload
 */
export type WhereClause = Readonly<Record<string, WhereCondition>>

/**
 * Trigger definition in YAML
 */
export interface RuleTrigger {
  /** Event modality (e.g., 'sighted', 'heard', 'felt') */
  readonly modality: string
  /** Event kind (e.g., 'arm_swing', 'sound') */
  readonly kind: string
  /** Optional conditions on event payload */
  readonly where?: WhereClause
}

/**
 * Accumulator configuration
 */
export interface AccumulatorConfig {
  /** Number of events needed to trigger */
  readonly threshold: number
  /** Time window (e.g., '2s', '500ms') */
  readonly window: string
  /** Window mode: sliding (default) or tumbling */
  readonly mode?: 'sliding' | 'tumbling'
}

/**
 * Signal output configuration
 */
export interface SignalConfig {
  /** Signal type (e.g., 'entity_attention', 'environmental_anomaly') */
  readonly type: string
  /** Description template with {{ placeholders }} */
  readonly description: string
  /** Confidence score (0-1) */
  readonly confidence?: number
  /** Additional metadata with templates */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>
}

/**
 * Complete YAML rule definition
 */
export interface YamlRule {
  /** Rule name (unique identifier) */
  readonly name: string
  /** Rule version */
  readonly version?: number
  /** Trigger configuration */
  readonly trigger: RuleTrigger
  /** Accumulator configuration */
  readonly accumulator: AccumulatorConfig
  /** Signal to emit when rule fires */
  readonly signal: SignalConfig
}

/**
 * Parsed and validated rule (internal representation)
 */
export interface ParsedRule {
  readonly name: string
  readonly version: number
  readonly trigger: {
    readonly eventType: string // e.g., 'raw:sighted:arm_swing'
    readonly where?: WhereClause
  }
  readonly accumulator: {
    readonly threshold: number
    readonly windowMs: number
    readonly mode: 'sliding' | 'tumbling'
  }
  readonly signal: SignalConfig
  /** Source file path for debugging */
  readonly sourcePath: string
}

/**
 * Accumulator state for a single rule instance
 * Immutable - each update returns a new state
 */
export interface AccumulatorState {
  /** Circular buffer of event counts per slot */
  readonly counts: readonly number[]
  /** Current head position in buffer */
  readonly head: number
  /** Running total */
  readonly total: number
  /** Last update timestamp */
  readonly lastUpdateMs: number
  /** Slot when last fired */
  readonly lastFireSlot: number | null
}

/**
 * Complete state for all accumulators
 */
export type AccumulatorsState = Readonly<Record<string, AccumulatorState>>

/**
 * Result of processing an event through a rule
 */
export interface RuleMatchResult {
  /** Whether the rule matched and fired */
  readonly fired: boolean
  /** The signal to emit (if fired) */
  readonly signal?: Readonly<{
    type: string
    description: string
    confidence: number
    metadata: Readonly<Record<string, unknown>>
    sourceId?: string
  }>
  /** Updated accumulator state */
  readonly newAccumulatorState: AccumulatorState
}

/**
 * TypeScript escape hatch for complex rules
 * Generic T allows type-safe payload handling
 */
export interface TypeScriptRule<T = unknown> {
  readonly name: string
  readonly eventPattern: string
  /** Process function - receives typed payload and accumulator state */
  readonly process: (
    payload: T,
    accState: AccumulatorState,
  ) => RuleMatchResult
}

/**
 * Union of rule types
 */
export type Rule = ParsedRule | TypeScriptRule

/**
 * Check if a rule is a TypeScript rule
 */
export function isTypeScriptRule(rule: Rule): rule is TypeScriptRule {
  return 'process' in rule
}
