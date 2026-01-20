import type { Buffer } from 'node:buffer'

import process from 'node:process'

import { WIN32_WINDOW_ID_PREFIX, win32HwndBufferToId } from './native/win32-window-id'

export const ELECTRON_WINDOW_ID_PREFIX = 'electron:'
export { WIN32_WINDOW_ID_PREFIX }

export function toElectronWindowId(id: number): string {
  return `${ELECTRON_WINDOW_ID_PREFIX}${id}`
}

export function toWin32WindowId(nativeHandle: Buffer): string {
  return win32HwndBufferToId(nativeHandle)
}

export interface OverlayWindowIdOptions {
  electronId: number
  nativeHandle?: Buffer
  platform?: NodeJS.Platform
}

export function getOverlayWindowIds(options: OverlayWindowIdOptions): string[] {
  const { electronId, nativeHandle } = options
  const platform = options.platform ?? process.platform

  const ids = new Set<string>()
  ids.add(toElectronWindowId(electronId))
  ids.add(String(electronId))

  if (platform === 'win32' && nativeHandle) {
    ids.add(toWin32WindowId(nativeHandle))
  }

  return Array.from(ids)
}
