/**
 * Desktop grounding layer — unified observation aggregation.
 *
 * This is the main entry point for the `desktop_observe` tool.
 * It captures screenshot, window observation, AX tree, and Chrome semantics
 * in parallel when available, then merges everything into a single
 * `DesktopGroundingSnapshot` with deduplicated, ranked target candidates.
 */

import type { AXNode, AXSnapshot } from './accessibility/types'
import type { CdpBridge } from './browser-dom/cdp-bridge'
import type { BrowserDomExtensionBridge } from './browser-dom/extension-bridge'
import type {
  ChromeSemanticSnapshot,
  DesktopGroundingSnapshot,
  DesktopObserveInput,
  DesktopTargetCandidate,
  GroundingStalenessFlags,
} from './desktop-grounding-types'
import type {
  Bounds,
  ComputerUseConfig,
  DesktopExecutor,
  ScreenshotArtifact,
  WindowObservation,
} from './types'

import { captureAXTree } from './accessibility'
import { captureChromeSemantics, chromeElementsToTargetCandidates } from './chrome-semantic-adapter'
import { boundsIoU } from './snap-resolver'

/**
 * Maximum age (ms) of a sub-snapshot before it is considered stale.
 * If the screenshot/AX/Chrome data is older than this relative to the
 * assembly timestamp, the corresponding stale flag is set.
 */
const STALENESS_THRESHOLD_MS = 2000

let nextSnapshotId = 1

/**
 * Capture a unified desktop grounding snapshot.
 *
 * Runs screenshot, window observation, and AX tree capture in parallel.
 * If Chrome browser surfaces are available (and `includeChrome` is not false),
 * also captures Chrome semantic data.
 *
 * @param params - Capture parameters (config, executor, input, bridges)
 * @returns Unified desktop grounding snapshot
 */
export async function captureDesktopGrounding(params: {
  config: ComputerUseConfig
  executor: DesktopExecutor
  input?: DesktopObserveInput
  extensionBridge?: BrowserDomExtensionBridge
  cdpBridge?: CdpBridge
}): Promise<DesktopGroundingSnapshot> {
  const { config, executor, input, extensionBridge, cdpBridge } = params
  const assemblyStart = Date.now()

  // Phase 1: Parallel capture of all observation sources
  const [screenshotResult, windowsResult, axResult] = await Promise.allSettled([
    executor.takeScreenshot({ label: 'desktop_observe' }),
    executor.observeWindows({ limit: 12 }),
    captureAXTree(config),
  ])

  const screenshot = screenshotResult.status === 'fulfilled' ? screenshotResult.value : createPlaceholderScreenshot()
  const windowObs = windowsResult.status === 'fulfilled' ? windowsResult.value : createEmptyWindowObservation()
  const axSnapshot = axResult.status === 'fulfilled' ? axResult.value : undefined

  // Determine foreground app
  const foregroundApp = windowObs.frontmostAppName || axSnapshot?.appName || 'unknown'
  const shouldCaptureChrome = input?.includeChrome !== false

  // Ask the executor for a Chrome-filtered window list when Chrome semantics
  // are requested. The generic top-N window snapshot is often dominated by
  // system UI and can miss Chrome entirely, which would prevent chrome_dom
  // candidates from being mapped to screen coordinates.
  let chromeWindowBounds = findChromeWindowBounds(windowObs)
  let chromeWindowObservation: WindowObservation | undefined
  if (shouldCaptureChrome && !chromeWindowBounds) {
    try {
      chromeWindowObservation = await executor.observeWindows({
        app: 'Google Chrome',
        limit: 12,
      })
      chromeWindowBounds = findChromeWindowBounds(chromeWindowObservation)
    }
    catch {
      // Best-effort only. Fall back to AX-only candidates if filtered window
      // enumeration fails.
    }
  }

  // If Chrome is foreground, ask the executor for a Chrome-filtered window list.
  // The generic top-N window snapshot is often dominated by system UI and can
  // miss Chrome entirely, which would prevent chrome_dom candidates from being
  // mapped to screen coordinates.
  let chromeWindowBounds = findChromeWindowBounds(windowObs, foregroundApp)
  if (isChromeInFront && !chromeWindowBounds) {
    try {
      const chromeWindows = await executor.observeWindows({
        app: foregroundApp,
        limit: 12,
      })
      chromeWindowBounds = findChromeWindowBounds(chromeWindows, foregroundApp)
    }
    catch {
      // Best-effort only. Fall back to AX-only candidates if filtered window
      // enumeration fails.
    }
  }

  // Phase 2: Chrome semantic data (only if Chrome is foreground and allowed)
  let chromeSemanticSnapshot: ChromeSemanticSnapshot | null = null
  if (shouldCaptureChrome) {
    chromeSemanticSnapshot = await captureChromeSemantics(extensionBridge, cdpBridge)
    if (!chromeWindowBounds && chromeSemanticSnapshot?.pageTitle) {
      chromeWindowBounds = findChromeWindowBounds(
        chromeWindowObservation ?? windowObs,
        chromeSemanticSnapshot.pageTitle,
      )
    }
  }

  // Phase 3: Build target candidates
  const candidates = buildTargetCandidates({
    axSnapshot,
    chromeSnapshot: chromeSemanticSnapshot ?? undefined,
    chromeWindowBounds,
    foregroundApp,
  })

  // Phase 4: Compute staleness
  const now = Date.now()
  const staleFlags = computeStaleness({
    screenshot,
    axSnapshot,
    chromeSemanticSnapshot: chromeSemanticSnapshot ?? undefined,
    chromeSemanticEnabled: shouldCaptureChrome,
    assemblyTimestamp: now,
  })

  const snapshotId = `dg_${nextSnapshotId++}`

  return {
    snapshotId,
    capturedAt: new Date(assemblyStart).toISOString(),
    foregroundApp,
    windows: windowObs.windows,
    screenshot,
    axSnapshot,
    chromeSemanticSnapshot: chromeSemanticSnapshot ?? undefined,
    targetCandidates: candidates,
    staleFlags,
  }
}

/**
 * Build a merged, deduplicated list of target candidates from all sources.
 *
 * Deduplication: if a `chrome_dom` candidate's bounds overlap >70% (IoU)
 * with an `ax` candidate, the `ax` duplicate is removed (chrome_dom is richer).
 *
 * @returns Sorted array of candidates (chrome_dom first, then ax, then vision)
 */
export function buildTargetCandidates(params: {
  axSnapshot?: AXSnapshot
  chromeSnapshot?: ChromeSemanticSnapshot
  chromeWindowBounds?: Bounds
  foregroundApp: string
}): DesktopTargetCandidate[] {
  const { axSnapshot, chromeSnapshot, chromeWindowBounds, foregroundApp } = params

  // 1. Build Chrome DOM candidates
  let chromeCandidates: DesktopTargetCandidate[] = []
  if (chromeSnapshot && chromeWindowBounds) {
    chromeCandidates = chromeElementsToTargetCandidates(
      chromeSnapshot.interactiveElements,
      chromeWindowBounds,
    )
  }

  // 2. Build AX candidates
  let axCandidates: DesktopTargetCandidate[] = []
  if (axSnapshot) {
    axCandidates = axNodesToTargetCandidates(axSnapshot, foregroundApp)
  }

  // 3. Deduplicate: remove AX candidates with >70% IoU overlap with Chrome candidates
  const DEDUP_IOU_THRESHOLD = 0.7
  if (chromeCandidates.length > 0 && axCandidates.length > 0) {
    axCandidates = axCandidates.filter((axCandidate) => {
      // Keep the AX candidate only if no Chrome candidate overlaps significantly
      return !chromeCandidates.some(cc =>
        boundsIoU(cc.bounds, axCandidate.bounds) >= DEDUP_IOU_THRESHOLD,
      )
    })
  }

  // 4. Merge and assign ids
  const merged = [...chromeCandidates, ...axCandidates]

  // Sort: chrome_dom first, then ax, then by confidence desc
  merged.sort((a, b) => {
    if (a.source !== b.source) {
      const sourceOrder: Record<string, number> = { chrome_dom: 0, ax: 1, vision: 2, raw: 3 }
      return (sourceOrder[a.source] ?? 3) - (sourceOrder[b.source] ?? 3)
    }
    return b.confidence - a.confidence
  })

  // Assign stable ids
  for (let i = 0; i < merged.length; i++) {
    merged[i].id = `t_${i}`
  }

  // Limit to top 50 candidates
  return merged.slice(0, 50)
}

/**
 * Format a grounding snapshot as a text representation for the agent.
 *
 * Produces a compact, LLM-friendly output with:
 * - Foreground app header
 * - Target candidate table
 * - Staleness warnings
 */
export function formatGroundingForAgent(
  snapshot: DesktopGroundingSnapshot,
): string {
  const lines: string[] = []

  // Header
  lines.push(`[Desktop Observe] ${snapshot.foregroundApp}`)
  lines.push(`  Snapshot: ${snapshot.snapshotId} at ${snapshot.capturedAt}`)

  // Staleness warnings
  const staleWarnings: string[] = []
  if (snapshot.staleFlags.screenshot)
    staleWarnings.push('screenshot')
  if (snapshot.staleFlags.ax)
    staleWarnings.push('AX tree')
  if (snapshot.staleFlags.chromeSemantic)
    staleWarnings.push('Chrome semantic')
  if (staleWarnings.length > 0) {
    lines.push(`  ⚠ Stale: ${staleWarnings.join(', ')}`)
  }

  // Chrome info
  if (snapshot.chromeSemanticSnapshot) {
    lines.push(`  Chrome page: ${snapshot.chromeSemanticSnapshot.pageTitle} (${snapshot.chromeSemanticSnapshot.pageUrl})`)
  }

  // Windows summary
  lines.push(`  Windows: ${snapshot.windows.length}`)

  // Target candidates
  if (snapshot.targetCandidates.length === 0) {
    lines.push('  No interactable targets found.')
  }
  else {
    lines.push(`  Targets (${snapshot.targetCandidates.length}):`)
    for (const c of snapshot.targetCandidates.slice(0, 40)) {
      const b = c.bounds
      const focused = c.focused ? ' [focused]' : ''
      const disabled = c.enabled === false ? ' [disabled]' : ''
      lines.push(`    [${c.id}] ${c.source} ${c.role} "${c.label}"${focused}${disabled} @(${b.x},${b.y} ${b.width}x${b.height}) conf=${c.confidence.toFixed(2)}`)
    }
    if (snapshot.targetCandidates.length > 40) {
      lines.push(`    ... and ${snapshot.targetCandidates.length - 40} more`)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// AX tree → target candidates
// ---------------------------------------------------------------------------

/** AX roles that are typically interactable */
const INTERACTABLE_AX_ROLES = new Set([
  'AXButton',
  'AXLink',
  'AXTextField',
  'AXTextArea',
  'AXCheckBox',
  'AXRadioButton',
  'AXPopUpButton',
  'AXComboBox',
  'AXSlider',
  'AXMenuItem',
  'AXMenuBarItem',
  'AXTab',
  'AXTabGroup',
  'AXToolbar',
  'AXIncrementor',
  'AXColorWell',
  'AXDisclosureTriangle',
])

/**
 * Extract interactable nodes from an AX tree and convert to target candidates.
 */
function axNodesToTargetCandidates(
  snapshot: AXSnapshot,
  appName: string,
): DesktopTargetCandidate[] {
  const candidates: DesktopTargetCandidate[] = []

  function walk(node: AXNode) {
    // Only include nodes with bounds and interactable roles
    if (node.bounds && INTERACTABLE_AX_ROLES.has(node.role)) {
      const label = node.title || node.description || node.value || node.role
      candidates.push({
        id: '', // Assigned later
        source: 'ax',
        appName,
        role: node.role,
        label: label.slice(0, 80),
        bounds: node.bounds,
        confidence: 0.8,
        interactable: node.enabled !== false,
        axUid: node.uid,
        focused: node.focused,
        enabled: node.enabled,
      })
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(snapshot.root)
  return candidates
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findChromeWindowBounds(
  observation: WindowObservation,
  titleHint?: string,
): Bounds | undefined {
  const normalizedTitleHint = titleHint?.trim().toLowerCase()
  if (normalizedTitleHint) {
    const titleMatchedWindow = observation.windows.find((window) => {
      if (!window.bounds || !window.appName.toLowerCase().includes('chrome')) {
        return false
      }

      const normalizedWindowTitle = window.title?.trim().toLowerCase()
      if (!normalizedWindowTitle) {
        return false
      }

      return normalizedWindowTitle === normalizedTitleHint
        || normalizedWindowTitle.includes(normalizedTitleHint)
        || normalizedTitleHint.includes(normalizedWindowTitle)
    })

    if (titleMatchedWindow?.bounds) {
      return titleMatchedWindow.bounds
    }
  }

  const chromeWindow = observation.windows.find(w =>
    w.appName.toLowerCase().includes('chrome') && w.bounds,
  )
  return chromeWindow?.bounds
}

function computeStaleness(params: {
  screenshot: ScreenshotArtifact
  axSnapshot?: AXSnapshot
  chromeSemanticSnapshot?: ChromeSemanticSnapshot
  chromeSemanticEnabled: boolean
  assemblyTimestamp: number
}): GroundingStalenessFlags {
  const { screenshot, axSnapshot, chromeSemanticSnapshot, chromeSemanticEnabled, assemblyTimestamp } = params

  const screenshotStale = !screenshot.capturedAt
    || (assemblyTimestamp - new Date(screenshot.capturedAt).getTime()) > STALENESS_THRESHOLD_MS
    || screenshot.placeholder === true

  const axStale = !axSnapshot
    || !axSnapshot.capturedAt
    || (assemblyTimestamp - new Date(axSnapshot.capturedAt).getTime()) > STALENESS_THRESHOLD_MS

  const chromeStale = !chromeSemanticEnabled
    || !chromeSemanticSnapshot
    || !chromeSemanticSnapshot.capturedAt
    || (assemblyTimestamp - new Date(chromeSemanticSnapshot.capturedAt).getTime()) > STALENESS_THRESHOLD_MS

  return {
    screenshot: screenshotStale,
    ax: axStale,
    chromeSemantic: chromeStale,
  }
}

function createPlaceholderScreenshot(): ScreenshotArtifact {
  return {
    dataBase64: '',
    mimeType: 'image/png',
    path: '',
    placeholder: true,
    note: 'screenshot capture failed during desktop_observe',
    capturedAt: new Date().toISOString(),
  }
}

function createEmptyWindowObservation(): WindowObservation {
  return {
    windows: [],
    observedAt: new Date().toISOString(),
  }
}
