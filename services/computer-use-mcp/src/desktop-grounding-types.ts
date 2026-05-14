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
export type TargetSource = 'chrome_dom' | 'ax' | 'vision' | 'raw'

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
 * A single interactable UI element discovered by the grounding layer.
 *
 * Candidates come from different sources (Chrome DOM, macOS AX tree, vision)
 * and are merged into a unified list with deduplication.
 */
export interface DesktopTargetCandidate {
  /** Stable id within the snapshot (e.g. "t_0", "t_1") */
  id: string
  /** Which observation source produced this candidate */
  source: TargetSource
  /** Application name */
  appName: string
  /** Window identifier from the window observation */
  windowId?: string
  /** Semantic role (e.g. "AXButton", "button", "input") */
  role: string
  /** Human-readable label (title, text content, placeholder) */
  label: string
  /** Screen-absolute bounding rect in logical pixels */
  bounds: Bounds
  /** Confidence that this candidate is correctly identified (0-1) */
  confidence: number
  /** Whether the element appears interactable (clickable, focusable) */
  interactable: boolean

  // ---- Chrome DOM extras ----
  /** HTML tag name (e.g. "a", "button", "input") */
  tag?: string
  /** href for links */
  href?: string
  /** Input type (e.g. "text", "password", "email") */
  inputType?: string
  /** CSS selector for re-querying (best-effort) */
  selector?: string
  /** Frame ID within the Chrome page (0 = main frame) */
  frameId?: number
  /** Whether candidate is in page content area (true for all chrome_dom candidates) */
  isPageContent?: boolean

  // ---- AX extras ----
  /** AX tree UID for `findAXNodeByUid` lookup */
  axUid?: string
  /** Whether the element has keyboard focus */
  focused?: boolean
  /** Whether the element is enabled */
  enabled?: boolean
}

// ---------------------------------------------------------------------------
// Chrome semantic snapshot
// ---------------------------------------------------------------------------

/**
 * Semantic data from Chrome's active page, collected via
 * the Chrome extension bridge or CDP bridge.
 */
export interface ChromeSemanticSnapshot {
  /** Current page URL */
  pageUrl: string
  /** Current page title */
  pageTitle: string
  /** Interactive elements collected from the page DOM */
  interactiveElements: BrowserDomInteractiveElement[]
  /** ISO timestamp when the snapshot was captured */
  capturedAt: string
  /** Which bridge produced the data */
  source: 'extension' | 'cdp'
}

// ---------------------------------------------------------------------------
// Desktop grounding snapshot (the unified observation output)
// ---------------------------------------------------------------------------

/**
 * Staleness flags for each observation source.
 * `true` means the data is stale or unavailable.
 */
export interface GroundingStalenessFlags {
  /** Screenshot is stale or missing */
  screenshot: boolean
  /** AX tree is stale or unavailable */
  ax: boolean
  /** Chrome semantic data is stale or unavailable (always true for non-Chrome apps) */
  chromeSemantic: boolean
}

/**
 * Unified output of `desktop_observe`.
 *
 * Merges all desktop observation sources into a single structure
 * with ranked, deduplicated target candidates.
 */
export interface DesktopGroundingSnapshot {
  /** Unique identifier for this snapshot */
  snapshotId: string
  /** ISO timestamp when the snapshot was assembled */
  capturedAt: string
  /** Name of the foreground application */
  foregroundApp: string
  /** Current window list */
  windows: WindowInfo[]
  /** Latest screenshot artifact */
  screenshot: ScreenshotArtifact
  /** macOS AX tree snapshot (if captured successfully) */
  axSnapshot?: AXSnapshot
  /** Chrome semantic snapshot (best effort when browser surfaces are available) */
  chromeSemanticSnapshot?: ChromeSemanticSnapshot
  /** Merged, deduplicated, ranked target candidates */
  targetCandidates: DesktopTargetCandidate[]
  /** Which sources are stale or unavailable */
  staleFlags: GroundingStalenessFlags
}

// ---------------------------------------------------------------------------
// Snap resolution
// ---------------------------------------------------------------------------

/**
 * Result of resolving a raw coordinate to a snapped target candidate.
 *
 * Records the full snap decision for tracing and debugging.
 */
export interface SnapResolution {
  /** Original point requested by the agent */
  rawPoint: { x: number, y: number }
  /** Final point after snap resolution (center of matched candidate, or rawPoint fallback) */
  snappedPoint: { x: number, y: number }
  /** Matched candidate id (undefined if no match → raw fallback) */
  candidateId?: string
  /** Which source tier produced the match */
  source: TargetSource | 'none'
  /** Human-readable explanation of the snap decision */
  reason: string
}

// ---------------------------------------------------------------------------
// Pointer intent
// ---------------------------------------------------------------------------

/**
 * Describes the agent's intention to interact with a desktop target.
 *
 * Generated before each click for UI overlay visualization and trace logging.
 */
export interface PointerIntent {
  /** 'preview' = for overlay visualization only, 'execute' = real click pending */
  mode: 'preview' | 'execute'
  /** Target candidate id (if snapped to a candidate) */
  candidateId?: string
  /** Original raw coordinate */
  rawPoint: { x: number, y: number }
  /** Snapped coordinate (after resolution) */
  snappedPoint: { x: number, y: number }
  /** Source tier of the matched candidate */
  source: TargetSource | 'none'
  /** Confidence of the snap decision */
  confidence: number
  /** Pointer animation path for overlay visualization */
  path: PointerTracePoint[]

  // ---- Ghost pointer execution phases (v3) ----
  /** Execution lifecycle phase for ghost pointer animation. */
  phase?: 'preview' | 'executing' | 'completed'
  /** Outcome of the execution (set when phase = 'completed'). */
  executionResult?: 'success' | 'fallback' | 'error'
  /** Human-readable description of the execution route taken. */
  executionRoute?: string
}
