import type { BackdropClip, BackdropRegion } from '@proj-airi/electron-native-backdrop/types'
import type { MaybeRefOrGetter } from 'vue'

import type { WindowBackdropStatus } from '../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { onMounted, onScopeDispose, toValue, watch } from 'vue'

import { electronWindowBackdropUpdate } from '../../shared/eventa'

import './window-backdrop.css'

type SurfaceKind = 'inlay' | 'panel'
type Update = (request: { regions: BackdropRegion[] }) => Promise<WindowBackdropStatus>

interface Root {
  element: HTMLElement
  kind: SurfaceKind
}

interface Snapshot {
  regions: BackdropRegion[]
  roots: Root[]
  key: string
}

const sessions = new WeakMap<Document, WindowBackdrop>()

function pixels(value: string, extent: number) {
  // Chromium writes very small computed lengths in exponent form, for example `7.2e-05%` at the end of a clip-path transition.
  if (!/^-?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:px|%)?$/i.test(value))
    throw new Error(`Unsupported backdrop length: ${value}`)
  return Number.parseFloat(value) * (value.endsWith('%') ? extent / 100 : 1)
}

function expandInsets(values: string[]) {
  const [top, right = top, bottom = top, left = right] = values
  return [top, right, bottom, left]
}

function rounded(value: number) {
  return Math.round(value * 100) / 100
}

function scaleOf(element: HTMLElement, style: CSSStyleDeclaration, rect: DOMRect) {
  let width = Number.parseFloat(style.width)
  let height = Number.parseFloat(style.height)
  if (style.boxSizing !== 'border-box') {
    width += Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight) + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
    height += Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
  }
  // Inline boxes can report an auto size. Layout offsets cover those boxes, while computed sizes preserve subpixel block dimensions.
  if (!Number.isFinite(width))
    width = element.offsetWidth
  if (!Number.isFinite(height))
    height = element.offsetHeight
  return { x: width ? rect.width / width : 1, y: height ? rect.height / height : 1 }
}

function cornerRadii(style: CSSStyleDeclaration, rect: DOMRect, scale: { x: number, y: number }) {
  const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
  const width = rect.width / scale.x
  const height = rect.height / scale.y
  const radii = corners.map((corner) => {
    const [horizontal, vertical = horizontal] = corner.split(' ')
    return { x: pixels(horizontal, width), y: pixels(vertical, height) }
  })
  // CSS reduces every corner together when adjacent radii exceed an edge, including rounded-full's 9999px radii.
  // A square edge imposes no radius constraint. Dividing its zero length by zero would poison every corner with NaN.
  const edges = [
    [width, radii[0].x + radii[1].x],
    [width, radii[2].x + radii[3].x],
    [height, radii[0].y + radii[3].y],
    [height, radii[1].y + radii[2].y],
  ]
  const factor = Math.min(1, ...edges.flatMap(([extent, radius]) => radius > 0 ? [extent / radius] : []))
  return radii.map((radius) => {
    const x = radius.x * factor * scale.x
    const y = radius.y * factor * scale.y
    if (Math.abs(x - y) > 0.1)
      throw new Error('Native backdrop surfaces require circular corner radii')
    return x
  })
}

function radiusOf(style: CSSStyleDeclaration, rect: DOMRect, scale: { x: number, y: number }) {
  const radii = cornerRadii(style, rect, scale)
  if (radii.some(radius => Math.abs(radius - radii[0]) > 0.1))
    throw new Error('Native backdrop surfaces require equal circular corner radii')
  return radii[0]
}

function overflowClips(element: HTMLElement, style: CSSStyleDeclaration, rect: DOMRect, scale: { x: number, y: number }): BackdropClip[] {
  const clipX = style.overflowX !== 'visible'
  const clipY = style.overflowY !== 'visible'
  if (!clipX && !clipY)
    return []
  const clip = {
    x: clipX ? rect.left + element.clientLeft * scale.x : 0,
    y: clipY ? rect.top + element.clientTop * scale.y : 0,
    width: clipX ? element.clientWidth * scale.x : window.innerWidth,
    height: clipY ? element.clientHeight * scale.y : window.innerHeight,
    radius: 0,
  }
  // An empty clipping area paints no material. Corner radii of a zero edge are not needed.
  if (clip.width <= 0 || clip.height <= 0)
    return [clip]
  if (!clipX || !clipY)
    return [clip]
  const [topLeft, topRight, bottomRight, bottomLeft] = cornerRadii(style, rect, scale)
  if (topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft)
    return [{ ...clip, radius: topLeft }]
  throw new Error('Unsupported backdrop overflow corner radii')
}

function insetClip(value: string, rect: DOMRect, scale: { x: number, y: number }): BackdropClip {
  const match = /^inset\(([^)]+)\)$/.exec(value)
  if (!match)
    throw new Error(`Unsupported backdrop clip-path: ${value}`)
  const [insets, radius] = match[1].split(/\s+round\s+/)
  const tokens = insets.trim().split(/\s+/)
  if (tokens.length > 4)
    throw new Error(`Unsupported backdrop insets: ${insets}`)
  const [top, right, bottom, left] = expandInsets(tokens).map((length, index) => pixels(length, (index % 2 ? rect.width / scale.x : rect.height / scale.y)) * (index % 2 ? scale.x : scale.y))
  const radii = radius?.trim().split(/\s+/).map(length => pixels(length, Math.min(rect.width / scale.x, rect.height / scale.y)) * scale.x) ?? [0]
  if (radii.some(value => value !== radii[0]))
    throw new Error(`Unsupported backdrop clip radii: ${radius}`)
  const width = Math.max(0, rect.width - left - right)
  const height = Math.max(0, rect.height - top - bottom)
  return { x: rect.left + left, y: rect.top + top, width, height, radius: Math.min(radii[0], width / 2, height / 2) }
}

/**
 * Owns one renderer window's native regions, including concurrent mounted chat surfaces.
 * Observers invalidate cached targets. Only running surface animations keep the frame loop awake.
 * One IPC request runs at a time. A newer snapshot replaces its queued predecessor, including unmount cleanup.
 */
class WindowBackdrop {
  private readonly roots = new Set<Root>()
  private readonly surfaces = new Map<HTMLElement, string>()
  private readonly ancestors = new Set<HTMLElement>()
  private readonly animations = new Set<Animation>()
  private readonly resizeObserver = new ResizeObserver(() => this.invalidate())
  private readonly mutationObserver = new MutationObserver(records => this.mutated(records))
  private targetsDirty = true
  private frame: number | undefined
  private nextId = 0
  private pending: Snapshot | undefined
  private inFlight = false
  private clearPending = false
  private submittedKey: string | undefined
  private stopped = false
  private observing = false

  constructor(private readonly document: Document, private readonly update: Update) {}

  register(element: HTMLElement, kind: SurfaceKind) {
    const root = { element, kind }
    this.roots.add(root)
    if (!this.stopped) {
      this.observe()
      this.targetsDirty = true
      this.invalidate()
    }
    return () => {
      element.removeAttribute('data-window-backdrop-active')
      this.roots.delete(root)
      this.targetsDirty = true
      if (this.roots.size === 0) {
        this.disconnect()
        if (this.stopped) {
          this.release()
        }
        else {
          this.enqueue({ regions: [], roots: [], key: '[]' })
          this.release()
        }
      }
      else {
        this.invalidate()
      }
    }
  }

  private observe() {
    if (this.observing)
      return
    this.observing = true
    this.mutationObserver.observe(this.document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-window-backdrop-surface'] })
    this.document.addEventListener('scroll', this.invalidate, true)
    this.document.addEventListener('transitionrun', this.animationChanged, true)
    this.document.addEventListener('transitionend', this.animationChanged, true)
    this.document.addEventListener('transitioncancel', this.animationChanged, true)
    this.document.addEventListener('animationstart', this.animationChanged, true)
    this.document.addEventListener('animationend', this.animationChanged, true)
    this.document.addEventListener('animationcancel', this.animationChanged, true)
    this.document.defaultView!.addEventListener('resize', this.invalidate)
  }

  private disconnect() {
    this.observing = false
    this.mutationObserver.disconnect()
    this.resizeObserver.disconnect()
    this.document.removeEventListener('scroll', this.invalidate, true)
    for (const event of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'])
      this.document.removeEventListener(event, this.animationChanged, true)
    this.document.defaultView!.removeEventListener('resize', this.invalidate)
    if (this.frame !== undefined)
      cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.animations.clear()
    this.surfaces.clear()
    this.ancestors.clear()
  }

  private mutated(records: MutationRecord[]) {
    const relevant = records.filter(record => record.target instanceof Element && [...this.roots].some(root => root.element.contains(record.target) || (record.target as Element).contains(root.element)))
    if (!relevant.length)
      return
    if (relevant.some(record => record.type === 'childList' || record.attributeName === 'data-window-backdrop-surface'))
      this.targetsDirty = true
    this.invalidate()
  }

  private animationChanged = (event: Event) => {
    if (event.target instanceof HTMLElement && this.ancestors.has(event.target)) {
      for (const animation of event.target.getAnimations())
        this.animations.add(animation)
      this.invalidate()
    }
  }

  private invalidate = () => {
    if (!this.stopped && this.roots.size && this.frame === undefined)
      this.frame = requestAnimationFrame(() => this.sample())
  }

  private collectTargets() {
    const previous = new Map(this.surfaces)
    this.surfaces.clear()
    this.ancestors.clear()
    this.resizeObserver.disconnect()
    for (const root of this.roots) {
      const targets = root.kind === 'panel'
        ? [root.element]
        : [...root.element.querySelectorAll<HTMLElement>('[data-window-backdrop-surface]')]
      for (const target of targets) {
        this.surfaces.set(target, previous.get(target) ?? `surface-${this.nextId++}`)
        for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement)
          this.ancestors.add(ancestor)
      }
      this.resizeObserver.observe(root.element)
    }
    for (const ancestor of this.ancestors) {
      this.resizeObserver.observe(ancestor)
      for (const animation of ancestor.getAnimations())
        this.animations.add(animation)
    }
    this.targetsDirty = false
  }

  private sample() {
    this.frame = undefined
    try {
      if (this.targetsDirty)
        this.collectTargets()
      if (!this.animations.size) {
        for (const ancestor of this.ancestors) {
          for (const animation of ancestor.getAnimations())
            this.animations.add(animation)
        }
      }
      const regions: BackdropRegion[] = []
      const visibleRoots = new Set<Root>()
      // Share ancestor measurements between concurrent surfaces during a move or fold.
      const measurements = new Map<HTMLElement, { style: CSSStyleDeclaration, rect: DOMRect }>()
      for (const [element, id] of this.surfaces) {
        const region = this.region(element, id, measurements)
        if (region) {
          regions.push(region)
          for (const root of this.roots) {
            if (root.element.contains(element))
              visibleRoots.add(root)
          }
        }
      }
      this.enqueue({ regions, roots: [...visibleRoots], key: JSON.stringify(regions) })
      for (const animation of this.animations) {
        if (animation.playState !== 'running' && !animation.pending)
          this.animations.delete(animation)
      }
      if (this.animations.size)
        this.invalidate()
    }
    catch (error) {
      this.fail(error)
    }
  }

  private region(element: HTMLElement, id: string, measurements: Map<HTMLElement, { style: CSSStyleDeclaration, rect: DOMRect }>): BackdropRegion | undefined {
    let opacity = 1
    const clips: BackdropClip[] = [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, radius: 0 }]
    let surface: { style: CSSStyleDeclaration, rect: DOMRect } | undefined
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      let measured = measurements.get(ancestor)
      if (!measured) {
        measured = { style: getComputedStyle(ancestor), rect: ancestor.getBoundingClientRect() }
        measurements.set(ancestor, measured)
      }
      const { style, rect } = measured
      if (style.display === 'none' || style.visibility !== 'visible')
        return
      if (ancestor === element && (rect.width <= 0 || rect.height <= 0))
        return
      opacity *= Number(style.opacity)
      if (opacity <= 0)
        return
      const scale = scaleOf(ancestor, style, rect)
      if (ancestor === element)
        surface = measured
      if (style.clipPath !== 'none')
        clips.push(insetClip(style.clipPath, rect, scale))
      // The surface's own overflow clips children, not its own painted background.
      if (ancestor !== element)
        clips.push(...overflowClips(ancestor, style, rect, scale))
    }
    if (!surface || surface.rect.width <= 0 || surface.rect.height <= 0)
      return
    const { rect, style } = surface
    if (clips.some(clip => clip.width <= 0 || clip.height <= 0 || clip.x >= rect.right || clip.y >= rect.bottom || clip.x + clip.width <= rect.left || clip.y + clip.height <= rect.top))
      return
    return {
      id,
      x: rounded(rect.x),
      y: rounded(rect.y),
      width: rounded(rect.width),
      height: rounded(rect.height),
      radius: rounded(radiusOf(style, rect, scaleOf(element, style, rect))),
      opacity: rounded(opacity),
      clips: clips.map(clip => ({ x: rounded(clip.x), y: rounded(clip.y), width: rounded(clip.width), height: rounded(clip.height), radius: rounded(clip.radius) })),
    }
  }

  private enqueue(snapshot: Snapshot) {
    if (this.stopped || snapshot.key === this.pending?.key)
      return
    if (snapshot.key === this.submittedKey) {
      this.pending = undefined
      return
    }
    this.pending = snapshot
    void this.flush()
  }

  private async flush() {
    if (this.inFlight || !this.pending || this.stopped)
      return
    const snapshot = this.pending
    this.pending = undefined
    this.inFlight = true
    this.submittedKey = snapshot.key
    try {
      const status = await this.update({ regions: snapshot.regions })
      // Geometry can fail while IPC is pending. That reply cannot reactivate a stopped session before its queued clear.
      if (this.stopped)
        return
      if (status.state === 'active') {
        for (const root of this.roots) {
          if (snapshot.roots.includes(root))
            root.element.setAttribute('data-window-backdrop-active', root.kind)
          else
            root.element.removeAttribute('data-window-backdrop-active')
        }
      }
      else if (status.state === 'unsupported') {
        this.stop()
      }
      else {
        this.fail(new Error(status.reason))
      }
    }
    catch (error) {
      this.fail(error)
    }
    finally {
      this.inFlight = false
      if (this.clearPending)
        void this.clear()
      else if (this.pending)
        void this.flush()
      else
        this.release()
    }
  }

  private stop() {
    this.stopped = true
    this.pending = undefined
    this.disconnect()
    for (const root of this.roots)
      root.element.removeAttribute('data-window-backdrop-active')
  }

  private fail(error: unknown) {
    console.error('[window-backdrop] Native material stopped. Keeping the CSS surface:', error)
    this.stop()
    // A geometry failure can occur after a successful frame. Remove that native frame before keeping opaque CSS.
    this.clearPending = true
    void this.clear()
  }

  private async clear() {
    if (this.inFlight)
      return
    this.clearPending = false
    this.inFlight = true
    try {
      await this.update({ regions: [] })
    }
    catch (error) {
      console.error('[window-backdrop] Failed to clear native regions:', error)
    }
    finally {
      this.inFlight = false
      this.release()
    }
  }

  private release() {
    if (!this.roots.size && !this.inFlight && !this.pending && !this.clearPending)
      sessions.delete(this.document)
  }
}

/**
 * Registers a page's local surfaces. The last unmount clears native regions after any pending update.
 *
 * `enabled` turns the surface off and on while the page stays mounted. An off surface draws no native material and
 * no CSS fill.
 */
export function useWindowBackdrop(element: MaybeRefOrGetter<HTMLElement | null | undefined>, kind: SurfaceKind, enabled: MaybeRefOrGetter<boolean> = true) {
  const update = useElectronEventaInvoke(electronWindowBackdropUpdate)
  let unregister: (() => void) | undefined
  onMounted(() => {
    const root = toValue(element)
    if (!root)
      throw new Error('The native backdrop root is missing after mount')
    watch(() => toValue(enabled), (on) => {
      unregister?.()
      unregister = undefined
      if (!on)
        return
      let session = sessions.get(root.ownerDocument)
      if (!session) {
        session = new WindowBackdrop(root.ownerDocument, update)
        sessions.set(root.ownerDocument, session)
      }
      unregister = session.register(root, kind)
    }, { immediate: true })
  })
  onScopeDispose(() => unregister?.())
}
