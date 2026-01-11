/**
 * Rules module exports
 */

// Accumulator (pure functions)
export {
  advanceSlots,
  calculateSlotDelta,
  calculateWindowSlots,
  createAccumulatorState,
  DEFAULT_SLOT_MS,
  incrementCount,
  parseWindowDuration,
  processEvent,
  resetAfterFire,
} from './accumulator'
// Engine
export { createRuleEngine, RuleEngine } from './engine'

export type { RuleEngineConfig } from './engine'

// Loader
export {
  loadRuleFile,
  loadRulesFromDirectory,
  parseRule,
  parseRuleFromString,
} from './loader'

// Matcher (pure functions)
export {
  buildEventType,
  getNestedValue,
  matchCondition,
  matchEventType,
  matchWhere,
  renderMetadata,
  renderTemplate,
} from './matcher'

// Types
export type {
  AccumulatorsState,
  AccumulatorState,
  ParsedRule,
  Rule,
  RuleMatchResult,
  SignalConfig,
  TypeScriptRule,
  WhereClause,
  WhereCondition,
  YamlRule,
} from './types'
export { isTypeScriptRule } from './types'
