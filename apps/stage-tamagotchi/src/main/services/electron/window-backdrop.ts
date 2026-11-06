import type { BackdropClip, BackdropRegion } from '@proj-airi/electron-native-backdrop/types'
import type { BrowserWindow, Event as ElectronEvent, WebContentsDidStartNavigationEventParams } from 'electron'

import type { WindowBackdropStatus } from '../../../shared/eventa/window-backdrop'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { errorMessageFrom } from '@moeru/std'
import { NativeBackdrop } from '@proj-airi/electron-native-backdrop'
import { ipcMain } from 'electron'
import { isMacOS } from 'std-env'
import { array, check, finite, maxLength, maxValue, minLength, minValue, number, object, parse, pipe, string } from 'valibot'

import { electronWindowBackdropUpdate } from '../../../shared/eventa/window-backdrop'

const coordinate = pipe(number(), finite(), minValue(-100_000), maxValue(100_000))
const extent = pipe(number(), finite(), minValue(0), maxValue(100_000))
const clipSchema = object({ x: coordinate, y: coordinate, width: extent, height: extent, radius: extent })
const regionsSchema = object({
  regions: pipe(
    array(object({
      ...clipSchema.entries,
      id: pipe(string(), minLength(1), maxLength(128)),
      opacity: pipe(number(), finite(), minValue(0), maxValue(1)),
      clips: pipe(array(clipSchema), maxLength(8)),
    })),
    maxLength(256),
    check(regions => new Set(regions.map(region => region.id)).size === regions.length, 'Backdrop region IDs must be unique'),
  ),
})

function contentPoints(rect: BackdropClip, zoom: number): BackdropClip {
  return { x: rect.x * zoom, y: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom, radius: rect.radius * zoom }
}

/**
 * Owns one window's native material and its failure state. Navigation, renderer loss, and close remove all layers.
 * Native failures latch for this window, so animation frames cannot repeatedly call an unavailable private API.
 * Windows and Linux retain the existing CSS surfaces as a permanent platform policy.
 */
export class WindowBackdropService {
  private static readonly windows = new WeakMap<BrowserWindow, WindowBackdropService>()

  /** Registers one owner per native window, even when multiple surfaces install the base window services. */
  static install(window: BrowserWindow) {
    let service = this.windows.get(window)
    if (!service) {
      service = new WindowBackdropService(window)
      this.windows.set(window, service)
    }
    return service
  }

  private readonly log = useLogg('electron:window-backdrop').useGlobalConfig()
  private material?: NativeBackdrop
  private failure?: WindowBackdropStatus
  private closed = false

  private constructor(private readonly window: BrowserWindow) {
    // A dedicated scoped adapter prevents another renderer from changing this window's native layers.
    const { context } = createContext(ipcMain, window, { onlySameWindow: true })
    defineInvokeHandler(context, electronWindowBackdropUpdate, payload => this.update(payload))
    const contents = window.webContents
    contents.on('did-start-navigation', this.releaseOnDocumentChange)
    contents.on('render-process-gone', this.release)
    window.once('closed', () => {
      this.closed = true
      WindowBackdropService.windows.delete(window)
      this.release()
      contents.off('did-start-navigation', this.releaseOnDocumentChange)
      contents.off('render-process-gone', this.release)
    })
  }

  /**
   * A reload or a main-frame navigation replaces the page that owns the regions, so its layers go with it.
   * `did-start-loading` is not this signal. Chromium also emits it for every window on a macOS Space change,
   * and the page keeps its lowered fill while the released layers no longer draw.
   */
  private releaseOnDocumentChange = (details: ElectronEvent<WebContentsDidStartNavigationEventParams>) => {
    if (details.isMainFrame && !details.isSameDocument)
      this.release()
  }

  private release = () => {
    const material = this.material
    this.material = undefined
    if (!material)
      return
    try {
      material.dispose()
    }
    catch (error) {
      this.failure = { state: 'failed', reason: errorMessageFrom(error) ?? 'Native backdrop cleanup failed' }
      this.log.withError(error).error('Could not restore the window after native backdrop cleanup')
    }
  }

  private update(payload: { regions: BackdropRegion[] } | undefined): WindowBackdropStatus {
    let regions: BackdropRegion[]
    try {
      regions = parse(regionsSchema, payload).regions
    }
    catch (error) {
      this.release()
      throw error
    }
    if (this.closed || this.window.isDestroyed())
      throw new Error('Cannot update a closed window backdrop')
    if (!isMacOS)
      return { state: 'unsupported', reason: 'unsupported-platform' }
    if (this.failure)
      return this.failure

    const zoom = this.window.webContents.getZoomFactor()
    const nativeRegions = regions.map(region => ({
      ...contentPoints(region, zoom),
      id: region.id,
      opacity: region.opacity,
      clips: region.clips.map(clip => contentPoints(clip, zoom)),
    }))
    // Native errors terminate this window's material session. The renderer restores its existing CSS fill.
    try {
      if (!this.material && nativeRegions.length > 0)
        this.material = new NativeBackdrop(this.window.getNativeWindowHandle())
      this.material?.setRegions(nativeRegions)
      return { state: 'active' }
    }
    catch (error) {
      this.release()
      this.failure = { state: 'failed', reason: errorMessageFrom(error) ?? 'Native backdrop update failed' }
      this.log.withError(error).error('Native backdrop is unavailable for this window')
      return this.failure
    }
  }
}
