import type { DockModeConfig, DockModeStatus, DockPosition, TargetWindowBounds } from '@proj-airi/electron-eventa'
import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, DesktopCapturerSource } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { dockModeStatusChanged, dockModeTargetBounds } from '@proj-airi/electron-eventa'
import { desktopCapturer } from 'electron'

import { electron } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { createWindowBoundsPoller } from './window-bounds-provider'

function calculateDockedPosition(
  targetBounds: TargetWindowBounds,
  airiSize: { width: number, height: number },
  position: DockPosition,
  offset: { x: number, y: number },
): { x: number, y: number } {
  switch (position) {
    case 'right':
      return {
        x: targetBounds.x + targetBounds.width + offset.x,
        y: targetBounds.y + offset.y,
      }
    case 'left':
      return {
        x: targetBounds.x - airiSize.width + offset.x,
        y: targetBounds.y + offset.y,
      }
    case 'top':
      return {
        x: targetBounds.x + offset.x,
        y: targetBounds.y - airiSize.height + offset.y,
      }
    case 'bottom':
      return {
        x: targetBounds.x + offset.x,
        y: targetBounds.y + targetBounds.height + offset.y,
      }
  }
}

export function createDockModeService(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
}) {
  let currentPoller: { stop: () => void } | null = null
  let currentStatus: DockModeStatus = { active: false }
  let currentConfig: DockModeConfig | null = null

  function stopDocking(): DockModeStatus {
    if (currentPoller) {
      currentPoller.stop()
      currentPoller = null
    }
    currentConfig = null
    currentStatus = { active: false }
    params.context.emit(dockModeStatusChanged, currentStatus)
    return currentStatus
  }

  onAppWindowAllClosed(() => stopDocking())
  onAppBeforeQuit(() => stopDocking())

  // List desktop windows via desktopCapturer
  defineInvokeHandler(params.context, electron.dockMode.listWindows, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 160, height: 120 },
    })

    return sources
      // exclude our own window
      .filter((source: DesktopCapturerSource) => !source.id.includes(String(params.window.id)))
      .map((source: DesktopCapturerSource) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail && !source.thumbnail.isEmpty()
          ? source.thumbnail.toDataURL()
          : undefined,
      }))
  })

  // Start dock mode
  defineInvokeHandler(params.context, electron.dockMode.start, (config: DockModeConfig | undefined) => {
    if (!config)
      return currentStatus

    // Stop any existing dock
    if (currentPoller) {
      currentPoller.stop()
      currentPoller = null
    }

    currentConfig = config

    const poller = createWindowBoundsPoller(config.targetWindowId, (targetBounds) => {
      if (!targetBounds) {
        // Target window is gone, stop docking
        stopDocking()
        return
      }

      params.context.emit(dockModeTargetBounds, targetBounds)

      // Move our window to match
      const airiSize = params.window.getBounds()
      const newPos = calculateDockedPosition(
        targetBounds,
        { width: airiSize.width, height: airiSize.height },
        currentConfig!.position,
        currentConfig!.offset,
      )

      params.window.setPosition(newPos.x, newPos.y, false)
    })

    if (!poller) {
      currentStatus = { active: false }
      params.context.emit(dockModeStatusChanged, currentStatus)
      return currentStatus
    }

    currentPoller = poller
    currentStatus = {
      active: true,
      targetWindowId: config.targetWindowId,
      position: config.position,
    }
    params.context.emit(dockModeStatusChanged, currentStatus)
    return currentStatus
  })

  // Stop dock mode
  defineInvokeHandler(params.context, electron.dockMode.stop, () => {
    return stopDocking()
  })

  // Get current status
  defineInvokeHandler(params.context, electron.dockMode.getStatus, () => {
    return currentStatus
  })
}
