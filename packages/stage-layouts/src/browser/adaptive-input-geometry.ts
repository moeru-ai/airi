/** A rectangle in layout viewport coordinates and CSS pixels. */
export interface ViewportRectangle {
  /** The bottom edge in CSS pixels. */
  bottom: number
  /** The rectangle height in CSS pixels. */
  height: number
  /** The left edge in CSS pixels. */
  left: number
  /** The right edge in CSS pixels. */
  right: number
  /** The top edge in CSS pixels. */
  top: number
  /** The rectangle width in CSS pixels. */
  width: number
}

/** The Visual Viewport values used by the fallback layout policy. */
export interface VisualViewportMeasurement {
  /** The current visual viewport height in CSS pixels. */
  height: number
  /** The current visual viewport offsetTop in CSS pixels. */
  offsetTop: number
  /** The current visual viewport pageTop in CSS pixels. */
  pageTop: number
}

/** The input lifecycle phase used to choose how one Visual Viewport measurement affects layout. */
export type AdaptiveInputFocusPhase = 'idle' | 'focused' | 'closing'

/** The resolved fallback layout for an adaptive input region. */
export interface VisualViewportLayout {
  /** The height to assign to keyboard-aware content, in CSS pixels. */
  height: number
  /**
   * Whether to treat the height loss as keyboard-related.
   *
   * If true, a focused editable control can enable the keyboard-visible layout.
   * If false, browser controls alone cannot enable the keyboard-visible layout.
   */
  heightLossExceedsThreshold: boolean
  /** Whether to apply the keyboard-visible layout for this measurement. */
  keyboardVisible: boolean
  /** The translation that a separate visual layer can apply to cancel the Visual Viewport pan, in CSS pixels. */
  offsetTop: number
  /** The bottom edge to assign to the adaptive viewport, in document coordinates and CSS pixels. */
  visibleBottom: number
}

/** Changes below this threshold can come from browser controls instead of a software keyboard. */
const KEYBOARD_HEIGHT_LOSS_THRESHOLD = 100

/**
 * Resolves keyboard visibility and available edges from one Visual Viewport measurement.
 *
 * The reference height must remain stable while an editable control has focus.
 */
export function calculateVisualViewportLayout(
  viewport: VisualViewportMeasurement,
  referenceLayoutHeight: number,
  focusPhase: AdaptiveInputFocusPhase,
): VisualViewportLayout {
  const heightLoss = Math.max(0, referenceLayoutHeight - viewport.height)
  const heightLossExceedsThreshold = heightLoss > KEYBOARD_HEIGHT_LOSS_THRESHOLD
  const viewportBottom = Math.max(0, viewport.height + viewport.pageTop)
  const visibleBottom = referenceLayoutHeight > 0
    ? Math.min(referenceLayoutHeight, viewportBottom)
    : viewportBottom

  if (focusPhase === 'closing') {
    return {
      height: referenceLayoutHeight,
      heightLossExceedsThreshold,
      keyboardVisible: false,
      offsetTop: viewport.offsetTop,
      visibleBottom: referenceLayoutHeight,
    }
  }

  return {
    height: viewport.height,
    heightLossExceedsThreshold,
    keyboardVisible: focusPhase === 'focused' && heightLossExceedsThreshold,
    offsetTop: viewport.offsetTop,
    visibleBottom,
  }
}

/** Returns the upward distance needed to clear an overlapping keyboard rectangle. */
export function calculateKeyboardShift(target: ViewportRectangle, keyboard: ViewportRectangle): number {
  if (keyboard.width <= 0 || keyboard.height <= 0)
    return 0

  const hasHorizontalOverlap = target.left < keyboard.right && target.right > keyboard.left
  if (!hasHorizontalOverlap)
    return 0

  return Math.max(0, target.bottom - keyboard.top)
}

/**
 * Normalizes a DOM rectangle and adds a vertical offset.
 *
 * @example
 * toViewportRectangle(new DOMRect(0, 10, 390, 64), 20)
 * // => { top: 30, bottom: 94, left: 0, right: 390, width: 390, height: 64 }
 */
export function toViewportRectangle(rect: DOMRectReadOnly, verticalOffset = 0): ViewportRectangle {
  return {
    bottom: rect.bottom + verticalOffset,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top + verticalOffset,
    width: rect.width,
  }
}
