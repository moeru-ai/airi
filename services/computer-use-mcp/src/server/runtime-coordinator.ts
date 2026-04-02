/**
 * Runtime Coordinator
 *
 * Unified layer for sampling, aggregating, caching, and tracing runtime context.
 * Inspired by Claude Code's "unified runtime shell" pattern — borrowed structure, not code.
 *
 * This coordinator:
 * - Owns the "runtime snapshot" concept
 * - Unifies all refresh/probe/aggregate logic
 * - Provides stable snapshot interface for downstream consumers
 * - Records lightweight runtime trace events for transparency
 * - Does NOT execute actions, plan workflows, or enforce policy
 *
 * See: claude-code-adoption-notes.md § "Runtime Snapshot Coordinator"
 */

import type {
  BrowserSurfaceAvailability,
  DisplayInfo,
  ExecutionTarget,
  ForegroundContext,
  LastScreenshotInfo,
  TerminalState,
} from '../types'
import type { CdpAvailabilityStatus } from './cdp-manager'
import type { ComputerUseServerRuntime } from './runtime'

import { buildBrowserSurfaceAvailability } from './browser-surface'

// ---------------------------------------------------------------------------
// Runtime Snapshot Types
// ---------------------------------------------------------------------------

/**
 * Why a snapshot refresh was triggered.
 * Used for tracing and diagnostic purposes.
 */
export type RuntimeRefreshReason
  = | 'tool_entry'
    | 'workflow_start'
    | 'workflow_reroute'
    | 'policy_check'
    | 'post_action'
    | 'manual'
    | 'initialization'

/**
 * Consolidated runtime context snapshot.
 * Represents the state of the execution environment at a specific point in time.
 */
export interface RuntimeSnapshot {
  /** When this snapshot was captured. */
  capturedAt: string
  /** Why this snapshot was refreshed. */
  reason: RuntimeRefreshReason

  // Core runtime context
  executionTarget: ExecutionTarget
  foregroundContext: ForegroundContext
  displayInfo: DisplayInfo
  terminalState: TerminalState

  // Browser/CDP surface availability
  browserSurfaceAvailability: BrowserSurfaceAvailability
  cdpAvailability: CdpAvailabilityStatus

  // Last screenshot info
  lastScreenshot?: LastScreenshotInfo

  // Session budget
  sessionBudget: {
    operationsExecuted: number
    operationUnitsConsumed: number
  }

  // Pending actions count
  pendingApprovalCount: number
}

/**
 * Aggregated summary of available surfaces.
 * Used for tool selection and capability reporting.
 */
export interface RuntimeSurfaceSummary {
  executionMode: string
  browserAvailable: boolean
  browserPreferredSurface?: 'browser_dom' | 'browser_cdp'
  cdpConnected: boolean
  cdpConnectable: boolean
  terminalAvailable: boolean
  foregroundContextAvailable: boolean
}

// ---------------------------------------------------------------------------
// Runtime Trace Events
// ---------------------------------------------------------------------------

/**
 * Lightweight runtime trace events for transparency and debugging.
 * These are NOT full event sourcing — just explainability breadcrumbs.
 */
export type RuntimeTraceEvent
  = | { type: 'snapshot_refreshed', reason: RuntimeRefreshReason, capturedAt: string }
    | { type: 'surface_summary_updated', summary: RuntimeSurfaceSummary }
    | { type: 'cdp_probe_failed', endpoint: string, error: string }
    | { type: 'browser_surface_unavailable', reason: string, extensionError?: string, cdpError?: string }

export type RuntimeCoordinatorHost = Pick<
  ComputerUseServerRuntime,
  'session' | 'executor' | 'terminalRunner' | 'browserDomBridge' | 'cdpBridgeManager' | 'stateManager'
>

// ---------------------------------------------------------------------------
// Runtime Coordinator Interface
// ---------------------------------------------------------------------------

export interface RuntimeCoordinator {
  /**
   * Refresh the runtime snapshot by probing all subsystems.
   * Updates cached snapshot and records trace event.
   */
  refreshSnapshot(reason: RuntimeRefreshReason): Promise<RuntimeSnapshot>

  /**
   * Get the last captured snapshot without refreshing.
   * Returns undefined if no snapshot has been captured yet.
   */
  getLastSnapshot(): RuntimeSnapshot | undefined

  /**
   * Record a runtime trace event to the session trace.
   */
  recordTrace(event: RuntimeTraceEvent): Promise<void>

  /**
   * Get a summary of available surfaces based on the last snapshot.
   */
  getSurfaceSummary(): RuntimeSurfaceSummary
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a runtime coordinator for the given server runtime.
 */
export function createRuntimeCoordinator(runtime: RuntimeCoordinatorHost): RuntimeCoordinator {
  let lastSnapshot: RuntimeSnapshot | undefined

  return {
    async refreshSnapshot(reason: RuntimeRefreshReason): Promise<RuntimeSnapshot> {
      const capturedAt = new Date().toISOString()
      const previousSurfaceSummary = lastSnapshot ? buildSurfaceSummaryFromSnapshot(lastSnapshot) : undefined

      // NOTICE: Probe all subsystems in parallel to minimize latency.
      // This matches the existing refresh-run-state.ts pattern but consolidates ownership.
      const [executionTarget, foregroundContext, displayInfo, cdpAvailability] = await Promise.all([
        runtime.executor.getExecutionTarget(),
        runtime.executor.getForegroundContext(),
        runtime.executor.getDisplayInfo(),
        runtime.cdpBridgeManager.probeAvailability(),
      ])

      // Update stateManager (still needed for other subsystems that read from it)
      runtime.stateManager.updateForegroundContext(foregroundContext)
      runtime.stateManager.updateExecutionTarget(executionTarget)
      runtime.stateManager.updateDisplayInfo(displayInfo)
      runtime.stateManager.updateTerminalState(runtime.terminalRunner.getState())
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

      // Build browser surface availability
      const browserSurfaceAvailability = buildBrowserSurfaceAvailability({
        executionTarget,
        extension: runtime.browserDomBridge.getStatus(),
        cdp: cdpAvailability,
      })
      runtime.stateManager.updateBrowserSurfaceAvailability(browserSurfaceAvailability)
      runtime.stateManager.refreshCodingRoundContext()

      // Get last screenshot if available
      const lastScreenshot = runtime.session.getLastScreenshot()
      if (lastScreenshot) {
        runtime.stateManager.updateLastScreenshot(lastScreenshot)
      }

      // Get session budget
      const sessionBudget = runtime.session.getBudgetState()

      // Build snapshot
      const snapshot: RuntimeSnapshot = {
        capturedAt,
        reason,
        executionTarget,
        foregroundContext,
        displayInfo,
        terminalState: runtime.terminalRunner.getState(),
        browserSurfaceAvailability,
        cdpAvailability,
        lastScreenshot,
        sessionBudget,
        pendingApprovalCount: runtime.session.listPendingActions().length,
      }

      // Cache snapshot
      lastSnapshot = snapshot
      const surfaceSummary = buildSurfaceSummaryFromSnapshot(snapshot)

      // Record trace event
      await recordTraceInternal(runtime, {
        type: 'snapshot_refreshed',
        reason,
        capturedAt,
      })

      if (!previousSurfaceSummary || !surfaceSummariesEqual(previousSurfaceSummary, surfaceSummary)) {
        await recordTraceInternal(runtime, {
          type: 'surface_summary_updated',
          summary: surfaceSummary,
        })
      }

      // Record CDP probe failure if applicable
      if (!cdpAvailability.connected && !cdpAvailability.connectable && cdpAvailability.lastError) {
        await recordTraceInternal(runtime, {
          type: 'cdp_probe_failed',
          endpoint: cdpAvailability.endpoint,
          error: cdpAvailability.lastError,
        })
      }

      // Record browser surface unavailability if applicable
      if (!browserSurfaceAvailability.suitable || browserSurfaceAvailability.availableSurfaces.length === 0) {
        await recordTraceInternal(runtime, {
          type: 'browser_surface_unavailable',
          reason: browserSurfaceAvailability.reason,
          extensionError: browserSurfaceAvailability.extension.lastError,
          cdpError: browserSurfaceAvailability.cdp.lastError,
        })
      }

      return snapshot
    },

    getLastSnapshot(): RuntimeSnapshot | undefined {
      return lastSnapshot
    },

    async recordTrace(event: RuntimeTraceEvent): Promise<void> {
      await recordTraceInternal(runtime, event)
    },

    getSurfaceSummary(): RuntimeSurfaceSummary {
      if (!lastSnapshot) {
        // Return a pessimistic summary if no snapshot exists yet
        return {
          executionMode: 'dry-run',
          browserAvailable: false,
          cdpConnected: false,
          cdpConnectable: false,
          terminalAvailable: false,
          foregroundContextAvailable: false,
        }
      }

      return buildSurfaceSummaryFromSnapshot(lastSnapshot)
    },
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Record a runtime trace event to the session trace.
 * Prefixes event type to distinguish from action/policy traces.
 */
function buildSurfaceSummaryFromSnapshot(snapshot: RuntimeSnapshot): RuntimeSurfaceSummary {
  const { executionTarget, foregroundContext, browserSurfaceAvailability, cdpAvailability } = snapshot

  return {
    executionMode: executionTarget.mode,
    browserAvailable: browserSurfaceAvailability.availableSurfaces.length > 0,
    browserPreferredSurface: browserSurfaceAvailability.preferredSurface,
    cdpConnected: cdpAvailability.connected,
    cdpConnectable: cdpAvailability.connectable,
    terminalAvailable: true,
    foregroundContextAvailable: foregroundContext.available,
  }
}

function surfaceSummariesEqual(left: RuntimeSurfaceSummary, right: RuntimeSurfaceSummary) {
  return left.executionMode === right.executionMode
    && left.browserAvailable === right.browserAvailable
    && left.browserPreferredSurface === right.browserPreferredSurface
    && left.cdpConnected === right.cdpConnected
    && left.cdpConnectable === right.cdpConnectable
    && left.terminalAvailable === right.terminalAvailable
    && left.foregroundContextAvailable === right.foregroundContextAvailable
}

async function recordTraceInternal(runtime: RuntimeCoordinatorHost, event: RuntimeTraceEvent): Promise<void> {
  const entry = {
    event: `runtime:${event.type}`,
    metadata: event,
  }

  await runtime.session.record(entry)
}
