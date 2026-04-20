/**
 * Chrome semantic adapter — collects interactive element data from Chrome
 * and maps it to DesktopTargetCandidate format.
 *
 * Uses the extension bridge as primary source and CDP bridge as fallback.
 * Only active when Chrome is the foreground app.
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
  BrowserDomFrameDom,
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
): DesktopTargetCandidate[] {
  const candidates: DesktopTargetCandidate[] = []
  const viewportOffsetX = windowBounds.x
  const viewportOffsetY = windowBounds.y + chromeHeightPx

  for (const el of elements) {
    if (!el.rect || el.rect.w === 0 || el.rect.h === 0) {
      continue
    }

    // Convert page-relative rect to screen-absolute bounds
    const bounds: Bounds = {
      x: viewportOffsetX + el.rect.x,
      y: viewportOffsetY + el.rect.y,
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
    })
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  return value as Record<string, unknown>
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getExtensionFramePayload(result: Record<string, unknown>) {
  return toRecord(result.data) ?? result
}

function getFrameRect(payload: Record<string, unknown>): BrowserDomFrameDom['frameRect'] | undefined {
  const rect = toRecord(payload.frameRect)
  if (!rect)
    return undefined

  const x = toFiniteNumber(rect.x)
  const y = toFiniteNumber(rect.y)
  const w = toFiniteNumber(rect.w)
  const h = toFiniteNumber(rect.h)
  if (x === undefined || y === undefined || w === undefined || h === undefined)
    return undefined

  return { x, y, w, h }
}

function getFrameParentId(frame: Record<string, unknown>): number | undefined {
  return toFiniteNumber(frame.parentFrameId)
}

function offsetInteractiveElement(
  element: BrowserDomInteractiveElement,
  offset: { x: number, y: number },
): BrowserDomInteractiveElement {
  return {
    ...element,
    rect: element.rect
      ? {
          ...element.rect,
          x: element.rect.x + offset.x,
          y: element.rect.y + offset.y,
        }
      : element.rect,
    center: element.center
      ? {
          x: element.center.x + offset.x,
          y: element.center.y + offset.y,
        }
      : element.center,
  }
}

function resolveFrameOffset(
  frameId: number,
  parentIds: Map<number, number | undefined>,
  payloads: Map<number, Record<string, unknown>>,
  cache: Map<number, { x: number, y: number } | null>,
  visiting: Set<number> = new Set(),
): { x: number, y: number } | null {
  if (cache.has(frameId))
    return cache.get(frameId) ?? null

  if (frameId === 0) {
    const rootOffset = { x: 0, y: 0 }
    cache.set(frameId, rootOffset)
    return rootOffset
  }

  if (visiting.has(frameId)) {
    cache.set(frameId, null)
    return null
  }

  visiting.add(frameId)

  const payload = payloads.get(frameId)
  const frameRect = payload ? getFrameRect(payload) : undefined
  const parentFrameId = parentIds.get(frameId)
  if (!frameRect || parentFrameId === undefined) {
    cache.set(frameId, null)
    visiting.delete(frameId)
    return null
  }

  const parentOffset = resolveFrameOffset(parentFrameId, parentIds, payloads, cache, visiting)
  if (!parentOffset) {
    cache.set(frameId, null)
    visiting.delete(frameId)
    return null
  }

  const resolvedOffset = {
    x: parentOffset.x + frameRect.x,
    y: parentOffset.y + frameRect.y,
  }
  cache.set(frameId, resolvedOffset)
  visiting.delete(frameId)
  return resolvedOffset
}

async function captureViaExtension(
  bridge: BrowserDomExtensionBridge,
): Promise<ChromeSemanticSnapshot> {
  const frames = await bridge.readAllFramesDom({
    includeText: false,
    maxElements: 150,
  })
  const frameTree = typeof bridge.getAllFrames === 'function'
    ? await bridge.getAllFrames().catch(() => [])
    : []

  // Merge interactive elements from all frames
  const allElements: BrowserDomInteractiveElement[] = []
  let pageUrl = ''
  let pageTitle = ''
  const payloadsByFrameId = new Map<number, Record<string, unknown>>()
  const parentIdsByFrameId = new Map<number, number | undefined>()
  const resolvedOffsets = new Map<number, { x: number, y: number } | null>()

  for (const frame of frameTree) {
    const frameRecord = toRecord(frame)
    if (!frameRecord)
      continue

    const frameId = toFiniteNumber(frameRecord.frameId)
    if (frameId === undefined)
      continue

    parentIdsByFrameId.set(frameId, getFrameParentId(frameRecord))
  }

  for (const frame of frames) {
    const dom = frame.result as Record<string, unknown> | undefined
    if (!dom)
      continue

    const payload = getExtensionFramePayload(dom)
    payloadsByFrameId.set(frame.frameId, payload)

    if (frame.frameId === 0) {
      pageUrl = (payload.url as string) || ''
      pageTitle = (payload.title as string) || ''
    }

    const rawElements = payload.interactiveElements
    const elements = rawElements as BrowserDomInteractiveElement[] | undefined
    if (elements) {
      const offset = resolveFrameOffset(
        frame.frameId,
        parentIdsByFrameId,
        payloadsByFrameId,
        resolvedOffsets,
      )

      if (frame.frameId !== 0 && !offset) {
        continue
      }

      const normalizedElements = offset
        ? elements.map(element => offsetInteractiveElement(element, offset))
        : elements
      allElements.push(...normalizedElements)
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
