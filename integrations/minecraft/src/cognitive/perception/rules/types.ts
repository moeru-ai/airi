/**
 * YAML Rule DSL Types
 *
 * These schemas define the YAML rule DSL at runtime and expose inferred
 * TypeScript types for the rest of the rules engine.
 */

import { z } from 'zod'

const perceptionModalityValues = ['sighted', 'heard', 'felt', 'system'] as const
const detectorModeValues = ['sliding', 'tumbling'] as const
const detectorGroupByValues = ['entityId', 'sourceId', 'global'] as const

/**
 * Comparison operators for where clauses
 */
export type ComparisonOperator = 'contains' | 'eq' | 'gt' | 'gte' | 'in' | 'lt' | 'lte' | 'ne'
export type DetectorGroupBy = typeof detectorGroupByValues[number]

export type DetectorMode = typeof detectorModeValues[number]

function isValidWindowDuration(value: string): boolean {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/)
  if (!match) {
    return false
  }

  return Number.parseFloat(match[1]) > 0
}

/**
 * A single condition in a where clause
 * Can be a direct value (equality) or an object with operator
 */
const whereLiteralSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
])

export const whereConditionSchema = z.union([
  whereLiteralSchema,
  z.object({ eq: whereLiteralSchema }).strict(),
  z.object({ ne: whereLiteralSchema }).strict(),
  z.object({ lt: z.number().finite() }).strict(),
  z.object({ lte: z.number().finite() }).strict(),
  z.object({ gt: z.number().finite() }).strict(),
  z.object({ gte: z.number().finite() }).strict(),
  z.object({ in: z.array(whereLiteralSchema).min(1) }).strict(),
  z.object({ contains: z.string() }).strict(),
])

export type WhereCondition = z.infer<typeof whereConditionSchema>

/**
 * Where clause - conditions to match against event payload
 */
export const whereClauseSchema = z.record(
  z.string().min(1),
  whereConditionSchema,
)

export type WhereClause = z.infer<typeof whereClauseSchema>

/**
 * Trigger definition in YAML
 */
export const ruleTriggerSchema = z.object({
  /** Event kind (e.g., 'arm_swing', 'sound') */
  kind: z.string().trim().min(1),
  /** Event modality (e.g., 'sighted', 'heard', 'felt') */
  modality: z.enum(perceptionModalityValues),
  /** Optional conditions on event payload */
  where: whereClauseSchema.optional(),
}).strict()

export type RuleTrigger = z.infer<typeof ruleTriggerSchema>

/**
 * Detector configuration
 */
export const detectorConfigSchema = z.object({
  /**
   * Optional grouping key selector.
   * If omitted, engine keeps the legacy fallback: entityId -> sourceId -> global.
   */
  groupBy: z.enum(detectorGroupByValues).optional(),
  /** Window mode: sliding (default) or tumbling */
  mode: z.enum(detectorModeValues).optional(),
  /** Number of events needed to trigger */
  threshold: z.number().int().positive(),
  /** Time window (e.g., '2s', '500ms') */
  window: z.string().trim().min(1).refine(
    isValidWindowDuration,
    'Window must be a positive duration like 500ms, 2s, or 1m',
  ),
}).strict()

export type DetectorConfig = z.infer<typeof detectorConfigSchema>

/**
 * Signal output configuration
 */
export const signalMetadataSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number().finite(), z.boolean()]),
)

export const signalConfigSchema = z.object({
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1).optional(),
  /** Description template with {{ placeholders }} */
  description: z.string().trim().min(1),
  /** Additional metadata with templates */
  metadata: signalMetadataSchema.optional(),
  /** Signal type (e.g., 'entity_attention', 'environmental_anomaly') */
  type: z.string().trim().min(1),
}).strict()

export type SignalConfig = z.infer<typeof signalConfigSchema>

/**
 * Complete YAML rule definition
 */
export const yamlRuleSchema = z.object({
  /** Detector configuration */
  detector: detectorConfigSchema,
  /** Rule name (unique identifier) */
  name: z.string().trim().min(1),
  /** Signal to emit when rule fires */
  signal: signalConfigSchema,
  /** Trigger configuration */
  trigger: ruleTriggerSchema,
  /** Rule version */
  version: z.number().int().positive().optional(),
}).strict()

/**
 * Complete state for all detectors.
 * Key format is implementation-defined (e.g. rule name or rule+group instance key).
 */
export type DetectorsState = Readonly<Record<string, DetectorState>>

/**
 * Detector state for a single rule instance
 * Immutable - each update returns a new state
 */
export interface DetectorState {
  /** Circular buffer of event counts per slot */
  readonly counts: readonly number[]
  /** Current head position in buffer */
  readonly head: number
  /** Marker for last fired slot/window (used by tumbling once-per-window). */
  readonly lastFireSlot: null | number
  /** Last update timestamp */
  readonly lastUpdateMs: number
  /** Running total */
  readonly total: number
}

/**
 * Parsed and validated rule (internal representation)
 */
export interface ParsedRule {
  readonly detector: {
    readonly groupBy?: DetectorGroupBy
    readonly mode: DetectorMode
    readonly threshold: number
    readonly windowMs: number
  }
  readonly name: string
  readonly signal: SignalConfig
  /** Source file path for debugging */
  readonly sourcePath: string
  readonly trigger: {
    readonly eventType: string // e.g., 'raw:sighted:arm_swing'
    readonly where?: WhereClause
  }
  readonly version: number
}

/**
 * Union of rule types
 */
export type Rule = ParsedRule | TypeScriptRule

/**
 * Result of processing an event through a rule
 */
export interface RuleMatchResult {
  /** Whether the rule matched and fired */
  readonly fired: boolean
  /** Updated detector state */
  readonly newDetectorState: DetectorState
  /** The signal to emit (if fired) */
  readonly signal?: Readonly<{
    confidence: number
    description: string
    metadata: Readonly<Record<string, unknown>>
    sourceId?: string
    type: string
  }>
}

/**
 * TypeScript escape hatch for complex rules
 * Generic T allows type-safe payload handling
 */
export interface TypeScriptRule<T = unknown> {
  readonly eventPattern: string
  readonly name: string
  /** Process function - receives typed payload and detector state */
  readonly process: (
    payload: T,
    detectorState: DetectorState,
  ) => RuleMatchResult
}

export type YamlRule = z.infer<typeof yamlRuleSchema>

/**
 * Check if a rule is a TypeScript rule
 */
export function isTypeScriptRule(rule: Rule): rule is TypeScriptRule {
  return 'process' in rule
}
