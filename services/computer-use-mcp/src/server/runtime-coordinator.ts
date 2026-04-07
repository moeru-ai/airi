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
import type { RuntimeFactInvalidationTag, RuntimeSnapshotFacts } from './runtime-facts'

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
    | 'verification_check'
    | 'repair_check'
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

  // Facts metadata
  facts: RuntimeSnapshotFacts

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
    | { type: 'facts_invalidated', tags: readonly RuntimeFactInvalidationTag[], keys: string[] }

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
   * If there are pending invalidation tags, only the affected facts will be
   * force-reprobe'd; the rest will reuse the previous snapshot values.
   */
  refreshSnapshot: (reason: RuntimeRefreshReason) => Promise<RuntimeSnapshot>

  /**
   * Get the last captured snapshot without refreshing.
   * Returns undefined if no snapshot has been captured yet.
   */
  getLastSnapshot: () => RuntimeSnapshot | undefined

  /**
   * Record a runtime trace event to the session trace.
   */
  recordTrace: (event: RuntimeTraceEvent) => Promise<void>

  /**
   * Get a summary of available surfaces based on the last snapshot.
   */
  getSurfaceSummary: () => RuntimeSurfaceSummary

  /**
   * Enqueue invalidation tags to be applied on the next `refreshSnapshot` call.
   * Tags are accumulated (union) until the next refresh drains the queue.
   * This is a fire-and-forget declaration — no immediate probing happens.
   */
  enqueueInvalidation: (tags: readonly RuntimeFactInvalidationTag[]) => void

  /**
   * Return the current set of pending invalidation tags without draining.
   * Useful for inspection and testing.
   */
  getPendingInvalidationTags: () => ReadonlySet<RuntimeFactInvalidationTag>
}

interface ProbedValue<T> {
  value: T
  probedAt: number
}

async function probeAsync<T>(probe: () => Promise<T>): Promise<ProbedValue<T>> {
  const value = await probe()
  return {
    value,
    probedAt: Date.now(),
  }
}

function probeSync<T>(probe: () => T): ProbedValue<T> {
  const value = probe()
  return {
    value,
    probedAt: Date.now(),
  }
}

function latestProbedAt(...probedAtValues: number[]) {
  return Math.max(...probedAtValues)
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a runtime coordinator for the given server runtime.
 */
// ---------------------------------------------------------------------------
// Fact → InvalidationTag mapping
// Each entry lists the tags that, when pending, require that fact to be re-probed.
// ---------------------------------------------------------------------------

const factInvalidationMap: Record<keyof RuntimeSnapshotFacts, readonly RuntimeFactInvalidationTag[]> = {
  executionTarget: ['desktop_mutation', 'app_lifecycle'],
  foregroundContext: ['desktop_mutation', 'app_lifecycle'],
  displayInfo: [],
  terminalState: ['terminal_mutation'],
  browserSurfaceAvailability: ['browser_probe_change', 'desktop_mutation', 'app_lifecycle'],
  cdpAvailability: ['browser_probe_change'],
  lastScreenshot: ['screenshot_refresh'],
}

export function createRuntimeCoordinator(runtime: RuntimeCoordinatorHost): RuntimeCoordinator {
  let lastSnapshot: RuntimeSnapshot | undefined
  // Invalidation queue — accumulated between refreshes, drained on each refresh.
  const pendingInvalidationTags = new Set<RuntimeFactInvalidationTag>()

  return {
    enqueueInvalidation(tags: readonly RuntimeFactInvalidationTag[]): void {
      for (const tag of tags) {
        pendingInvalidationTags.add(tag)
      }
    },

    getPendingInvalidationTags(): ReadonlySet<RuntimeFactInvalidationTag> {
      return pendingInvalidationTags
    },

    async refreshSnapshot(reason: RuntimeRefreshReason): Promise<RuntimeSnapshot> {
      const previousSurfaceSummary = lastSnapshot ? buildSurfaceSummaryFromSnapshot(lastSnapshot) : undefined

      // Drain the invalidation queue before probing.
      // Any fact whose factInvalidationMap entry intersects the pending tags must be re-probed.
      const pendingTags = new Set(pendingInvalidationTags)
      pendingInvalidationTags.clear()

      /**
       * Returns true when a fact must be re-probed because of pending invalidation tags.
       * Always returns true when there is no cached snapshot (first refresh).
       */
      function shouldReprobe(factKey: keyof RuntimeSnapshotFacts): boolean {
        if (!lastSnapshot) {
          return true
        }
        if (pendingTags.size === 0) {
          return true // no selectively cached path yet — always reprobe on first call
        }
        const factTags = factInvalidationMap[factKey]
        return factTags.some(t => pendingTags.has(t))
      }

      // NOTICE: Probe all subsystems in parallel to minimize latency.
      // This matches the existing refresh-run-state.ts pattern but consolidates ownership.
      // When pending invalidation tags are present, only affected facts are re-probed;
      // the rest reuse the previous snapshot's probed values to avoid unnecessary OS calls.
      const prev = lastSnapshot

      const [executionTargetProbe, foregroundContextProbe, displayInfoProbe, cdpAvailabilityProbe] = await Promise.all([
        shouldReprobe('executionTarget')
          ? probeAsync(() => runtime.executor.getExecutionTarget())
          : Promise.resolve({ value: prev!.executionTarget, probedAt: prev!.facts.executionTarget.probedAt }),
        shouldReprobe('foregroundContext')
          ? probeAsync(() => runtime.executor.getForegroundContext())
          : Promise.resolve({ value: prev!.foregroundContext, probedAt: prev!.facts.foregroundContext.probedAt }),
        shouldReprobe('displayInfo')
          ? probeAsync(() => runtime.executor.getDisplayInfo())
          : Promise.resolve({ value: prev!.displayInfo, probedAt: prev!.facts.displayInfo.probedAt }),
        shouldReprobe('cdpAvailability')
          ? probeAsync(() => runtime.cdpBridgeManager.probeAvailability())
          : Promise.resolve({ value: prev!.cdpAvailability, probedAt: prev!.facts.cdpAvailability.probedAt }),
      ])

      const terminalStateProbe = shouldReprobe('terminalState')
        ? probeSync(() => runtime.terminalRunner.getState())
        : { value: prev!.terminalState, probedAt: prev!.facts.terminalState.probedAt }

      const browserStatusProbe = shouldReprobe('browserSurfaceAvailability')
        ? probeSync(() => runtime.browserDomBridge.getStatus())
        : { value: runtime.browserDomBridge.getStatus(), probedAt: prev!.facts.browserSurfaceAvailability.probedAt }

      const executionTarget = executionTargetProbe.value
      const foregroundContext = foregroundContextProbe.value
      const displayInfo = displayInfoProbe.value
      const cdpAvailability = cdpAvailabilityProbe.value
      const terminalState = terminalStateProbe.value

      // Record invalidation trace event if there were pending tags
      if (pendingTags.size > 0) {
        const invalidatedKeys = (Object.keys(factInvalidationMap) as Array<keyof RuntimeSnapshotFacts>)
          .filter(key => factInvalidationMap[key].some(t => pendingTags.has(t)))
        await recordTraceInternal(runtime, {
          type: 'facts_invalidated',
          tags: Array.from(pendingTags),
          keys: invalidatedKeys,
        })
      }

      // Update stateManager (still needed for other subsystems that read from it)
      runtime.stateManager.updateForegroundContext(foregroundContext)
      runtime.stateManager.updateExecutionTarget(executionTarget)
      runtime.stateManager.updateDisplayInfo(displayInfo)
      runtime.stateManager.updateTerminalState(terminalState)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)

      // Build browser surface availability
      const browserSurfaceAvailability = buildBrowserSurfaceAvailability({
        executionTarget,
        extension: browserStatusProbe.value,
        cdp: cdpAvailability,
      })
      runtime.stateManager.updateBrowserSurfaceAvailability(browserSurfaceAvailability)
      runtime.stateManager.refreshCodingRoundContext()

      // Get last screenshot if available
      const lastScreenshotProbe = probeSync(() => runtime.session.getLastScreenshot())
      const lastScreenshot = lastScreenshotProbe.value
      if (lastScreenshot) {
        runtime.stateManager.updateLastScreenshot(lastScreenshot)
      }

      // Build facts
      const facts: RuntimeSnapshotFacts = {
        executionTarget: {
          value: executionTarget,
          source: 'executor_probe',
          probedAt: executionTargetProbe.probedAt,
          confidence: 'high',
          ttlMs: 5000,
        },
        foregroundContext: {
          value: foregroundContext,
          source: 'executor_probe',
          probedAt: foregroundContextProbe.probedAt,
          confidence: 'medium',
          ttlMs: 3000,
        },
        displayInfo: {
          value: displayInfo,
          source: 'executor_probe',
          probedAt: displayInfoProbe.probedAt,
          confidence: 'high',
          ttlMs: 60000,
        },
        terminalState: {
          value: terminalState,
          source: 'terminal_runner',
          probedAt: terminalStateProbe.probedAt,
          confidence: 'high',
          ttlMs: 3000,
        },
        cdpAvailability: {
          value: cdpAvailability,
          source: 'cdp_bridge_manager',
          probedAt: cdpAvailabilityProbe.probedAt,
          confidence: 'high',
          ttlMs: 5000,
        },
        browserSurfaceAvailability: {
          value: browserSurfaceAvailability,
          source: 'derived',
          probedAt: latestProbedAt(
            executionTargetProbe.probedAt,
            browserStatusProbe.probedAt,
            cdpAvailabilityProbe.probedAt,
          ),
          confidence: 'medium',
          ttlMs: 5000,
        },
      }

      if (lastScreenshot) {
        facts.lastScreenshot = {
          value: lastScreenshot,
          source: 'session',
          probedAt: lastScreenshot.capturedAt ? new Date(lastScreenshot.capturedAt).valueOf() : lastScreenshotProbe.probedAt,
          confidence: 'high',
          ttlMs: 10000,
        }
      }

      const capturedAtMs = Date.now()
      const capturedAt = new Date(capturedAtMs).toISOString()

      // Get session budget
      const sessionBudget = runtime.session.getBudgetState()

      // Build snapshot
      const snapshot: RuntimeSnapshot = {
        capturedAt,
        reason,
        executionTarget,
        foregroundContext,
        displayInfo,
        terminalState,
        browserSurfaceAvailability,
        cdpAvailability,
        lastScreenshot,
        facts,
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
