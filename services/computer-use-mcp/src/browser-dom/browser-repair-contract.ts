/**
 * Browser Repair Contracts — structured repair suggestions for known
 * browser DOM action failures.
 *
 * When a browser DOM action fails with a recognizable error pattern,
 * this module generates a structured `BrowserRepairSuggestion` that the
 * Agent can act on (e.g. scroll to element, wait for element, retry
 * with a different selector).
 *
 * This is the browser-side equivalent of the terminal PTY repair contracts.
 * All suggestions are advisory — they are surfaced as `[REACTION]` hints
 * in the tool response but never block execution.
 */

export interface BrowserRepairSuggestion {
  /** The error pattern that was matched. */
  pattern: string
  /** Human-readable explanation of the problem. */
  reason: string
  /** Recommended MCP tool to call to attempt recovery. */
  suggestedTool: string
  /** Parameters for the suggested tool. */
  suggestedParams: Record<string, unknown>
  /** Formatted `[REACTION]` instruction for the Agent. */
  reactionText: string
  /** Optional fallback selector if the original was too specific. */
  fallbackSelector?: string
}

// NOTICE: Error patterns are matched case-insensitively against the error
// message string. These patterns are based on observed Chrome extension and
// CDP bridge error messages.
const ERROR_PATTERNS: Array<{
  pattern: RegExp
  build: (selector: string, actionKind: string) => BrowserRepairSuggestion
}> = [
  {
    // Element not found in DOM
    pattern: /not found|no .* match|could not find|cannot find|selector .* did not match/i,
    build: (selector, actionKind) => ({
      pattern: 'element_not_found',
      reason: `Selector "${selector}" did not match any element in the page.`,
      suggestedTool: 'browser_dom_read_page',
      suggestedParams: {},
      reactionText: `[REACTION] The selector "${selector}" was not found. Re-read the page DOM to discover the correct selector, or wait for the page to finish loading before retrying.`,
    }),
  },
  {
    // Element not visible or not interactable
    pattern: /not visible|not interactable|element .* hidden|element .* obscured|element .* covered|zero.*(width|height)/i,
    build: (selector, actionKind) => ({
      pattern: 'element_not_visible',
      reason: `Element "${selector}" exists but is not visible or interactable — it may be off-screen or obscured by another element.`,
      suggestedTool: 'browser_dom_scroll_to',
      suggestedParams: { selector },
      reactionText: `[REACTION] Element "${selector}" is not visible. Try scrolling to it first with browser_dom_scroll_to, or check if a modal/overlay is blocking it.`,
    }),
  },
  {
    // Timeout waiting for element or action
    pattern: /timeout|timed? ?out|exceeded.*deadline/i,
    build: (selector, actionKind) => ({
      pattern: 'action_timeout',
      reason: `The "${actionKind}" action on "${selector}" timed out — the page may still be loading or the element may not be ready.`,
      suggestedTool: 'browser_dom_read_page',
      suggestedParams: {},
      reactionText: `[REACTION] Action timed out for "${selector}". Check document.readyState and wait for page load to complete, then retry.`,
    }),
  },
  {
    // Frame or tab no longer available
    pattern: /frame .* (detached|removed|not available)|tab .* (closed|not found)/i,
    build: (selector, actionKind) => ({
      pattern: 'frame_detached',
      reason: `The target frame or tab for "${selector}" is no longer available — it may have navigated away or been closed.`,
      suggestedTool: 'browser_dom_get_active_tab',
      suggestedParams: {},
      reactionText: `[REACTION] The target frame/tab is gone. Re-discover the active tab and frames before retrying.`,
    }),
  },
  {
    // Stale element reference
    pattern: /stale .* reference|element .* (changed|replaced|removed|no longer)/i,
    build: (selector, actionKind) => ({
      pattern: 'stale_element',
      reason: `Element "${selector}" was found but is now stale — the DOM was updated between discovery and action.`,
      suggestedTool: 'browser_dom_find_elements',
      suggestedParams: { selector },
      reactionText: `[REACTION] The element went stale. Re-query "${selector}" and retry immediately.`,
    }),
  },
]

/**
 * Diagnose a browser DOM action error and return a structured repair
 * suggestion if the error matches a known pattern.
 *
 * Returns `null` if the error is unrecognized — callers should fall back
 * to a generic error response in that case.
 */
export function diagnoseBrowserActionError(
  error: unknown,
  selector: string,
  actionKind: string,
): BrowserRepairSuggestion | null {
  const message = error instanceof Error ? error.message : String(error)

  for (const { pattern, build } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return build(selector, actionKind)
    }
  }

  return null
}
