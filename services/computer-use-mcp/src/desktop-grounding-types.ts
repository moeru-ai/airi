/**
 * Desktop Grounding types — unified observation + snap + intent layer
 * for macOS Chrome-first desktop automation.
 *
 * These types power the `desktop_observe` and `desktop_click_target` tools,
 * merging screenshot, AX tree, window observation, and Chrome semantic data
 * into a single grounding snapshot with ranked target candidates.
 */

import type { AXSnapshot } from './accessibility/types'
import type {
  Bounds,
  BrowserDomInteractiveElement,
  PointerTracePoint,
  ScreenshotArtifact,
  WindowInfo,
} from './types'

// Re-export input types from types.ts (canonical definitions live there to avoid circular deps)
export type { DesktopClickTargetInput, DesktopObserveInput } from './types'

// ---------------------------------------------------------------------------
// Target candidate source hierarchy (higher = preferred for snap)
// ---------------------------------------------------------------------------

/** Which observation source produced a target candidate. */
export type TargetSource = 'ax' | 'chrome_dom' | 'raw' | 'vision'

/**
 * Priority order for snap resolution.
 * Lower index = higher priority.
 */
export const TARGET_SOURCE_PRIORITY: readonly TargetSource[] = [
  'chrome_dom',
  'ax',
  'vision',
  'raw',
] as const

// ---------------------------------------------------------------------------
// Target candidate
// ---------------------------------------------------------------------------

/**
 * Semantic data from Chrome's active page, collected via
 * the Chrome extension bridge or CDP bridge.
 */
export interface ChromeSemanticSnapshot {
  /** ISO timestamp when the snapshot was captured */
  capturedAt: string
  /** Interactive elements collected from the page DOM */
  interactiveElements: BrowserDomInteractiveElement[]
  /** Current page title */
  pageTitle: string
  /** Current page URL */
  pageUrl: string
  /** Which bridge produced the data */
  source: 'cdp' | 'extension'
}

// ---------------------------------------------------------------------------
// Chrome semantic snapshot
// ---------------------------------------------------------------------------

/**
 * Unified output of `desktop_observe`.
 *
 * Merges all desktop observation sources into a single structure
 * with ranked, deduplicated target candidates.
 */
export interface DesktopGroundingSnapshot {
  /** macOS AX tree snapshot (if captured successfully) */
  axSnapshot?: AXSnapshot
  /** ISO timestamp when the snapshot was assembled */
  capturedAt: string
  /** Chrome semantic snapshot (best effort when browser surfaces are available) */
  chromeSemanticSnapshot?: ChromeSemanticSnapshot
  /** Name of the foreground application */
  foregroundApp: string
  /** Latest screenshot artifact */
  screenshot: ScreenshotArtifact
  /** Unique identifier for this snapshot */
  snapshotId: string
  /** Which sources are stale or unavailable */
  staleFlags: GroundingStalenessFlags
  /** Merged, deduplicated, ranked target candidates */
  targetCandidates: DesktopTargetCandidate[]
  /** Current window list */
  windows: WindowInfo[]
}

// ---------------------------------------------------------------------------
// Desktop grounding snapshot (the unified observation output)
// ---------------------------------------------------------------------------

/**
 * A single interactable UI element discovered by the grounding layer.
 *
 * Candidates come from different sources (Chrome DOM, macOS AX tree, vision)
 * and are merged into a unified list with deduplication.
 */
export interface DesktopTargetCandidate {
  /** Application name */
  appName: string
  // ---- AX extras ----
  /** AX tree UID for `findAXNodeByUid` lookup */
  axUid?: string
  /** Screen-absolute bounding rect in logical pixels */
  bounds: Bounds
  /** Confidence that this candidate is correctly identified (0-1) */
  confidence: number
  /** Whether the element is enabled */
  enabled?: boolean
  /** Whether the element has keyboard focus */
  focused?: boolean
  /** Frame ID within the Chrome page (0 = main frame) */
  frameId?: number
  /** href for links */
  href?: string
  /** Stable id within the snapshot (e.g. "t_0", "t_1") */
  id: string

  /** Input type (e.g. "text", "password", "email") */
  inputType?: string
  /** Whether the element appears interactable (clickable, focusable) */
  interactable: boolean
  /** Whether candidate is in page content area (true for all chrome_dom candidates) */
  isPageContent?: boolean
  /** Human-readable label (title, text content, placeholder) */
  label: string
  /** Semantic role (e.g. "AXButton", "button", "input") */
  role: string
  /** CSS selector for re-querying (best-effort) */
  selector?: string

  /** Which observation source produced this candidate */
  source: TargetSource
  // ---- Chrome DOM extras ----
  /** HTML tag name (e.g. "a", "button", "input") */
  tag?: string
  /** Window identifier from the window observation */
  windowId?: string
}

/**
 * Staleness flags for each observation source.
 * `true` means the data is stale or unavailable.
 */
export interface GroundingStalenessFlags {
  /** AX tree is stale or unavailable */
  ax: boolean
  /** Chrome semantic data is stale or unavailable (always true for non-Chrome apps) */
  chromeSemantic: boolean
  /** Screenshot is stale or missing */
  screenshot: boolean
}

// ---------------------------------------------------------------------------
// Snap resolution
// ---------------------------------------------------------------------------

/**
 * Describes the agent's intention to interact with a desktop target.
 *
 * Generated before each click for UI overlay visualization and trace logging.
 */
export interface PointerIntent {
  /** Target candidate id (if snapped to a candidate) */
  candidateId?: string
  /** Confidence of the snap decision */
  confidence: number
  /** Outcome of the execution (set when phase = 'completed'). */
  executionResult?: 'error' | 'fallback' | 'success'
  /** Human-readable description of the execution route taken. */
  executionRoute?: string
  /** 'preview' = for overlay visualization only, 'execute' = real click pending */
  mode: 'execute' | 'preview'
  /** Pointer animation path for overlay visualization */
  path: PointerTracePoint[]
  // ---- Ghost pointer execution phases (v3) ----
  /** Execution lifecycle phase for ghost pointer animation. */
  phase?: 'completed' | 'executing' | 'preview'

  /** Original raw coordinate */
  rawPoint: { x: number, y: number }
  /** Snapped coordinate (after resolution) */
  snappedPoint: { x: number, y: number }
  /** Source tier of the matched candidate */
  source: 'none' | TargetSource
}

// ---------------------------------------------------------------------------
// Pointer intent
// ---------------------------------------------------------------------------

/**
 * Result of resolving a raw coordinate to a snapped target candidate.
 *
 * Records the full snap decision for tracing and debugging.
 */
export interface SnapResolution {
  /** Matched candidate id (undefined if no match → raw fallback) */
  candidateId?: string
  /** Original point requested by the agent */
  rawPoint: { x: number, y: number }
  /** Human-readable explanation of the snap decision */
  reason: string
  /** Final point after snap resolution (center of matched candidate, or rawPoint fallback) */
  snappedPoint: { x: number, y: number }
  /** Which source tier produced the match */
  source: 'none' | TargetSource
}
