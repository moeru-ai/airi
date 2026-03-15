/**
 * Rules module exports
 */

// Engine
export { createRuleEngine, RuleEngine } from './engine'
export type {
  DetectorDecision,
  DetectorDecisionSnapshot,
  RuleEngineConfig,
} from './engine'

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

// Detector (pure functions)
export {
  advanceSlots,
  calculateSlotDelta,
  calculateWindowSlots,
  createDetectorState,
  DEFAULT_SLOT_MS,
  incrementCount,
  parseWindowDuration,
  processEvent,
  resetAfterFire,
} from './temporal-detector'

// Types
export type {
  DetectorsState,
  DetectorState,
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
