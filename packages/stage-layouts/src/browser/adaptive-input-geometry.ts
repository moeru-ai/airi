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

/** The viewport properties that determine whether a keyboard sample can be reused. */
export interface ViewportProfile {
  /** The browser or installed-app mode that owns the viewport policy. */
  displayMode: 'browser' | 'standalone'
  /** The layout viewport height in CSS pixels. */
  height: number
  /** The layout viewport width in CSS pixels. */
  width: number
}

/** A measured keyboard overlap that can prepare a later focus operation. */
export interface ViewportSample {
  /** The layout viewport height hidden by the keyboard, in CSS pixels. */
  bottomHiddenByKeyboard: number
  /** The Unix timestamp in milliseconds when the sample was recorded. */
  measuredAt: number
  /** The viewport profile that produced the sample. */
  profile: ViewportProfile
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

/** A sample expires before a long-lived tab can reuse geometry from an earlier keyboard mode. */
const KEYBOARD_SAMPLE_MAX_AGE = 30 * 60 * 1000

/** A larger height change invalidates the sample because the browser layout is no longer comparable. */
const LAYOUT_HEIGHT_CHANGE_LIMIT = 80

/** A width change larger than rounding noise identifies a different layout viewport. */
const LAYOUT_WIDTH_CHANGE_LIMIT = 2

/**
 * Calculates a pre-focus viewport height from a recent compatible sample.
 *
 * The result is undefined when the sample is too old or its viewport profile is not compatible.
 */
export function calculateCachedViewportHeight(
  sample: ViewportSample,
  currentProfile: ViewportProfile,
  now: number,
): number | undefined {
  const sampleAge = now - sample.measuredAt
  if (sampleAge < 0 || sampleAge > KEYBOARD_SAMPLE_MAX_AGE)
    return undefined

  if (sample.profile.displayMode !== currentProfile.displayMode)
    return undefined

  const sampleIsLandscape = sample.profile.width > sample.profile.height
  const currentIsLandscape = currentProfile.width > currentProfile.height
  if (sampleIsLandscape !== currentIsLandscape)
    return undefined

  if (Math.abs(sample.profile.width - currentProfile.width) > LAYOUT_WIDTH_CHANGE_LIMIT)
    return undefined

  if (Math.abs(sample.profile.height - currentProfile.height) > LAYOUT_HEIGHT_CHANGE_LIMIT)
    return undefined

  if (sample.bottomHiddenByKeyboard <= KEYBOARD_HEIGHT_LOSS_THRESHOLD)
    return undefined

  const predictedHeight = currentProfile.height - sample.bottomHiddenByKeyboard
  return predictedHeight > 0 ? predictedHeight : undefined
}

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
