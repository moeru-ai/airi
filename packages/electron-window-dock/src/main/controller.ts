import type { BrowserWindow, Rectangle } from 'electron'

import type { DockConfig, DockDebugState, DockModeState, WindowTargetSummary } from '..'
import type { WindowMeta, WindowTracker } from './window-tracker'

import process from 'node:process'

import { useLogg } from '@guiiai/logg'
import { merge } from '@moeru/std'
import { screen } from 'electron'
import { boolean, check, getDotPath, integer, maxValue, minValue, number, object, partial, pipe, safeParse } from 'valibot'

import { defaultDockConfig } from '..'
import { getOverlayWindowIds } from './window-ids'

/** The overlay window methods that the controller calls. A `BrowserWindow` has all of them. */
export type OverlayWindow = Pick<
  BrowserWindow,
  'id' | 'destroy' | 'getNativeWindowHandle' | 'getTitle' | 'hide' | 'isDestroyed' | 'setAlwaysOnTop' | 'setBounds' | 'setIgnoreMouseEvents' | 'showInactive'
>

export interface DockControllerOptions {
  /**
   * Creates the overlay window. The controller calls it on the first `start()` of a session.
   * The window must be hidden when the promise resolves.
   *
   * The controller aborts `signal` when the creation takes longer than 30 s ({@link OVERLAY_CREATION_TIMEOUT_MS}).
   * Then `start()` fails, and the function must destroy its window.
   */
  createOverlayWindow: (signal: AbortSignal) => Promise<OverlayWindow>
  tracker: WindowTracker
}

interface Overlay {
  window: OverlayWindow
  /** Every ID under which a tracker can report the overlay. It exists only after the window exists. */
  ids: Set<string>
}

/**
 * The time limit for one `createOverlayWindow` call, in ms. A call creates a window and loads one renderer page.
 * Without a limit, a page load that does not finish keeps `start()` pending and keeps a hidden window.
 * The value is a chosen limit, not a measured load time.
 */
const OVERLAY_CREATION_TIMEOUT_MS = 30_000

/** Windows narrower or shorter than this (in DIP) are treated as tool/popup windows, not real occluders. */
const MIN_REAL_WINDOW_DIMENSION = 60

/**
 * The longest poll interval. `setTimeout` runs a delay above 2^31 - 1 ms at once,
 * so an unbounded value can make the loop poll without a pause.
 */
const MAX_INTERVAL_MS = 60_000

const viewportEdgeSchema = pipe(number(), minValue(0), maxValue(1))

/**
 * A config update from IPC. A renderer can send any subset of the fields.
 * The lower limits stop a bad value, for example an empty input field, from making the loop poll without a pause.
 */
const dockConfigUpdateSchema = partial(object({
  activeIntervalMs: pipe(number(), minValue(16), maxValue(MAX_INTERVAL_MS)),
  hiddenIntervalMs: pipe(number(), minValue(100), maxValue(MAX_INTERVAL_MS)),
  burstIntervalMs: pipe(number(), minValue(16), maxValue(MAX_INTERVAL_MS)),
  burstTicks: pipe(number(), integer(), minValue(0), maxValue(100)),
  clickThrough: boolean(),
  padding: pipe(number(), minValue(0), maxValue(500)),
  hideWhenNotFrontmost: boolean(),
  hideOnHover: boolean(),
  viewport: pipe(
    object({ left: viewportEdgeSchema, right: viewportEdgeSchema, top: viewportEdgeSchema, bottom: viewportEdgeSchema }),
    check(viewport => viewport.left < viewport.right && viewport.top < viewport.bottom, 'The viewport must have left < right and top < bottom.'),
  ),
}))

const log = useLogg('window-dock').useGlobalConfig()

/** Destroys the window if it still exists. `destroy()` on a destroyed window can throw. */
function destroyWindow(window: OverlayWindow) {
  if (!window.isDestroyed()) {
    window.destroy()
  }
}

/**
 * Keeps the overlay window on the target window, and shows it only when the target is visible.
 *
 * A session starts with `start()` and ends with `stop()`, `dispose()`, a lost target, or a destroyed overlay window.
 * The overlay window exists only during a session, and the poll loop runs only during a session.
 */
export class DockController {
  private readonly createOverlayWindow: (signal: AbortSignal) => Promise<OverlayWindow>
  private readonly tracker: WindowTracker
  private overlay?: Overlay
  private overlayCreation?: Promise<Overlay | undefined>
  /**
   * True from `start()` until the session ends. An overlay that is created after the
   * session ended is destroyed at once, because `stop()` had no window to destroy.
   */
  private overlayWanted = false
  /**
   * Increases on each `start()` and at the end of each session.
   * A tick keeps the value from when it was scheduled. After each await, it stops if the value changed.
   */
  private generation = 0
  private pollHandle?: ReturnType<typeof setTimeout>
  private disposed = false
  private state: DockModeState = 'detached'
  private targetId?: string
  private config: Required<DockConfig> = defaultDockConfig
  private mouseEventsIgnored = false
  private burstTicksRemaining = 0
  private debugState: DockDebugState = {
    state: 'detached',
    pollIntervalMs: 0,
    lastUpdatedAt: Date.now(),
  }

  constructor(options: DockControllerOptions) {
    this.createOverlayWindow = options.createOverlayWindow
    this.tracker = options.tracker
  }

  /** Lists the windows that can be a target. The overlay window is not in the list. */
  async listTargets(): Promise<WindowTargetSummary[]> {
    const windows = await this.tracker.listWindows()
    const overlay = this.overlay
    if (!overlay || overlay.window.isDestroyed()) {
      return windows
    }

    const overlayTitle = overlay.window.getTitle()
    return windows.filter((candidate) => {
      if (overlay.ids.has(candidate.id)) {
        return false
      }
      // NOTICE:
      // This title filter drops the overlay if a tracker reports an ID outside `overlay.ids`.
      // No such case is verified on Windows.
      // Source: commit 701e9b695, the first Win32 version.
      // Removal condition: a Windows test shows that the ID filter alone drops the overlay.
      return candidate.ownerPid !== process.pid || candidate.title !== overlayTitle
    })
  }

  /**
   * Docks the overlay to `targetId`. The first call of a session creates the overlay window.
   * A call during a session changes the target. The overlay window stays.
   */
  async start(targetId: string): Promise<DockDebugState> {
    if (this.disposed) {
      return this.getDebugState()
    }

    // The new value also stops a tick that is waiting for the tracker.
    const generation = ++this.generation
    this.overlayWanted = true

    let overlay: Overlay | undefined
    try {
      overlay = await this.ensureOverlay()
    }
    catch (error) {
      if (generation === this.generation) {
        this.endSession('detached', 'overlay-failed')
      }
      throw error
    }

    // A later `start()`, `stop()`, or `dispose()` ran during the overlay creation. That call sets the state.
    if (generation !== this.generation || !overlay) {
      return this.getDebugState()
    }

    if (overlay.ids.has(targetId)) {
      this.saveDebugState({ lastReason: 'overlay-target-blocked' })
      if (this.targetId) {
        // The new generation stopped the loop of the current session. Start it again.
        this.scheduleTick(this.debugState.pollIntervalMs)
      }
      else {
        this.releaseOverlay()
      }
      return this.getDebugState()
    }

    this.targetId = targetId
    this.state = 'docking-attached-hidden'
    this.burstTicksRemaining = this.config.burstTicks
    this.saveDebugState({ lastReason: 'target-selected', lastMeta: undefined, windowsAbove: undefined })
    this.scheduleTick(0)
    return this.getDebugState()
  }

  /** Ends the session. Stops the poll loop and destroys the overlay window. */
  stop(): DockDebugState {
    this.endSession('detached', 'stopped')
    return this.getDebugState()
  }

  /**
   * Merges a config update into the current config. The next tick uses it.
   * For an invalid update, it keeps the current config and throws an error. The message names each invalid field,
   * for example `activeIntervalMs: Invalid value: Expected >=16 but received 5`.
   */
  updateConfig(input: unknown): DockDebugState {
    const result = safeParse(dockConfigUpdateSchema, input)
    if (!result.success) {
      // An issue of the whole update, for example an update that is not an object, has no path.
      const messages = result.issues.map(issue => `${getDotPath(issue) ?? 'config'}: ${issue.message}`)
      throw new Error(messages.join('\n'))
    }

    this.config = merge(this.config, result.output)
    return this.getDebugState()
  }

  /** Returns a copy of the current config. */
  getConfig(): Required<DockConfig> {
    return { ...this.config, viewport: { ...this.config.viewport } }
  }

  getDebugState(): DockDebugState {
    return { ...this.debugState }
  }

  /** Ends the session. After this call, `start()` does nothing. */
  dispose(): void {
    this.disposed = true
    this.endSession('detached', 'disposed')
  }

  /** Returns the overlay of the session. Concurrent calls share one creation. */
  private async ensureOverlay(): Promise<Overlay | undefined> {
    if (this.overlay && !this.overlay.window.isDestroyed()) {
      return this.overlay
    }

    this.overlayCreation ??= this.createOverlay().finally(() => {
      this.overlayCreation = undefined
    })
    return this.overlayCreation
  }

  private async createOverlay(): Promise<Overlay | undefined> {
    const window = await this.createOverlayWindowInTime()
    if (!this.overlayWanted) {
      destroyWindow(window)
      return undefined
    }

    this.overlay = {
      window,
      ids: new Set(getOverlayWindowIds({ electronId: window.id, nativeHandle: window.getNativeWindowHandle() })),
    }
    this.mouseEventsIgnored = false
    return this.overlay
  }

  /**
   * Calls `createOverlayWindow` with the time limit {@link OVERLAY_CREATION_TIMEOUT_MS}.
   * At the limit, it aborts the signal of the call and rejects. The `createOverlayWindow` function destroys its window on the abort.
   * If the call still returns a window after the limit, this function destroys that window, because no session owns it.
   */
  private async createOverlayWindowInTime(): Promise<OverlayWindow> {
    const abortController = new AbortController()
    const creation = this.createOverlayWindow(abortController.signal)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`The overlay window was not created in ${OVERLAY_CREATION_TIMEOUT_MS} ms.`)
        abortController.abort(error)
        reject(error)
      }, OVERLAY_CREATION_TIMEOUT_MS)
    })

    try {
      return await Promise.race([creation, timeout])
    }
    catch (error) {
      if (abortController.signal.aborted) {
        void creation.then(
          destroyWindow,
          // The timeout error already went to `start()`. A later error of the same call adds no information.
          () => undefined,
        )
      }
      throw error
    }
    finally {
      clearTimeout(timer)
    }
  }

  private releaseOverlay() {
    this.overlayWanted = false
    const overlay = this.overlay
    this.overlay = undefined
    this.mouseEventsIgnored = false
    if (overlay) {
      destroyWindow(overlay.window)
    }
  }

  /**
   * Ends the session: no target, no poll loop, no overlay window.
   * `companion` means that the target was lost. `detached` means that a caller ended the session,
   * or that the overlay window failed or was destroyed.
   */
  private endSession(state: 'detached' | 'companion', lastReason: string) {
    this.generation++
    this.clearTimer()
    this.releaseOverlay()
    this.targetId = undefined
    this.state = state
    this.burstTicksRemaining = 0
    this.saveDebugState({
      lastReason,
      lastMeta: undefined,
      windowsAbove: undefined,
      pollIntervalMs: 0,
      lastUpdatedAt: Date.now(),
    })
  }

  private clearTimer() {
    if (this.pollHandle) {
      clearTimeout(this.pollHandle)
      this.pollHandle = undefined
    }
  }

  private scheduleTick(delayMs: number) {
    this.clearTimer()
    const generation = this.generation
    this.pollHandle = setTimeout(() => {
      this.pollHandle = undefined
      void this.runTick(generation)
    }, delayMs)
  }

  private async runTick(generation: number) {
    try {
      await this.tick(generation)
    }
    catch (error) {
      log.withError(error).error('tick failed')
    }

    // A start, a stop, a lost target, or dispose during the tick changed the generation. That call owns the loop now.
    if (generation === this.generation && this.targetId) {
      this.scheduleTick(this.debugState.pollIntervalMs)
    }
  }

  private async tick(generation: number) {
    // A tick that was scheduled before a `start()` belongs to an older generation. It must not end or change the new session.
    if (generation !== this.generation) {
      return
    }

    const targetId = this.targetId
    const overlay = this.overlay
    if (!targetId || !overlay) {
      return
    }

    // Code outside the controller closed or destroyed the overlay window. The session cannot show the overlay, so it ends.
    if (overlay.window.isDestroyed()) {
      this.endSession('detached', 'overlay-destroyed')
      return
    }

    const meta = await this.tracker.getWindowMeta(targetId)
    if (generation !== this.generation) {
      return
    }

    if (!meta) {
      this.endSession('companion', 'target-missing')
      return
    }

    const now = Date.now()
    if (!meta.isOnScreen || meta.isMinimized) {
      this.state = 'companion'
      this.hideOverlay(overlay)
      this.saveDebugState({ lastReason: 'target-hidden', lastMeta: meta, pollIntervalMs: this.config.hiddenIntervalMs, lastUpdatedAt: now })
      return
    }

    const displayBounds = meta.displayBounds ?? screen.getDisplayMatching(meta.bounds).bounds
    const above = await this.tracker.getWindowsAbove(meta.id)
    if (generation !== this.generation) {
      return
    }

    const windowsAbove = above.filter(candidate => this.isRealWindow(candidate, overlay)).length
    if (this.isFullscreen(meta, displayBounds)) {
      this.state = 'docking-attached-hidden'
      this.hideOverlay(overlay)
      this.saveDebugState({ lastReason: 'target-fullscreen', lastMeta: meta, windowsAbove, pollIntervalMs: this.config.hiddenIntervalMs, lastUpdatedAt: now })
      return
    }

    const isFrontmost = windowsAbove === 0
    if (!isFrontmost && this.config.hideWhenNotFrontmost) {
      this.state = 'docking-attached-hidden'
      this.hideOverlay(overlay)
      this.saveDebugState({ lastReason: 'not-frontmost', lastMeta: meta, windowsAbove, pollIntervalMs: this.config.hiddenIntervalMs, lastUpdatedAt: now })
      return
    }

    const becameVisible = this.state !== 'docking-attached-visible'
    const boundsChanged = this.debugState.lastMeta ? !this.areBoundsEqual(this.debugState.lastMeta.bounds, meta.bounds) : true
    if (becameVisible || boundsChanged) {
      this.burstTicksRemaining = this.config.burstTicks
    }

    this.state = 'docking-attached-visible'
    this.showOverlay(overlay, meta.bounds)

    const burstActive = this.burstTicksRemaining > 0
    if (burstActive) {
      this.burstTicksRemaining -= 1
    }
    this.saveDebugState({
      lastReason: isFrontmost ? 'visible' : 'visible-not-frontmost',
      lastMeta: meta,
      windowsAbove,
      pollIntervalMs: burstActive ? this.config.burstIntervalMs : this.config.activeIntervalMs,
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

  private isFullscreen(meta: WindowTargetSummary, displayBounds: Rectangle): boolean {
    if (typeof meta.isFullscreen === 'boolean') {
      return meta.isFullscreen
    }
    const { bounds } = meta
    // NOTICE:
    // The Win32 tracker sets no `isFullscreen`, so the controller compares the target bounds with the display bounds.
    // A tolerance of 6 DIP accepts border and rounding differences. Their size is not verified on Windows.
    // Source: `toWindowMeta` in `native/windows.ts`.
    // Removal condition: every tracker sets `isFullscreen`.
    const delta = 6
    const matchesX = Math.abs(bounds.x - displayBounds.x) <= delta
    const matchesY = Math.abs(bounds.y - displayBounds.y) <= delta
    const matchesW = Math.abs(bounds.width - displayBounds.width) <= delta
    const matchesH = Math.abs(bounds.height - displayBounds.height) <= delta
    return matchesX && matchesY && matchesW && matchesH
  }

  private isRealWindow(meta: WindowMeta, overlay: Overlay): boolean {
    if (overlay.ids.has(meta.id)) {
      return false
    }
    if (meta.isMinimized || meta.isOnScreen === false) {
      return false
    }
    const tooSmall = meta.bounds.width < MIN_REAL_WINDOW_DIMENSION || meta.bounds.height < MIN_REAL_WINDOW_DIMENSION
    const farOutside = meta.bounds.width === 0 || meta.bounds.height === 0
    const systemLayer = typeof meta.layer === 'number' && meta.layer > 0
    return !tooSmall && !farOutside && !systemLayer
  }

  private areBoundsEqual(a: Rectangle, b: Rectangle): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  }

  private applyViewport(bounds: Rectangle): Rectangle {
    const { viewport } = this.config
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
    const { padding } = this.config
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

  private showOverlay(overlay: Overlay, targetBounds: Rectangle) {
    if (overlay.window.isDestroyed()) {
      return
    }

    overlay.window.setBounds(this.applyPadding(this.applyViewport(targetBounds)), false)
    overlay.window.setAlwaysOnTop(true, 'screen-saver', 1)
    overlay.window.showInactive()
    this.syncMouseEvents(overlay)
  }

  private hideOverlay(overlay: Overlay) {
    if (overlay.window.isDestroyed()) {
      return
    }
    overlay.window.hide()
    overlay.window.setAlwaysOnTop(false)
  }

  private syncMouseEvents(overlay: Overlay) {
    const shouldIgnore = this.config.clickThrough
    if (shouldIgnore && !this.mouseEventsIgnored) {
      overlay.window.setIgnoreMouseEvents(true, { forward: true })
      this.mouseEventsIgnored = true
    }
    if (!shouldIgnore && this.mouseEventsIgnored) {
      overlay.window.setIgnoreMouseEvents(false)
      this.mouseEventsIgnored = false
    }
  }
}
