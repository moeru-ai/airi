/**
 * Chrome semantic adapter — collects interactive element data from Chrome
 * and maps it to DesktopTargetCandidate format.
 *
 * Uses the extension bridge as primary source and CDP bridge as fallback.
 * Best effort when browser surfaces are available.
 *
 * The adapter handles coordinate transformation from page-relative
 * (CSS viewport) coordinates to screen-absolute coordinates using
 * the Chrome window bounds from the window observation.
 */

import type { CdpBridge } from './browser-dom/cdp-bridge'
import type { BrowserDomExtensionBridge } from './browser-dom/extension-bridge'
import type {
  ChromeSemanticSnapshot,
  DesktopTargetCandidate,
} from './desktop-grounding-types'
import type {
  Bounds,
  BrowserDomInteractiveElement,
} from './types'

/**
 * Estimated height of Chrome's browser chrome (tab bar + address bar + bookmarks bar)
 * in logical pixels on macOS.
 *
 * NOTICE: This is a heuristic. The actual value depends on Chrome's zoom level,
 * whether the bookmarks bar is shown, and whether the tab strip is compact.
 * A more accurate approach would be to probe via the extension bridge, but
 * that adds an extra roundtrip. For v1 this constant is sufficient.
 */
const CHROME_CHROME_HEIGHT_PX = 88

// Pre-compiled regex for selector building (module scope per eslint e18e/prefer-static-regex)
const RE_DOUBLE_QUOTE = /"/g
const RE_WHITESPACE_SPLIT = /\s+/
const RE_CSS_ESCAPE = /[^\w-]/g

/**
 * Capture Chrome semantic data from the active tab.
 *
 * Tries the extension bridge first (richer data, no `--remote-debugging-port` needed).
 * Falls back to CDP bridge if the extension is unavailable.
 * Returns `null` if both fail (graceful degradation).
 *
 * @param extensionBridge - The active WebSocket extension bridge (may be disconnected)
 * @param cdpBridge - The active CDP bridge (may be disconnected)
 * @returns ChromeSemanticSnapshot or null
 */
export async function captureChromeSemantics(
  extensionBridge: BrowserDomExtensionBridge | undefined,
  cdpBridge: CdpBridge | undefined,
): Promise<ChromeSemanticSnapshot | null> {
  // Try extension bridge first
  if (extensionBridge) {
    try {
      const status = extensionBridge.getStatus()
      if (status.connected) {
        return await captureViaExtension(extensionBridge)
      }
    }
    catch {
      // Fall through to CDP
    }
  }

  // Fallback to CDP bridge
  if (cdpBridge) {
    try {
      const status = cdpBridge.getStatus()
      if (status.connected) {
        return await captureViaCdp(cdpBridge)
      }
    }
    catch {
      // Fall through to null
    }
  }

  return null
}

/**
 * Convert Chrome interactive elements to desktop target candidates.
 *
 * Transforms page-relative coordinates to screen-absolute using
 * the Chrome window bounds and an estimated chrome height offset.
 *
 * @param elements - Interactive elements from the Chrome page
 * @param windowBounds - Screen-absolute bounds of the Chrome window
 * @param chromeHeightPx - Height of the browser chrome in logical pixels (default: 88)
 * @returns Array of desktop target candidates with `source: 'chrome_dom'`
 */
export function chromeElementsToTargetCandidates(
  elements: BrowserDomInteractiveElement[],
  windowBounds: Bounds,
  chromeHeightPx: number = CHROME_CHROME_HEIGHT_PX,
  frameId: number = 0,
): DesktopTargetCandidate[] {
  const candidates: DesktopTargetCandidate[] = []
  const viewportOffsetX = windowBounds.x
  const viewportOffsetY = windowBounds.y + chromeHeightPx

  for (const el of elements) {
    if (!el.rect || el.rect.w === 0 || el.rect.h === 0) {
      continue
    }

    // Read per-element frame ID if tagged by captureViaExtension,
    // otherwise fall back to the function parameter
    const elFrameId = (el as Record<string, unknown>)._frameId as number | undefined
    const elFrameOffsetX = (el as Record<string, unknown>)._frameOffsetX as number | undefined
    const elFrameOffsetY = (el as Record<string, unknown>)._frameOffsetY as number | undefined

    // Convert page-relative rect to screen-absolute bounds
    const bounds: Bounds = {
      x: viewportOffsetX + (elFrameOffsetX ?? 0) + el.rect.x,
      y: viewportOffsetY + (elFrameOffsetY ?? 0) + el.rect.y,
      width: el.rect.w,
      height: el.rect.h,
    }

    // Skip elements that are outside the window bounds (off-screen / clipped)
    if (bounds.x + bounds.width < windowBounds.x || bounds.y + bounds.height < windowBounds.y) {
      continue
    }
    if (bounds.x > windowBounds.x + windowBounds.width || bounds.y > windowBounds.y + windowBounds.height) {
      continue
    }

    const label = buildLabel(el)
    const role = el.role || el.tag || 'element'
    const confidence = computeElementConfidence(el)
    const selector = buildSelector(el)

    candidates.push({
      id: '', // Will be assigned by the grounding layer
      source: 'chrome_dom',
      appName: 'Google Chrome',
      role,
      label,
      bounds,
      confidence,
      interactable: !el.disabled,
      tag: el.tag,
      href: el.href,
      inputType: el.type,
      selector,
      frameId: elFrameId ?? frameId,
      isPageContent: true, // All chrome_dom candidates are page content by definition
      enabled: !el.disabled,
    })
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function captureViaExtension(
  bridge: BrowserDomExtensionBridge,
): Promise<ChromeSemanticSnapshot> {
  const frames = await bridge.readAllFramesDom({
    includeText: false,
    maxElements: 150,
  })

  // Merge interactive elements from all frames, preserving frame identity
  const allElements: Array<BrowserDomInteractiveElement & { _frameId?: number }> = []
  let pageUrl = ''
  let pageTitle = ''

  for (const frame of frames) {
    const dom = frame.result as Record<string, unknown> | undefined
    if (!dom)
      continue

    if (frame.frameId === 0) {
      pageUrl = (dom.url as string) || ''
      pageTitle = (dom.title as string) || ''
    }

    const rawElements = dom.interactiveElements
      ?? (dom.data && typeof dom.data === 'object' && (dom.data as Record<string, unknown>).interactiveElements)
    const rawFrameOffset = dom.frameOffset
      ?? (dom.data && typeof dom.data === 'object' && (dom.data as Record<string, unknown>).frameOffset)
    const frameOffset = (
      rawFrameOffset
      && typeof rawFrameOffset === 'object'
      && typeof (rawFrameOffset as Record<string, unknown>).x === 'number'
      && typeof (rawFrameOffset as Record<string, unknown>).y === 'number'
    )
      ? {
          x: (rawFrameOffset as Record<string, unknown>).x as number,
          y: (rawFrameOffset as Record<string, unknown>).y as number,
        }
      : undefined
    const elements = rawElements as BrowserDomInteractiveElement[] | undefined
    if (elements) {
      // Tag each element with its frame ID for downstream routing
      for (const el of elements) {
        allElements.push({
          ...el,
          _frameId: frame.frameId,
          ...(frameOffset ? { _frameOffsetX: frameOffset.x, _frameOffsetY: frameOffset.y } : {}),
        })
      }
    }
  }

  return {
    pageUrl,
    pageTitle,
    interactiveElements: allElements,
    capturedAt: new Date().toISOString(),
    source: 'extension',
  }
}

async function captureViaCdp(bridge: CdpBridge): Promise<ChromeSemanticSnapshot> {
  const elements = await bridge.collectInteractiveElements(150)

  const status = bridge.getStatus()

  // Map CDP elements to our BrowserDomInteractiveElement format
  const mapped: BrowserDomInteractiveElement[] = (elements || []).map((el: Record<string, unknown>) => ({
    tag: el.tag as string | undefined,
    id: el.id as string | undefined,
    name: el.name as string | undefined,
    type: el.type as string | undefined,
    text: el.text as string | undefined,
    value: el.value as string | undefined,
    href: el.href as string | undefined,
    placeholder: el.placeholder as string | undefined,
    disabled: el.disabled as boolean | undefined,
    checked: el.checked as boolean | undefined,
    role: el.role as string | undefined,
    rect: el.rect as { x: number, y: number, w: number, h: number } | undefined,
    center: el.center as { x: number, y: number } | undefined,
  }))

  return {
    pageUrl: status.pageUrl || '',
    pageTitle: status.pageTitle || '',
    interactiveElements: mapped,
    capturedAt: new Date().toISOString(),
    source: 'cdp',
  }
}

/**
 * Build a best-effort CSS selector for re-querying the element via the
 * browser-dom bridge. Used by the browser action router for DOM-level
 * click precision instead of OS coordinate input.
 *
 * Priority: #id > [name] > tag[type] > tag.className > tag
 */
function buildSelector(el: BrowserDomInteractiveElement): string | undefined {
  // Unique id — best
  if (el.id && el.id.trim()) {
    return `#${cssEscape(el.id.trim())}`
  }

  const tag = el.tag?.toLowerCase() || '*'

  // Name attribute — common for form inputs
  if (el.name && el.name.trim()) {
    return `${tag}[name="${el.name.trim().replace(RE_DOUBLE_QUOTE, '\\"')}"]`
  }

  // Tag + type — useful for input[type="submit"] etc.
  if (el.type && el.type.trim() && (tag === 'input' || tag === 'button')) {
    return `${tag}[type="${el.type.trim().replace(RE_DOUBLE_QUOTE, '\\"')}"]`
  }

  // Tag + first className — fallback
  if (el.className && el.className.trim()) {
    const firstClass = el.className.trim().split(RE_WHITESPACE_SPLIT)[0]
    if (firstClass) {
      return `${tag}.${cssEscape(firstClass)}`
    }
  }

  // Tag alone is too generic to be useful
  return undefined
}

/**
 * Minimal CSS identifier escape for Node.js (CSS.escape is browser-only).
 * Escapes characters that are invalid in CSS identifiers per the spec.
 * Sufficient for id/class name escaping in selector construction.
 */
function cssEscape(value: string): string {
  return value.replace(RE_CSS_ESCAPE, ch => `\\${ch}`)
}

/**
 * Build a human-readable label from element attributes.
 * Priority: text > placeholder > name > id > href > tag.
 */
function buildLabel(el: BrowserDomInteractiveElement): string {
  if (el.text && el.text.trim()) {
    return el.text.trim().slice(0, 80)
  }
  if (el.placeholder && el.placeholder.trim()) {
    return `[${el.placeholder.trim().slice(0, 60)}]`
  }
  if (el.name) {
    return `name="${el.name}"`
  }
  if (el.id) {
    return `#${el.id}`
  }
  if (el.href) {
    // Truncate long URLs
    const url = el.href.length > 60 ? `${el.href.slice(0, 57)}...` : el.href
    return url
  }
  return el.tag || 'element'
}

/**
 * Compute confidence score for a Chrome DOM element based on its attributes.
 *
 * Buttons and links are high confidence, disabled elements are lower,
 * and generic elements without clear interactable signals get medium confidence.
 */
function computeElementConfidence(el: BrowserDomInteractiveElement): number {
  // Disabled → low confidence for interactability
  if (el.disabled)
    return 0.3

  const tag = el.tag?.toLowerCase() || ''
  const role = el.role?.toLowerCase() || ''

  // Buttons, links, explicit interactive roles → high confidence
  if (
    tag === 'button'
    || tag === 'a'
    || role === 'button'
    || role === 'link'
    || role === 'tab'
    || role === 'menuitem'
  ) {
    return 0.95
  }

  // Form inputs → high confidence
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return 0.9
  }

  // Elements with click handlers or tabindex → medium-high confidence
  if (role === 'checkbox' || role === 'radio') {
    return 0.85
  }

  // Default
  return 0.7
}
