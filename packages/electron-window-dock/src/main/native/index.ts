import type { WindowMeta, WindowTracker } from '../window-tracker'

import process from 'node:process'

import { MacOSWindowTracker } from './macos'
import { WindowsWindowTracker } from './windows'

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
}
