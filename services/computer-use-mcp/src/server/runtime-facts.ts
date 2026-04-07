import type { BrowserSurfaceAvailability, DisplayInfo, ExecutionTarget, ForegroundContext, LastScreenshotInfo, TerminalState } from '../types'
import type { CdpAvailabilityStatus } from './cdp-manager'

export type RuntimeFactKey
  = | 'executionTarget'
    | 'foregroundContext'
    | 'displayInfo'
    | 'terminalState'
    | 'browserSurfaceAvailability'
    | 'cdpAvailability'
    | 'lastScreenshot'

export type RuntimeFactSource
  = | 'executor_probe'
    | 'terminal_runner'
    | 'browser_dom_bridge'
    | 'cdp_bridge_manager'
    | 'session'
    | 'derived'

export type RuntimeFactConfidence = 'high' | 'medium' | 'low'

export type RuntimeFactInvalidationTag
  = | 'desktop_mutation'
    | 'app_lifecycle'
    | 'terminal_mutation'
    | 'browser_probe_change'
    | 'screenshot_refresh'
    | 'manual_refresh'

export interface RuntimeFactRecord<T = unknown> {
  value: T
  source: RuntimeFactSource
  probedAt: number // Using number for timestamp to avoid serialization issues
  confidence: RuntimeFactConfidence
  ttlMs: number
  invalidatedBy?: RuntimeFactInvalidationTag[] // Optional, declarative only
}

export interface RuntimeSnapshotFacts {
  executionTarget: RuntimeFactRecord<ExecutionTarget>
  foregroundContext: RuntimeFactRecord<ForegroundContext>
  displayInfo: RuntimeFactRecord<DisplayInfo>
  terminalState: RuntimeFactRecord<TerminalState>
  browserSurfaceAvailability: RuntimeFactRecord<BrowserSurfaceAvailability>
  cdpAvailability: RuntimeFactRecord<CdpAvailabilityStatus>
  lastScreenshot?: RuntimeFactRecord<LastScreenshotInfo>
}

export type RuntimeFactFreshness = 'fresh' | 'stale'

export function getRuntimeFactFreshness<T>(record: RuntimeFactRecord<T>, now = Date.now()): RuntimeFactFreshness {
  return (now - record.probedAt) <= record.ttlMs ? 'fresh' : 'stale'
}

export interface RuntimeFactUsabilityOptions {
  minConfidence?: RuntimeFactConfidence
  now?: number
}

const confidenceLevels: Record<RuntimeFactConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

export function isRuntimeFactUsable<T>(
  record: RuntimeFactRecord<T>,
  options?: RuntimeFactUsabilityOptions,
): boolean {
  const { minConfidence, now = Date.now() } = options || {}

  if (getRuntimeFactFreshness(record, now) !== 'fresh') {
    return false
  }

  if (minConfidence) {
    const requiredLevel = confidenceLevels[minConfidence]
    const actualLevel = confidenceLevels[record.confidence]
    if (actualLevel < requiredLevel) {
      return false
    }
  }

  return true
}

export interface RuntimeFactSummary {
  source: RuntimeFactSource
  probedAt: number
  confidence: RuntimeFactConfidence
  freshness: RuntimeFactFreshness
}

export function toRuntimeFactSummary<T>(record: RuntimeFactRecord<T>, now = Date.now()): RuntimeFactSummary {
  return {
    source: record.source,
    probedAt: record.probedAt,
    confidence: record.confidence,
    freshness: getRuntimeFactFreshness(record, now),
  }
}
