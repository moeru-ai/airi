/**
 * Browser action router — decides whether a desktop action should go through
 * the browser-dom bridge (DOM-level precision) or OS-level input.
 *
 * Routing rules are fixed, not heuristic:
 * - chrome_dom candidate with selector + bridge available → browser_dom
 * - Everything else → os_input
 * - Bridge unavailable → os_input (graceful fallback)
 *
 * Covers: click, type/setInputValue, checkCheckbox, selectOption.
 */

import type { DesktopTargetCandidate } from './desktop-grounding-types'

export interface BrowserActionDecision {
  /** Which bridge method to use (only when route is browser_dom) */
  bridgeMethod?: 'checkCheckbox' | 'clickSelector' | 'selectOption' | 'setInputValue'
  /** Frame ID for browser-dom action (only when route is browser_dom) */
  frameId?: number
  /** Human-readable explanation of the routing decision */
  reason: string
  /** Which execution path to use */
  route: 'browser_dom' | 'os_input'
  /** CSS selector for browser-dom action (only when route is browser_dom) */
  selector?: string
}

/**
 * Decide whether a click on a candidate should go through browser-dom
 * bridge or OS-level input. Also handles checkbox toggling via checkCheckbox.
 */
export function decideBrowserAction(
  candidate: DesktopTargetCandidate,
  bridgeAvailable: boolean,
  actionButton: 'left' | 'middle' | 'right' = 'left',
  clickCount = 1,
): BrowserActionDecision {
  const rejection = checkBrowserDomPreconditions(candidate, bridgeAvailable)
  if (rejection)
    return rejection

  if (actionButton !== 'left' || clickCount !== 1) {
    return {
      reason: `browser-dom click routing only supports left single-click, got ${actionButton} with count ${clickCount}`,
      route: 'os_input',
    }
  }

  // Checkbox: route to checkCheckbox instead of generic click
  if (isCheckboxCandidate(candidate)) {
    return {
      bridgeMethod: 'checkCheckbox',
      frameId: candidate.frameId,
      reason: `chrome_dom checkbox with selector '${candidate.selector}' routed to checkCheckbox`,
      route: 'browser_dom',
      selector: candidate.selector,
    }
  }

  return {
    bridgeMethod: 'clickSelector',
    frameId: candidate.frameId,
    reason: `chrome_dom candidate with selector '${candidate.selector}' routed to browser-dom bridge`,
    route: 'browser_dom',
    selector: candidate.selector,
  }
}

/**
 * Decide whether a type action should go through browser-dom setInputValue
 * or OS-level typeText.
 *
 * Only routes to browser_dom if the candidate is a text-input-like element
 * (input[text|password|email|...], textarea, or role="textbox").
 */
export function decideBrowserTypeAction(
  candidate: DesktopTargetCandidate,
  bridgeAvailable: boolean,
): BrowserActionDecision {
  const rejection = checkBrowserDomPreconditions(candidate, bridgeAvailable)
  if (rejection)
    return rejection

  if (!isTextInputCandidate(candidate)) {
    return {
      reason: `chrome_dom candidate tag '${candidate.tag}' is not a text input element`,
      route: 'os_input',
    }
  }

  return {
    bridgeMethod: 'setInputValue',
    frameId: candidate.frameId,
    reason: `chrome_dom text input with selector '${candidate.selector}' routed to setInputValue`,
    route: 'browser_dom',
    selector: candidate.selector,
  }
}

/**
 * Shared precondition check for browser-dom routing.
 * Returns a rejection decision if the candidate is ineligible,
 * or undefined if all preconditions pass.
 */
function checkBrowserDomPreconditions(
  candidate: DesktopTargetCandidate,
  bridgeAvailable: boolean,
): BrowserActionDecision | undefined {
  if (candidate.source !== 'chrome_dom') {
    return {
      reason: `source is '${candidate.source}', not chrome_dom`,
      route: 'os_input',
    }
  }

  if (!candidate.selector) {
    return {
      reason: 'chrome_dom candidate has no CSS selector for re-query',
      route: 'os_input',
    }
  }

  if (!bridgeAvailable) {
    return {
      reason: 'browser-dom bridge is not connected, falling back to OS input',
      route: 'os_input',
    }
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Candidate classification helpers
// ---------------------------------------------------------------------------

const TEXT_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
])

/** Whether a candidate represents a checkbox or toggle. */
function isCheckboxCandidate(candidate: DesktopTargetCandidate): boolean {
  const tag = candidate.tag?.toLowerCase()
  if (tag === 'input') {
    const inputType = candidate.inputType?.toLowerCase()
    return inputType === 'checkbox'
  }
  if (candidate.role === 'checkbox')
    return true
  return false
}

/** Whether a candidate represents a text-input-like element. */
function isTextInputCandidate(candidate: DesktopTargetCandidate): boolean {
  const tag = candidate.tag?.toLowerCase()
  if (tag === 'textarea')
    return true
  if (tag === 'input') {
    // Exclude non-text input types (checkbox, radio, file, etc.)
    const inputType = candidate.inputType?.toLowerCase() || 'text'
    return TEXT_INPUT_TYPES.has(inputType)
  }
  // contenteditable elements surfaced with role="textbox"
  if (candidate.role === 'textbox')
    return true
  return false
}
