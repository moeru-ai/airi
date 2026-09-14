/**
 * Stable outward reroute contract.
 *
 * This is the authoritative shape that `workflow_*` tools emit inside
 * `structuredContent` when the workflow engine decides to reroute.
 *
 * Consumers (stage-ui, external integrations) MUST rely exclusively
 * on these types — they are considered a forward-compatible public API
 * surface. Field semantics are documented inline and must not change
 * meaning across versions.
 */

import type { RecommendedSurface } from './strategy'
import type { BrowserSurfaceKind, TerminalSurface } from './types'

// ---------------------------------------------------------------------------
// Reroute detail block
// ---------------------------------------------------------------------------

export interface WorkflowRerouteDetail {
  /** Target surface category for the reroute. */
  recommendedSurface: RecommendedSurface
  /** Most-recommended next tool to call. */
  suggestedTool: string
  /** Why the strategy layer decided to reroute (always present). */
  strategyReason: string
  /**
   * Only present when a prep tool or runtime probe ran and provided
   * information beyond the strategy heuristic. Pure-strategy reroutes
   * MUST NOT fabricate this field.
   */
  executionReason?: string
  /** Human-readable explanation for logging / UI display. */
  explanation: string
  /**
   * Available browser surface stacks at the moment of reroute.
   * Only populated for browser-family reroutes.
   */
  availableSurfaces?: BrowserSurfaceKind[]
  /**
   * The preferred browser surface stack chosen by the runtime
   * availability model. Only populated for browser-family reroutes.
   */
  preferredSurface?: BrowserSurfaceKind
  /**
   * Terminal surface that triggered the reroute (e.g. 'pty').
   * Only populated for terminal-family reroutes (exec → pty).
   */
  terminalSurface?: TerminalSurface
  /**
   * PTY session id to resume (if the reroute is to an existing PTY).
   * Only populated for pty reroutes with bound sessions.
   */
  ptySessionId?: string
}

// ---------------------------------------------------------------------------
// Top-level structuredContent shape for reroute responses
// ---------------------------------------------------------------------------

export interface WorkflowRerouteStructuredContent {
  kind: 'workflow_reroute'
  status: 'reroute_required'
  workflow: string
  reroute: WorkflowRerouteDetail
  task: unknown
  stepResults: unknown[]
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type { RecommendedSurface } from './strategy'
