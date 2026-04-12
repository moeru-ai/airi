/**
 * Browser action router — decides whether a desktop click should go through
 * the browser-dom bridge (DOM-level precision) or OS-level input.
 *
 * Routing rules are fixed, not heuristic:
 * - chrome_dom candidate with selector + bridge available → browser_dom
 * - Everything else → os_input
 * - Bridge unavailable → os_input (graceful fallback)
 */

import type { DesktopTargetCandidate } from './desktop-grounding-types'

export interface BrowserActionDecision {
  /** Which execution path to use */
  route: 'browser_dom' | 'os_input'
  /** Human-readable explanation of the routing decision */
  reason: string
  /** CSS selector for browser-dom click (only when route is browser_dom) */
  selector?: string
  /** Frame ID for browser-dom click (only when route is browser_dom) */
  frameId?: number
}

/**
 * Decide whether a click on a candidate should go through browser-dom
 * bridge or OS-level input.
 *
 * @param candidate - The target candidate from the grounding snapshot
 * @param bridgeAvailable - Whether the browser-dom bridge is connected
 * @returns Routing decision with reason
 */
export function decideBrowserAction(
  candidate: DesktopTargetCandidate,
  bridgeAvailable: boolean,
): BrowserActionDecision {
  // Only chrome_dom candidates are eligible for browser-native routing
  if (candidate.source !== 'chrome_dom') {
    return {
      route: 'os_input',
      reason: `source is '${candidate.source}', not chrome_dom`,
    }
  }

  // Must have a selector for DOM re-query
  if (!candidate.selector) {
    return {
      route: 'os_input',
      reason: 'chrome_dom candidate has no CSS selector for re-query',
    }
  }

  // Bridge must be available
  if (!bridgeAvailable) {
    return {
      route: 'os_input',
      reason: 'browser-dom bridge is not connected, falling back to OS input',
    }
  }

  // All conditions met → route through browser DOM
  return {
    route: 'browser_dom',
    selector: candidate.selector,
    frameId: candidate.frameId,
    reason: `chrome_dom candidate with selector '${candidate.selector}' routed to browser-dom bridge`,
  }
}
