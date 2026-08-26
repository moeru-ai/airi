import { errorMessageFromValue } from '../utils/error-message'

export interface BrowserRepairSuggestion {
  /** The matched error pattern. */
  pattern: string
  /** Short instruction that can be appended to the tool response. */
  reactionText: string
  /** Human-readable explanation of the failure. */
  reason: string
  /** Suggested parameters for the recovery tool. */
  suggestedParams: Record<string, unknown>
  /** Existing MCP tool that can help recover from the failure. */
  suggestedTool: string
}

const ERROR_PATTERNS: Array<{
  build: (selector: string, actionKind: string) => BrowserRepairSuggestion
  pattern: RegExp
}> = [
  {
    build: selector => ({
      pattern: 'element_not_found',
      reactionText: `Re-read the page DOM before retrying "${selector}". The selector may be stale, too specific, or not loaded yet.`,
      reason: `Selector "${selector}" did not match any element in the page.`,
      suggestedParams: {},
      suggestedTool: 'browser_dom_read_page',
    }),
    pattern: /not found|no .* match|could not find|cannot find|selector .* did not match/i,
  },
  {
    build: selector => ({
      pattern: 'element_not_visible',
      reactionText: `Inspect computed styles for "${selector}" and check whether an overlay, hidden state, or off-screen position is blocking interaction.`,
      reason: `Element "${selector}" exists but is not visibly interactable.`,
      suggestedParams: { selector },
      suggestedTool: 'browser_dom_get_computed_styles',
    }),
    pattern: /not visible|not interactable|element .* hidden|element .* obscured|element .* covered|zero.*(width|height)/i,
  },
  {
    build: selector => ({
      pattern: 'action_timeout',
      reactionText: `Wait for "${selector}" with browser_dom_wait_for_element, then retry the action after the page settles.`,
      reason: `The action timed out while waiting for "${selector}".`,
      suggestedParams: { selector },
      suggestedTool: 'browser_dom_wait_for_element',
    }),
    pattern: /timed? ?out|exceeded.*deadline/i,
  },
  {
    build: selector => ({
      pattern: 'frame_detached',
      reactionText: 'Re-discover the active tab and frames before retrying the browser DOM action.',
      reason: `The frame or tab containing "${selector}" is no longer available.`,
      suggestedParams: {},
      suggestedTool: 'browser_dom_get_active_tab',
    }),
    pattern: /frame .* (detached|removed|not available)|tab .* (closed|not found)/i,
  },
  {
    build: selector => ({
      pattern: 'stale_element',
      reactionText: `Re-query "${selector}" with browser_dom_find_elements and retry immediately with the refreshed match.`,
      reason: `Element "${selector}" changed after it was discovered.`,
      suggestedParams: { selector },
      suggestedTool: 'browser_dom_find_elements',
    }),
    pattern: /stale .* reference|element .* (changed|replaced|removed|no longer)/i,
  },
]

export function diagnoseBrowserActionError(
  error: unknown,
  selector: string,
  actionKind: string,
): BrowserRepairSuggestion | null {
  const message = errorMessageFromValue(error)

  for (const { build, pattern } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return build(selector, actionKind)
    }
  }

  return null
}
