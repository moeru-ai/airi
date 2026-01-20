import type { BrowserWindow, Rectangle } from 'electron'

import type { DockConfig, DockDebugState, DockModeState, WindowTargetSummary } from '..'
import type { WindowTracker } from './window-tracker'

import process from 'node:process'

import { useLogg } from '@guiiai/logg'
import { screen } from 'electron'

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
}

export class DockController {
  private readonly overlayWindow: BrowserWindow
  private readonly overlayIdSet: Set<string>
  private readonly tracker: WindowTracker
  private pollHandle?: NodeJS.Timeout
  private destroyed = false
  private state: DockModeState = 'detached'
  private targetId?: string
  private config: DockConfig = { ...defaultDockConfig }
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
    this.config = { ...defaultDockConfig, ...options.config }
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
    this.config = { ...this.config, ...config }
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
    const isFrontmost = realAbove.length === 0

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

    if (!isFrontmost || isFullscreen) {
      this.state = 'docking-attached-hidden'
      this.hideOverlay()
      this.lowerOverlay()
      this.setNextInterval(this.config.hiddenIntervalMs ?? defaultDockConfig.hiddenIntervalMs)
      this.saveDebugState({
        lastReason: isFullscreen ? 'target-fullscreen' : 'not-frontmost',
        lastMeta: meta,
        windowsAbove: realAbove.length,
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
      lastReason: 'visible',
      lastMeta: meta,
      windowsAbove: realAbove.length,
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

  private syncOverlay(bounds: Rectangle) {
    if (this.overlayWindow.isDestroyed()) {
      return
    }

    const padding = this.config.padding ?? 0
    const paddedBounds = padding > 0
      ? {
          x: bounds.x - padding,
          y: bounds.y - padding,
          width: bounds.width + padding * 2,
          height: bounds.height + padding * 2,
        }
      : bounds

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
