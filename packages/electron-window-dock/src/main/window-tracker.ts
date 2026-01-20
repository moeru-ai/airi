import type { Rectangle } from 'electron'

import type { WindowTargetSummary } from '..'

import process from 'node:process'

import { screen } from 'electron'

import { MacOSWindowTracker } from './native/macos'
import { WindowsWindowTracker } from './native/windows'

export interface WindowMeta extends WindowTargetSummary {
  layer?: number
  alpha?: number
}

export interface WindowTracker {
  listWindows: () => Promise<WindowMeta[]>
  getWindowMeta: (windowId: string) => Promise<WindowMeta | undefined>
  getWindowsAbove: (windowId: string) => Promise<WindowMeta[]>
  getFrontmostWindow: () => Promise<WindowMeta | undefined>
}

export function createPlatformWindowTracker(): WindowTracker {
  const { platform } = process

  if (platform === 'darwin') {
    return new MacOSWindowTracker()
  }

  if (platform === 'win32') {
    return new WindowsWindowTracker()
  }

  return new NoopWindowTracker()
}

export function getDisplayBounds(bounds: Rectangle): Rectangle | undefined {
  const display = screen.getAllDisplays().find((display) => {
    const d = display.bounds
    return (
      bounds.x >= d.x
      && bounds.y >= d.y
      && bounds.x + bounds.width <= d.x + d.width
      && bounds.y + bounds.height <= d.y + d.height
    )
  })
  return display?.bounds
}

class NoopWindowTracker implements WindowTracker {
  async listWindows(): Promise<WindowMeta[]> {
    return []
  }

  async getWindowMeta(): Promise<WindowMeta | undefined> {
    return undefined
  }

  async getWindowsAbove(): Promise<WindowMeta[]> {
    return []
  }

  async getFrontmostWindow(): Promise<WindowMeta | undefined> {
    return undefined
  }
}
