import { errorMessageFromValue } from '../utils/error-message'

export interface BrowserRepairSuggestion {
  /** The matched error pattern. */
  pattern: string
  /** Human-readable explanation of the failure. */
  reason: string
  /** Existing MCP tool that can help recover from the failure. */
  suggestedTool: string
  /** Suggested parameters for the recovery tool. */
  suggestedParams: Record<string, unknown>
  /** Short instruction that can be appended to the tool response. */
  reactionText: string
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp
  build: (selector: string, actionKind: string) => BrowserRepairSuggestion
}> = [
  {
    pattern: /not found|no .* match|could not find|cannot find|selector .* did not match/i,
    build: selector => ({
      pattern: 'element_not_found',
      reason: `Selector "${selector}" did not match any element in the page.`,
      suggestedTool: 'browser_dom_read_page',
      suggestedParams: {},
      reactionText: `Re-read the page DOM before retrying "${selector}". The selector may be stale, too specific, or not loaded yet.`,
    }),
  },
  {
    pattern: /not visible|not interactable|element .* hidden|element .* obscured|element .* covered|zero.*(width|height)/i,
    build: selector => ({
      pattern: 'element_not_visible',
      reason: `Element "${selector}" exists but is not visibly interactable.`,
      suggestedTool: 'browser_dom_get_computed_styles',
      suggestedParams: { selector },
      reactionText: `Inspect computed styles for "${selector}" and check whether an overlay, hidden state, or off-screen position is blocking interaction.`,
    }),
  },
  {
    pattern: /timed? ?out|exceeded.*deadline/i,
    build: selector => ({
      pattern: 'action_timeout',
      reason: `The action timed out while waiting for "${selector}".`,
      suggestedTool: 'browser_dom_wait_for_element',
      suggestedParams: { selector },
      reactionText: `Wait for "${selector}" with browser_dom_wait_for_element, then retry the action after the page settles.`,
    }),
  },
  {
    pattern: /frame .* (detached|removed|not available)|tab .* (closed|not found)/i,
    build: selector => ({
      pattern: 'frame_detached',
      reason: `The frame or tab containing "${selector}" is no longer available.`,
      suggestedTool: 'browser_dom_get_active_tab',
      suggestedParams: {},
      reactionText: 'Re-discover the active tab and frames before retrying the browser DOM action.',
    }),
  },
  {
    pattern: /stale .* reference|element .* (changed|replaced|removed|no longer)/i,
    build: selector => ({
      pattern: 'stale_element',
      reason: `Element "${selector}" changed after it was discovered.`,
      suggestedTool: 'browser_dom_find_elements',
      suggestedParams: { selector },
      reactionText: `Re-query "${selector}" with browser_dom_find_elements and retry immediately with the refreshed match.`,
    }),
  },
]

export function diagnoseBrowserActionError(
  error: unknown,
  selector: string,
  actionKind: string,
): BrowserRepairSuggestion | null {
  const message = errorMessageFromValue(error)

  for (const { pattern, build } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return build(selector, actionKind)
    }
  }

  return null
}
