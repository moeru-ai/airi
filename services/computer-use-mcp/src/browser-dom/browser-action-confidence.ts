/**
 * Dynamic confidence computation for browser DOM actions.
 *
 * Replaces the hardcoded `confidence: 0.8` with a context-aware score
 * based on observable factors like page load state, DOM change, and
 * element visibility.
 *
 * The base confidence is 0.5. Each positive signal adds 0.1, up to a
 * maximum of 1.0. This gives the strategy layer meaningful differentiation
 * between high-confidence and low-confidence actions.
 */

export interface BrowserActionConfidenceFactors {
  /** Whether document.readyState === 'complete'. */
  pageFullyLoaded: boolean
  /** Whether the DOM changed after the action (fingerprint comparison). */
  domChanged: boolean
  /** Whether the target element was visible in viewport before action. */
  elementVisible: boolean
  /** Whether the extension bridge is connected and responsive. */
  bridgeConnected: boolean
}

/**
 * Compute a dynamic confidence score for a browser DOM action.
 *
 * Base: 0.5
 * +0.1 for each true factor (pageFullyLoaded, domChanged, elementVisible, bridgeConnected)
 * Result clamped to [0.0, 1.0]
 */
export function computeBrowserActionConfidence(factors: Partial<BrowserActionConfidenceFactors>): number {
  let confidence = 0.5

  if (factors.bridgeConnected)
    confidence += 0.1
  if (factors.pageFullyLoaded)
    confidence += 0.1
  if (factors.domChanged)
    confidence += 0.1
  if (factors.elementVisible)
    confidence += 0.1

  // Clamp to [0.0, 1.0] and round to 2 decimal places
  return Math.round(Math.min(1.0, Math.max(0.0, confidence)) * 100) / 100
}
