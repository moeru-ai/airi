import type { Buffer } from 'node:buffer'

import { win32HwndBufferToId } from './native/win32-window-id'

export const ELECTRON_WINDOW_ID_PREFIX = 'electron:'

export function toElectronWindowId(id: number): string {
  return `${ELECTRON_WINDOW_ID_PREFIX}${id}`
}

export interface OverlayWindowIdOptions {
  electronId: number
  /** The buffer of `BrowserWindow.getNativeWindowHandle()`. On Windows, it holds the HWND. */
  nativeHandle?: Buffer
}

/**
 * Returns every ID under which a tracker can report the overlay window.
 *
 * The Win32 tracker reports a window as `win32:<hwnd>`, so the native handle gives a `win32:` ID.
 * The function adds this ID on every platform. On other platforms, no tracker reports `win32:` IDs, so the ID matches no window.
 */
export function getOverlayWindowIds(options: OverlayWindowIdOptions): string[] {
  const { electronId, nativeHandle } = options

  const ids = new Set<string>()
  ids.add(toElectronWindowId(electronId))
  ids.add(String(electronId))

  if (nativeHandle) {
    ids.add(win32HwndBufferToId(nativeHandle))
  }

  return Array.from(ids)
}
