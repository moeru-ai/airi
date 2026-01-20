import type { BrowserWindow, Rectangle } from 'electron'

import type { DockConfig, DockDebugState, DockModeState, DockViewport, WindowTargetSummary } from '..'
import type { WindowTracker } from './window-tracker'

import process from 'node:process'

import { useLogg } from '@guiiai/logg'
import { merge } from '@moeru/std'
import { screen } from 'electron'
import { clamp } from 'es-toolkit/math'

import { getOverlayWindowIds } from './window-ids'

export interface DockControllerOptions {
  overlayWindow: BrowserWindow
  overlayIds?: string[]
  tracker: WindowTracker
  config?: DockConfig
}

export const defaultDockConfig: Required<DockConfig> = {
  activeIntervalMs: 80,
  idleIntervalMs: 400,
  hiddenIntervalMs: 1000,
  burstIntervalMs: 40,
  burstTicks: 3,
  clickThrough: true,
  hideWhenInactive: true,
  padding: 0,
  showWhenNotFrontmost: false,
  viewport: {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1,
  },
}

type NormalizedDockConfig = Required<DockConfig>

export class DockController {
  private readonly overlayWindow: BrowserWindow
  private readonly overlayIdSet: Set<string>
  private readonly tracker: WindowTracker
  private pollHandle?: NodeJS.Timeout
  private destroyed = false
  private state: DockModeState = 'detached'
  private targetId?: string
  private config: NormalizedDockConfig = { ...defaultDockConfig }
  private mouseEventsIgnored = false
  private burstTicksRemaining = 0
  private overlayBaseline?: { visible: boolean, alwaysOnTop: boolean }
  private debugState: DockDebugState = {
    state: 'detached',
    pollIntervalMs: defaultDockConfig.idleIntervalMs,
    lastUpdatedAt: Date.now(),
  }

  constructor(options: DockControllerOptions) {
    this.overlayWindow = options.overlayWindow
    const overlayIds = options.overlayIds ?? getOverlayWindowIds({
      electronId: this.overlayWindow.id,
      nativeHandle: process.platform === 'win32' ? this.overlayWindow.getNativeWindowHandle() : undefined,
    })
    this.overlayIdSet = new Set(overlayIds)
    this.tracker = options.tracker
    this.config = this.normalizeConfig(options.config ?? defaultDockConfig)
  }

  getTargetId(): string | undefined {
    return this.targetId
  }

  start(targetId: string): DockDebugState {
    if (this.isTargetOverlay(targetId)) {
      this.saveDebugState({ lastReason: 'overlay-target-blocked' })
      return this.getDebugState()
    }
    if (!this.targetId) {
      this.captureOverlayBaseline()
    }
    this.targetId = targetId
    this.burstTicksRemaining = this.config.burstTicks ?? defaultDockConfig.burstTicks
    this.saveDebugState({ targetId, lastReason: 'target-selected' })
    this.ensureLoop()
    return this.getDebugState()
  }

  stop(): DockDebugState {
    this.targetId = undefined
    this.state = 'detached'
    this.burstTicksRemaining = 0
    this.restoreMouseEvents()
    this.restoreOverlayBaseline()
    this.setNextInterval(this.config.idleIntervalMs ?? defaultDockConfig.idleIntervalMs)
    this.saveDebugState({ lastReason: 'stopped' })
    return this.getDebugState()
  }

  updateConfig(config: DockConfig): DockDebugState {
    this.config = this.normalizeConfig(merge(this.config, config))
    return this.getDebugState()
  }

  getDebugState(): DockDebugState {
    return { ...this.debugState }
  }

  dispose(): void {
    this.destroyed = true
    if (this.pollHandle) {
      clearTimeout(this.pollHandle)
      this.pollHandle = undefined
    }
    this.restoreMouseEvents()
    this.lowerOverlay()
  }

  private normalizeConfig(config: DockConfig): NormalizedDockConfig {
    const merged = merge(defaultDockConfig, config) as NormalizedDockConfig
    return {
      ...merged,
      viewport: this.normalizeViewport(merged.viewport),
    }
  }

  private normalizeViewport(viewport: DockViewport | undefined): DockViewport {
    const fallback = defaultDockConfig.viewport
    const clamp01 = (value: number | undefined) => clamp(Number.isFinite(value ?? 0) ? value ?? 0 : 0, 0, 1)

    let left = clamp01(viewport?.left ?? fallback.left)
    let right = clamp01(viewport?.right ?? fallback.right)
    let top = clamp01(viewport?.top ?? fallback.top)
    let bottom = clamp01(viewport?.bottom ?? fallback.bottom)

    const minSpan = 0.01
    if (right - left < minSpan) {
      right = clamp(left + minSpan, 0, 1)
      if (right - left < minSpan) {
        left = clamp(right - minSpan, 0, 1)
      }
    }
    if (bottom - top < minSpan) {
      bottom = clamp(top + minSpan, 0, 1)
      if (bottom - top < minSpan) {
        top = clamp(bottom - minSpan, 0, 1)
      }
    }

    return { left, right, top, bottom }
  }

  private ensureLoop() {
    if (this.pollHandle || this.destroyed) {
      return
    }
    this.scheduleNextTick(this.config.idleIntervalMs ?? defaultDockConfig.idleIntervalMs)
  }

  private scheduleNextTick(interval: number) {
    if (this.destroyed) {
      return
    }
    if (this.pollHandle) {
      clearTimeout(this.pollHandle)
    }
    this.pollHandle = setTimeout(() => {
      this.pollHandle = undefined
      this.tick().catch((err) => {
        useLogg('window-dock').useGlobalConfig().withError(err).error('tick failed')
      }).finally(() => {
        this.scheduleNextTick(this.debugState.pollIntervalMs)
      })
    }, interval)
  }

  private setNextInterval(interval: number) {
    this.debugState.pollIntervalMs = interval
  }

  private async tick() {
    const now = Date.now()

    if (!this.targetId) {
      this.state = 'detached'
      this.restoreMouseEvents()
      this.restoreOverlayBaseline()
      this.setNextInterval(this.config.idleIntervalMs ?? defaultDockConfig.idleIntervalMs)
      this.saveDebugState({ lastReason: 'no-target', lastUpdatedAt: now })
      return
    }

    const targetIsOverlay = this.isTargetOverlay(this.targetId)
    const meta = await this.tracker.getWindowMeta(this.targetId)
    if (!meta) {
      this.state = 'companion'
      this.targetId = undefined
      this.burstTicksRemaining = 0
      this.restoreMouseEvents()
      this.restoreOverlayBaseline()
      this.setNextInterval(this.config.idleIntervalMs ?? defaultDockConfig.idleIntervalMs)
      this.saveDebugState({ lastReason: 'target-missing', targetId: undefined, lastMeta: undefined, lastUpdatedAt: now })
      return
    }

    const displayBounds = meta.displayBounds ?? this.inferDisplayBounds(meta.bounds)
    const isFullscreen = this.isFullscreen(meta, displayBounds)
    const realAbove = (await this.tracker.getWindowsAbove(meta.id)).filter(candidate => this.isRealWindow(candidate, displayBounds))

    // On Win32 the native z-order probe tends to include one extra entry even when the
    // target is already frontmost. Subtract one to align the “windows above” count.
    // This will undercount when running on the Electron-only fallback (macOS/unsupported),
    // which is acceptable because production assumes native bindings on Win32.
    const adjustedAboveCount = Math.max(0, realAbove.length - 1)
    const isFrontmost = adjustedAboveCount === 0
    const allowNonFrontmostVisibility = (this.config.showWhenNotFrontmost ?? defaultDockConfig.showWhenNotFrontmost)
      || !(this.config.hideWhenInactive ?? defaultDockConfig.hideWhenInactive)

    if (!meta.isOnScreen || meta.isMinimized) {
      this.state = 'companion'
      this.restoreMouseEvents()
      if (targetIsOverlay) {
        this.restoreOverlayBaseline()
      }
      else {
        this.hideOverlay(true)
        this.lowerOverlay()
      }
      this.setNextInterval(this.config.hiddenIntervalMs ?? defaultDockConfig.hiddenIntervalMs)
      this.saveDebugState({ lastReason: 'target-hidden', lastMeta: meta, lastUpdatedAt: now })
      return
    }

    if (isFullscreen) {
      this.state = 'docking-attached-hidden'
      this.hideOverlay(true)
      this.lowerOverlay()
      this.setNextInterval(this.config.hiddenIntervalMs ?? defaultDockConfig.hiddenIntervalMs)
      this.saveDebugState({
        lastReason: 'target-fullscreen',
        lastMeta: meta,
        windowsAbove: adjustedAboveCount,
        lastUpdatedAt: now,
      })
      return
    }

    if (!isFrontmost && !allowNonFrontmostVisibility) {
      this.state = 'docking-attached-hidden'
      this.hideOverlay()
      this.lowerOverlay()
      this.setNextInterval(this.config.hiddenIntervalMs ?? defaultDockConfig.hiddenIntervalMs)
      this.saveDebugState({
        lastReason: 'not-frontmost',
        lastMeta: meta,
        windowsAbove: adjustedAboveCount,
        lastUpdatedAt: now,
      })
      return
    }

    const becameVisible = this.state !== 'docking-attached-visible'
    const boundsChanged = this.debugState.lastMeta ? !this.areBoundsEqual(this.debugState.lastMeta.bounds, meta.bounds) : true
    if (becameVisible || boundsChanged) {
      this.burstTicksRemaining = this.config.burstTicks ?? defaultDockConfig.burstTicks
    }

    this.state = 'docking-attached-visible'
    this.syncOverlay(meta.bounds)

    const burstActive = this.burstTicksRemaining > 0
    this.setNextInterval(burstActive ? (this.config.burstIntervalMs ?? defaultDockConfig.burstIntervalMs) : (this.config.activeIntervalMs ?? defaultDockConfig.activeIntervalMs))
    if (burstActive) {
      this.burstTicksRemaining -= 1
    }
    this.saveDebugState({
      lastReason: isFrontmost ? 'visible' : 'visible-not-frontmost',
      lastMeta: meta,
      windowsAbove: adjustedAboveCount,
      lastUpdatedAt: now,
    })
  }

  private saveDebugState(patch: Partial<DockDebugState>) {
    this.debugState = {
      ...this.debugState,
      state: this.state,
      targetId: this.targetId,
      ...patch,
    }
  }

  private inferDisplayBounds(bounds: Rectangle | undefined): Rectangle | undefined {
    if (!bounds) {
      return undefined
    }
    return screen.getDisplayMatching(bounds).bounds
  }

  private isFullscreen(meta: WindowTargetSummary, displayBounds?: Rectangle): boolean {
    if (typeof meta.isFullscreen === 'boolean') {
      return meta.isFullscreen
    }
    if (!displayBounds) {
      return false
    }
    const { bounds } = meta
    const delta = 6
    const matchesX = Math.abs(bounds.x - displayBounds.x) <= delta
    const matchesY = Math.abs(bounds.y - displayBounds.y) <= delta
    const matchesW = Math.abs(bounds.width - displayBounds.width) <= delta
    const matchesH = Math.abs(bounds.height - displayBounds.height) <= delta
    return matchesX && matchesY && matchesW && matchesH
  }

  private isRealWindow(meta: WindowTargetSummary, displayBounds?: Rectangle): boolean {
    if (this.isTargetOverlay(meta.id)) {
      return false
    }
    if (meta.isMinimized || meta.isOnScreen === false) {
      return false
    }
    if (!displayBounds) {
      return true
    }
    const tooSmall = meta.bounds.width < 60 || meta.bounds.height < 60
    const farOutside = meta.bounds.width === 0 || meta.bounds.height === 0
    const systemLayer = typeof meta.layer === 'number' && meta.layer > 0
    return !tooSmall && !farOutside && !systemLayer
  }

  private areBoundsEqual(a: Rectangle, b: Rectangle): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  }

  private applyViewport(bounds: Rectangle): Rectangle {
    const viewport = this.config.viewport ?? defaultDockConfig.viewport
    const width = Math.max(0, bounds.width)
    const height = Math.max(0, bounds.height)
    const left = bounds.x + width * viewport.left
    const right = bounds.x + width * viewport.right
    const top = bounds.y + height * viewport.top
    const bottom = bounds.y + height * viewport.bottom

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(1, Math.round(right - left)),
      height: Math.max(1, Math.round(bottom - top)),
    }
  }

  private applyPadding(bounds: Rectangle): Rectangle {
    const padding = this.config.padding ?? 0
    if (!padding) {
      return bounds
    }
    return {
      x: Math.round(bounds.x - padding),
      y: Math.round(bounds.y - padding),
      width: Math.max(1, Math.round(bounds.width + padding * 2)),
      height: Math.max(1, Math.round(bounds.height + padding * 2)),
    }
  }

  private syncOverlay(bounds: Rectangle) {
    if (this.overlayWindow.isDestroyed()) {
      return
    }

    const viewportBounds = this.applyViewport(bounds)
    const paddedBounds = this.applyPadding(viewportBounds)

    this.overlayWindow.setBounds(paddedBounds, false)
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    if ('showInactive' in this.overlayWindow && typeof this.overlayWindow.showInactive === 'function') {
      this.overlayWindow.showInactive()
    }
    else {
      this.overlayWindow.show()
    }

    this.syncMouseEvents()
  }

  private hideOverlay(force = false) {
    if (this.overlayWindow.isDestroyed()) {
      return
    }
    if (this.isTargetOverlay(this.targetId)) {
      return
    }
    if (!force && !(this.config.hideWhenInactive ?? defaultDockConfig.hideWhenInactive)) {
      return
    }
    this.overlayWindow.hide()
  }

  private restoreMouseEvents() {
    if (this.overlayWindow.isDestroyed()) {
      return
    }
    this.overlayWindow.setIgnoreMouseEvents(false)
    this.mouseEventsIgnored = false
  }

  private syncMouseEvents() {
    if (this.overlayWindow.isDestroyed()) {
      return
    }
    const shouldIgnore = this.config.clickThrough ?? defaultDockConfig.clickThrough
    if (shouldIgnore && !this.mouseEventsIgnored) {
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      this.mouseEventsIgnored = true
    }
    if (!shouldIgnore && this.mouseEventsIgnored) {
      this.overlayWindow.setIgnoreMouseEvents(false)
      this.mouseEventsIgnored = false
    }
  }

  private lowerOverlay() {
    if (this.overlayWindow.isDestroyed()) {
      return
    }
    this.overlayWindow.setAlwaysOnTop(false)
  }

  private captureOverlayBaseline() {
    if (this.overlayWindow.isDestroyed()) {
      return
    }
    this.overlayBaseline = {
      visible: this.overlayWindow.isVisible(),
      alwaysOnTop: this.overlayWindow.isAlwaysOnTop(),
    }
  }

  private restoreOverlayBaseline() {
    if (!this.overlayBaseline || this.overlayWindow.isDestroyed()) {
      return
    }

    if (this.overlayBaseline.visible) {
      if ('showInactive' in this.overlayWindow && typeof this.overlayWindow.showInactive === 'function') {
        this.overlayWindow.showInactive()
      }
      else {
        this.overlayWindow.show()
      }
    }
    else {
      this.overlayWindow.hide()
    }

    this.overlayWindow.setAlwaysOnTop(this.overlayBaseline.alwaysOnTop)
  }

  private isTargetOverlay(targetId?: string): boolean {
    if (!targetId) {
      return false
    }
    return this.overlayIdSet.has(targetId)
  }
}
