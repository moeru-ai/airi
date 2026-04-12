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
  /** Which execution path to use */
  route: 'browser_dom' | 'os_input'
  /** Human-readable explanation of the routing decision */
  reason: string
  /** CSS selector for browser-dom action (only when route is browser_dom) */
  selector?: string
  /** Frame ID for browser-dom action (only when route is browser_dom) */
  frameId?: number
  /** Which bridge method to use (only when route is browser_dom) */
  bridgeMethod?: 'clickSelector' | 'setInputValue' | 'checkCheckbox' | 'selectOption'
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
      route: 'os_input',
      reason: `source is '${candidate.source}', not chrome_dom`,
    }
  }

  if (!candidate.selector) {
    return {
      route: 'os_input',
      reason: 'chrome_dom candidate has no CSS selector for re-query',
    }
  }

  if (!bridgeAvailable) {
    return {
      route: 'os_input',
      reason: 'browser-dom bridge is not connected, falling back to OS input',
    }
  }

  return undefined
}

/**
 * Decide whether a click on a candidate should go through browser-dom
 * bridge or OS-level input. Also handles checkbox toggling via checkCheckbox.
 */
export function decideBrowserAction(
  candidate: DesktopTargetCandidate,
  bridgeAvailable: boolean,
): BrowserActionDecision {
  const rejection = checkBrowserDomPreconditions(candidate, bridgeAvailable)
  if (rejection)
    return rejection

  // Checkbox: route to checkCheckbox instead of generic click
  if (isCheckboxCandidate(candidate)) {
    return {
      route: 'browser_dom',
      selector: candidate.selector,
      frameId: candidate.frameId,
      bridgeMethod: 'checkCheckbox',
      reason: `chrome_dom checkbox with selector '${candidate.selector}' routed to checkCheckbox`,
    }
  }

  return {
    route: 'browser_dom',
    selector: candidate.selector,
    frameId: candidate.frameId,
    bridgeMethod: 'clickSelector',
    reason: `chrome_dom candidate with selector '${candidate.selector}' routed to browser-dom bridge`,
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
      route: 'os_input',
      reason: `chrome_dom candidate tag '${candidate.tag}' is not a text input element`,
    }
  }

  return {
    route: 'browser_dom',
    selector: candidate.selector,
    frameId: candidate.frameId,
    bridgeMethod: 'setInputValue',
    reason: `chrome_dom text input with selector '${candidate.selector}' routed to setInputValue`,
  }
}

// ---------------------------------------------------------------------------
// Candidate classification helpers
// ---------------------------------------------------------------------------

const TEXT_INPUT_TYPES = new Set([
  'text',
  'password',
  'email',
  'search',
  'url',
  'tel',
  'number',
])

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
