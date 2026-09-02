import type { AdaptiveInputFocusPhase } from './adaptive-input-geometry'

import {
  calculateKeyboardShift,
  calculateVisualViewportLayout,
  toViewportRectangle,
} from './adaptive-input-geometry'

/** The event that reports a new {@link AdaptiveInputLayout}. */
export const ADAPTIVE_INPUT_LAYOUT_EVENT = 'layoutchange'

/** The layout values produced for an adaptive input region. */
export interface AdaptiveInputLayout {
  /**
   * Whether to use the keyboard-visible layout for the input region.
   *
   * If true, the input region must fit above a software keyboard.
   * If false, the input region can use the normal viewport layout.
   */
  keyboardVisible: boolean
  /** The layout viewport height before the software keyboard changes the visible area. */
  stableViewportHeight: number
  /** The height that remains visible above the keyboard, in CSS pixels. */
  visibleHeight: number
  /** The bottom edge to assign to the adaptive viewport, in document coordinates and CSS pixels. */
  viewportBottom: number
  /** The translation that a separate visual layer can apply to cancel the Visual Viewport pan, in CSS pixels. */
  viewportOffsetTop: number
}

/** The elements and browser policy used by {@link AdaptiveInput}. */
export interface AdaptiveInputOptions {
  /** The region that contains editable controls and moves above the keyboard. */
  area: HTMLElement
  /**
   * Lets the virtual keyboard cover page content so this controller can position the input area.
   *
   * @default true
   */
  overlayVirtualKeyboard?: boolean
  /** The region whose height follows the available viewport. */
  viewport: HTMLElement
  /**
   * The window that owns the viewport measurements and browser events.
   *
   * @default window
   */
  window?: Window
}

const TEXT_ENTRY_SELECTOR = [
  'textarea',
  'input:not([type])',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="text"]',
  'input[type="url"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

function readLayoutHeight(targetWindow: Window): number {
  return targetWindow.document.documentElement.clientHeight
}

function isTextEntry(element: Element): boolean {
  return element.matches(TEXT_ENTRY_SELECTOR)
    && !element.matches(':disabled, [readonly]')
}

/**
 * Owns keyboard measurements and layout timing for one adaptive input region.
 *
 * Construction starts event measurement. Call {@link dispose} when the owner releases the region.
 * The controller reports each new layout through {@link ADAPTIVE_INPUT_LAYOUT_EVENT}.
 *
 * The focus-out path writes one synchronous inline height to `viewport`. The controller restores
 * the previous height during disposal if the consumer has not replaced the value.
 */
export class AdaptiveInput extends EventTarget {
  private readonly abortController = new AbortController()
  private readonly area: HTMLElement
  private readonly targetWindow: Window
  private readonly viewport: HTMLElement
  private readonly virtualKeyboard: (EventTarget & {
    readonly boundingRect: DOMRectReadOnly
    overlaysContent: boolean
  }) | undefined

  private readonly visualViewport: VisualViewport | null

  private animationFrame: number | undefined
  private focusPhase: AdaptiveInputFocusPhase = 'idle'
  private layoutValue: AdaptiveInputLayout
  private pendingWindowScrollRepair = false
  private referenceLayoutHeight: number
  private synchronousHeightBeforeWrite: string | undefined
  private synchronousHeightValue: string | undefined

  private readonly overlaysContentBeforeStart?: boolean

  constructor(options: AdaptiveInputOptions) {
    super()

    const targetWindow = options.window ?? window
    const initialHeight = targetWindow.document.documentElement.clientHeight

    this.area = options.area
    this.targetWindow = targetWindow
    this.viewport = options.viewport
    this.visualViewport = targetWindow.visualViewport
    this.referenceLayoutHeight = initialHeight
    this.layoutValue = {
      keyboardVisible: false,
      stableViewportHeight: initialHeight,
      visibleHeight: initialHeight,
      viewportBottom: initialHeight,
      viewportOffsetTop: 0,
    }

    // TypeScript 5.9 does not include this experimental browser API in lib.dom.d.ts.
    this.virtualKeyboard = Reflect.get(targetWindow.navigator, 'virtualKeyboard')
    if (this.virtualKeyboard && options.overlayVirtualKeyboard !== false) {
      this.overlaysContentBeforeStart = this.virtualKeyboard.overlaysContent
      this.virtualKeyboard.overlaysContent = true
    }

    const activeElement = targetWindow.document.activeElement
    this.focusPhase = activeElement !== null
      && this.area.contains(activeElement)
      && isTextEntry(activeElement)
      ? 'focused'
      : 'idle'

    const listenerOptions = { signal: this.abortController.signal }
    targetWindow.document.addEventListener('focusin', this.onFocusIn, listenerOptions)
    targetWindow.document.addEventListener('focusout', this.onFocusOut, listenerOptions)
    this.virtualKeyboard?.addEventListener('geometrychange', this.requestMeasurement, listenerOptions)
    this.visualViewport?.addEventListener('resize', this.requestMeasurement, listenerOptions)
    this.visualViewport?.addEventListener('scroll', this.requestMeasurement, listenerOptions)
    targetWindow.addEventListener('resize', this.requestMeasurement, listenerOptions)
    targetWindow.addEventListener('orientationchange', this.requestMeasurement, listenerOptions)

    this.requestMeasurement()
  }

  /** Returns the latest layout values. */
  get layout(): Readonly<AdaptiveInputLayout> {
    return this.layoutValue
  }

  /** Stops browser events and restores browser values changed by this controller. */
  dispose(): void {
    this.abortController.abort()

    if (this.animationFrame !== undefined)
      this.targetWindow.cancelAnimationFrame(this.animationFrame)

    if (this.virtualKeyboard && this.overlaysContentBeforeStart !== undefined)
      this.virtualKeyboard.overlaysContent = this.overlaysContentBeforeStart

    if (
      this.synchronousHeightBeforeWrite !== undefined
      && this.viewport.style.height === this.synchronousHeightValue
    ) {
      this.viewport.style.height = this.synchronousHeightBeforeWrite
    }
  }

  private readonly requestMeasurement = () => {
    if (this.animationFrame !== undefined)
      return

    this.animationFrame = this.targetWindow.requestAnimationFrame(this.measure)
  }

  private readonly measure = () => {
    this.animationFrame = undefined

    const currentLayoutHeight = readLayoutHeight(this.targetWindow)
    if (this.focusPhase === 'idle' && !this.pendingWindowScrollRepair)
      this.referenceLayoutHeight = currentLayoutHeight

    const stableLayoutHeight = this.referenceLayoutHeight || currentLayoutHeight
    let keyboardVisible = false
    let visibleHeight = currentLayoutHeight
    let viewportBottom = currentLayoutHeight
    let viewportOffsetTop = 0
    if (this.visualViewport) {
      // WORKAROUND:
      // NOTICE:
      // Why: Safari sends Visual Viewport changes after its compositor starts the input pan.
      // Root cause: Safari browser tabs do not implement navigator.virtualKeyboard.
      // Source: https://bugs.webkit.org/show_bug.cgi?id=265578
      // Related WebKit issue: https://bugs.webkit.org/show_bug.cgi?id=297779#c23
      // Code reference: https://github.com/Ajaxy/telegram-tt/blob/8b63941b230b3870accc442b5ef5ac95fc53c719/src/util/windowSize.ts#L11-L51
      // Removal condition: Safari provides keyboard geometry before the compositor pan starts.
      const viewportLayout = calculateVisualViewportLayout({
        height: this.visualViewport.height,
        offsetTop: this.visualViewport.offsetTop,
        pageTop: this.visualViewport.pageTop,
      }, stableLayoutHeight, this.focusPhase)

      keyboardVisible = viewportLayout.keyboardVisible
      visibleHeight = viewportLayout.height
      viewportBottom = viewportLayout.visibleBottom
      viewportOffsetTop = viewportLayout.offsetTop

      if (viewportLayout.heightLossExceedsThreshold)
        this.pendingWindowScrollRepair = true

      if (this.pendingWindowScrollRepair && !viewportLayout.heightLossExceedsThreshold) {
        // WORKAROUND:
        // NOTICE:
        // Why: Safari can leave the page scrolled after the keyboard closes.
        // Root cause: Safari keeps the Visual Viewport offset after the height returns.
        // Source: https://github.com/Ajaxy/telegram-tt/blob/8b63941b230b3870accc442b5ef5ac95fc53c719/src/components/middle/MiddleColumn.tsx#L380-L415
        // Removal condition: Safari resets the page scroll when the keyboard closes.
        if (this.visualViewport.offsetTop > 0 || this.visualViewport.pageTop > 0)
          this.targetWindow.scrollTo({ top: 0 })

        this.pendingWindowScrollRepair = false
      }

      if (this.focusPhase === 'closing' && !viewportLayout.heightLossExceedsThreshold)
        this.focusPhase = 'idle'
    }
    else if (this.focusPhase === 'closing') {
      this.focusPhase = 'idle'
    }

    if (this.focusPhase === 'focused' && this.virtualKeyboard?.overlaysContent && this.virtualKeyboard.boundingRect.height > 0) {
      const shiftedAreaRect = this.area.getBoundingClientRect()
      const appliedBottomInset = Math.max(0, currentLayoutHeight - this.layoutValue.viewportBottom)
      // The rectangle includes the current upward shift. Add the inset to recover its layout position.
      const areaRect = toViewportRectangle(shiftedAreaRect, appliedBottomInset)

      // VirtualKeyboard.boundingRect reports the keyboard intersection with the viewport.
      // Intersect both rectangles so a floating keyboard moves only the covered area.
      // Specification: https://github.com/w3c/virtual-keyboard/blob/8ed1fe298ba42579647315988e5875715bb010af/index.html
      // Code reference: https://github.com/GoogleChrome/samples/tree/1eef1eeb6048684020d1160499e552b79843d000/virtualkeyboard
      const keyboardShift = calculateKeyboardShift(
        areaRect,
        toViewportRectangle(this.virtualKeyboard.boundingRect),
      )
      keyboardVisible = true
      viewportBottom = Math.max(0, currentLayoutHeight - keyboardShift)
    }

    this.layoutValue = {
      keyboardVisible,
      stableViewportHeight: stableLayoutHeight,
      visibleHeight,
      viewportBottom,
      viewportOffsetTop,
    }
    this.dispatchEvent(new Event(ADAPTIVE_INPUT_LAYOUT_EVENT))
  }

  private readonly onFocusIn = (event: FocusEvent) => {
    if (!(event.target instanceof Element))
      throw new TypeError('The focusin event target must be an Element.')

    if (!this.area.contains(event.target) || !isTextEntry(event.target))
      return

    this.focusPhase = 'focused'
    this.referenceLayoutHeight = readLayoutHeight(this.targetWindow)
    this.requestMeasurement()
  }

  private readonly onFocusOut = (event: FocusEvent) => {
    if (!(event.target instanceof Element))
      throw new TypeError('The focusout event target must be an Element.')

    if (!this.area.contains(event.target) || !isTextEntry(event.target))
      return

    this.focusPhase = 'closing'

    // NOTICE:
    // Why: The input region must follow the keyboard as soon as its owned input loses focus.
    // Root cause: Safari keeps the keyboard-sized Visual Viewport until its close animation ends.
    // Source: https://bugs.webkit.org/show_bug.cgi?id=265578
    // Removal condition: Safari reports each intermediate keyboard close frame through a keyboard API.
    const normalHeight = this.referenceLayoutHeight || readLayoutHeight(this.targetWindow)
    this.layoutValue = {
      keyboardVisible: false,
      stableViewportHeight: normalHeight,
      visibleHeight: normalHeight,
      viewportBottom: normalHeight,
      viewportOffsetTop: this.visualViewport?.offsetTop ?? 0,
    }
    this.dispatchEvent(new Event(ADAPTIVE_INPUT_LAYOUT_EVENT))

    if (this.synchronousHeightBeforeWrite === undefined)
      this.synchronousHeightBeforeWrite = this.viewport.style.height
    this.synchronousHeightValue = `${normalHeight}px`
    this.viewport.style.height = this.synchronousHeightValue

    this.requestMeasurement()
  }
}
